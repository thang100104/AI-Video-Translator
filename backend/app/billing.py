"""PayOS checkout. Entitlements are granted only after server-to-server verification."""
import hashlib
import hmac
import secrets
import time
from urllib.parse import urlsplit
import httpx
from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, HTTPException, Request
from . import db
from .auth import current_user, rate_limit
from .config import settings

router = APIRouter(prefix='/api/billing', tags=['Billing'])
BASE = 'https://api-merchant.payos.vn/v2/payment-requests'


def ready():
    return all((settings.payos_client_id, settings.payos_api_key, settings.payos_checksum_key))


def sign(data):
    # Checkout fields and webhook flat scalar payloads follow PayOS alphabetical canonical form.
    pairs = []
    for key in sorted(data):
        value = data[key]
        if isinstance(value, (dict, list)):
            raise HTTPException(400, 'Định dạng chữ ký không được hỗ trợ.')
        value = '' if value is None or value in ('null', 'undefined') else str(value)
        pairs.append(f'{key}={value}')
    return hmac.new(settings.payos_checksum_key.encode(), '&'.join(pairs).encode(), hashlib.sha256).hexdigest()


def gateway(method, suffix='', payload=None):
    if not ready():
        raise HTTPException(503, 'Chưa kết nối PayOS. Quản trị viên cần cấu hình ba khóa PayOS trong backend/.env.')
    try:
        response = httpx.request(method, BASE + suffix, json=payload,
            headers={'x-client-id': settings.payos_client_id, 'x-api-key': settings.payos_api_key}, timeout=20)
        response.raise_for_status()
        body = response.json()
        if body.get('code') != '00' or not isinstance(body.get('data'), dict):
            raise ValueError('Gateway rejected request')
        return body['data']
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, 'Không xác minh được PayOS. Hãy kiểm tra cấu hình hoặc thử kiểm tra lại đơn; quyền Pro chưa được thay đổi.')


def get_order(code, owner=None):
    with db.connection() as c:
        row = c.execute('SELECT * FROM payments WHERE code=?', (code,)).fetchone()
    if not row or (owner and row['owner_id'] != owner):
        raise HTTPException(404, 'Không tìm thấy đơn thanh toán.')
    return dict(row)


def reconcile(order):
    if order['status'] == 'PAID':
        return order
    data = gateway('GET', f"/{order['code']}")
    if data.get('orderCode') != order['code'] or data.get('amount') != order['amount']:
        raise HTTPException(502, 'Thông tin đơn thanh toán không khớp.')
    if order['link_id'] and data.get('id') != order['link_id']:
        raise HTTPException(502, 'Mã liên kết thanh toán không khớp.')
    status = data.get('status')
    with db.connection() as c:
        c.execute('BEGIN IMMEDIATE')
        fresh = c.execute('SELECT * FROM payments WHERE code=?', (order['code'],)).fetchone()
        if fresh['status'] != 'PAID':
            if status == 'PAID':
                if not isinstance(data.get('amountPaid'), int) or data['amountPaid'] < fresh['amount']:
                    raise HTTPException(502, 'PayOS chưa xác nhận đủ số tiền.')
                now = time.time()
                until = c.execute('SELECT pro_until FROM users WHERE id=?', (fresh['owner_id'],)).fetchone()[0]
                c.execute('UPDATE users SET pro_until=? WHERE id=?', (max(now, until) + fresh['days'] * 86400, fresh['owner_id']))
                c.execute("UPDATE payments SET status='PAID', paid_at=?, last_check=? WHERE code=?", (now, now, order['code']))
            elif status in ('PENDING', 'CANCELLED', 'EXPIRED'):
                c.execute('UPDATE payments SET status=?,last_check=? WHERE code=?', (status,time.time(),order['code']))
    if order['status'] == 'creating' and status == 'PENDING' and isinstance(data.get('id'), str):
        link = data['id']
        if not link.isalnum():
            raise HTTPException(502, 'Mã liên kết PayOS không hợp lệ.')
        with db.connection() as c:
            c.execute("UPDATE payments SET checkout_url=?,link_id=? WHERE code=? AND checkout_url IS NULL", (f'https://pay.payos.vn/web/{link}',link,order['code']))
    return get_order(order['code'])


@router.get('/plans')
def plans(user=Depends(current_user)):
    return {'ready': ready(), 'price_vnd': settings.pro_price_vnd, 'days': settings.pro_days,
            'free_max_mb': min(500, settings.max_upload_mb), 'pro_max_mb': min(1024, settings.max_upload_mb)}


