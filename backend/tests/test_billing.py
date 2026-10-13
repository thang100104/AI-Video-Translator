import time
from fastapi.testclient import TestClient
from app.main import app
from app import db, billing
from app.config import settings


def customer(client):
    client.post('/api/auth/register',json={'name':'Owner','email':'owner@test.local','password':'Strong password 123'})
    return client.post('/api/auth/register',json={'name':'Customer','email':'customer@test.local','password':'Strong password 123'}).json()


def configured(monkeypatch):
    for key in ('payos_client_id','payos_api_key','payos_checksum_key'):
        monkeypatch.setattr(settings,key,'test-secret')


def test_free_and_missing_gateway(monkeypatch):
    monkeypatch.setattr(settings,'payos_api_key','')
    with TestClient(app) as client:
        user=customer(client)
        assert user['plan']=='free' and user['max_upload_mb']==500
        assert client.post('/api/billing/checkout').status_code==503
        assert client.get('/api/billing/orders').json()==[]
        assert client.get('/api/auth/me?billing_result=paid').json()['plan']=='free'


def test_real_confirmation_idempotency_and_ownership(monkeypatch):
    configured(monkeypatch)
    codes=[]
    state={'paid':False,'wrong':False}
    def provider(method,suffix='',payload=None):
        if method=='POST':
            code=payload['orderCode'];codes.append(code)
            assert payload['amount']==49999
            assert payload['signature']==billing.sign({k:payload[k] for k in ('amount','cancelUrl','description','orderCode','returnUrl')})
            return {'orderCode':code,'amount':49999,'currency':'VND','paymentLinkId':'test-link','checkoutUrl':'https://pay.payos.vn/web/test-link'}
        return {'orderCode':codes[0],'amount':1 if state['wrong'] else 49999,'amountPaid':49999 if state['paid'] else 0,'status':'PAID' if state['paid'] else 'PENDING','id':'test-link'}
    monkeypatch.setattr(billing,'gateway',provider)
    with TestClient(app) as client:
        customer(client)
        order=client.post('/api/billing/checkout').json();code=order['code']
        assert client.post('/api/billing/checkout').json()['code']==code
        assert len(codes)==1
        assert client.get('/api/auth/me').json()['plan']=='free'
        state['paid']=True;state['wrong']=True
        assert client.post(f'/api/billing/orders/{code}/refresh').status_code==502
        assert client.get('/api/auth/me').json()['plan']=='free'
        state['wrong']=False
        assert client.post(f'/api/billing/orders/{code}/refresh').json()['status']=='PAID'
        account=client.get('/api/auth/me').json()
        assert account['plan']=='pro' and account['max_upload_mb']==1024
        assert 29.99*86400 < account['pro_until']-time.time() <= 30*86400
        client.post(f'/api/billing/orders/{code}/refresh')
        assert client.get('/api/auth/me').json()['pro_until']==account['pro_until']
        data={'orderCode':code,'amount':49999,'currency':'VND'}
        assert client.post('/api/billing/webhook/payos',json={'data':data,'signature':'invalid'}).status_code==400
        assert client.post('/api/billing/webhook/payos',json={'data':data,'signature':billing.sign(data)}).status_code==200
        assert client.get('/api/auth/me').json()['pro_until']==account['pro_until']
        client.post('/api/auth/login',json={'email':'owner@test.local','password':'Strong password 123'})
        assert client.post(f'/api/billing/orders/{code}/refresh').status_code==404


def test_expired_plan_and_renewal(monkeypatch):
    configured(monkeypatch)
    with TestClient(app) as client:
        user=customer(client)
        with db.connection() as c:
            c.execute('UPDATE users SET pro_until=? WHERE id=?',(time.time()-1,user['id']))
            c.execute("INSERT INTO payments (code,owner_id,amount,days,status,created) VALUES (1234,?,49999,30,'PENDING',?)",(user['id'],time.time()))
        assert client.get('/api/auth/me').json()['plan']=='free'
        monkeypatch.setattr(billing,'gateway',lambda *a,**kw:{'orderCode':1234,'amount':49999,'amountPaid':49999,'status':'PAID'})
        assert client.post('/api/billing/orders/1234/refresh').status_code==200
        assert client.get('/api/auth/me').json()['plan']=='pro'