@router.get('/orders')
def orders(user=Depends(current_user)):
    with db.connection() as c:
        return [dict(row) for row in c.execute('SELECT * FROM payments WHERE owner_id=? ORDER BY created DESC LIMIT 50', (user['id'],))]


@router.post('/checkout')
def checkout(request: Request, user=Depends(current_user)):
    rate_limit(request, 'checkout', 20, 3600, user['id'])
    if not ready():
        raise HTTPException(503, 'Chưa kết nối PayOS. Hãy cấu hình backend/.env trước khi nhận thanh toán.')
    base = settings.billing_frontend_url.rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.query or parsed.fragment or parsed.username:
        raise HTTPException(503, 'BILLING_FRONTEND_URL không hợp lệ.')
    if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1'):
        raise HTTPException(503, 'Trang thanh toán công khai cần HTTPS.')
    with db.connection() as c:
        c.execute('BEGIN IMMEDIATE')
        pending = c.execute("SELECT * FROM payments WHERE owner_id=? AND status IN ('creating','PENDING')", (user['id'],)).fetchone()
        if pending:
            # Preserve an uncertain creation after timeout; never issue another potentially billable order.
            if pending['checkout_url']:
                return dict(pending)
            raise HTTPException(409, 'Đơn đang được tạo hoặc cần đối soát. Dùng Kiểm tra thanh toán trước khi tạo đơn mới.')
        if settings.pro_price_vnd < 2000 or not 1 <= settings.pro_days <= 365:
            raise HTTPException(503, 'Giá hoặc thời hạn Pro không hợp lệ.')
        code = int(time.time()) * 1000000 + secrets.randbelow(1000000)
        c.execute('INSERT INTO payments (code,owner_id,amount,days,status,created) VALUES (?,?,?,?,?,?)',
                  (code,user['id'],settings.pro_price_vnd,settings.pro_days,'creating',time.time()))
    payload = {'orderCode': code, 'amount': settings.pro_price_vnd, 'description': 'AVT PRO',
               'returnUrl': f'{base}/?billing_order={code}', 'cancelUrl': f'{base}/?billing_order={code}&cancelled=1',
               'expiredAt': int(time.time()) + 1800}
    payload['signature'] = sign({key: payload[key] for key in ('amount','cancelUrl','description','orderCode','returnUrl')})
    data = gateway('POST', payload=payload)
    url = urlsplit(data.get('checkoutUrl', ''))
    if data.get('orderCode') != code or data.get('amount') != payload['amount'] or data.get('currency') != 'VND' or url.scheme != 'https' or url.netloc != 'pay.payos.vn':
        raise HTTPException(502, 'Liên kết thanh toán PayOS không hợp lệ.')
    with db.connection() as c:
        c.execute("UPDATE payments SET status='PENDING',checkout_url=?,link_id=? WHERE code=? AND status='creating'",
                  (data['checkoutUrl'],data['paymentLinkId'],code))
    return get_order(code, user['id'])


@router.post('/orders/{code}/refresh')
def refresh(code: int, request: Request, user=Depends(current_user)):
    rate_limit(request, 'payment-refresh', 120, 3600, user['id'])
    order = get_order(code, user['id'])
    if time.time() - order['last_check'] < 5:
        return order
    return reconcile(order)


@router.post('/webhook/payos')
async def webhook(request: Request):
    if not ready():
        raise HTTPException(503, 'PayOS chưa được cấu hình.')
    raw = await request.body()
    if len(raw) > 65536:
        raise HTTPException(413, 'Webhook quá lớn.')
    try:
        body = await request.json()
        data = body['data']
        signature = body['signature']
        if not isinstance(data, dict) or not isinstance(signature, str) or not hmac.compare_digest(sign(data), signature):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(400, 'Chữ ký webhook không hợp lệ.')
    try:
        order = get_order(data.get('orderCode'))
    except HTTPException as exc:
        if exc.status_code == 404:
            return {'received': True}  # PayOS webhook connection test has no local order.
        raise
    if data.get('currency') != 'VND' or data.get('amount') != order['amount']:
        raise HTTPException(400, 'Số tiền webhook không khớp.')
    await run_in_threadpool(reconcile, order)  # Also require authenticated PayOS status; redirect/webhook alone cannot grant Pro.
    return {'received': True}
