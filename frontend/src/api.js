export const API_BASE = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');
function checkApiConfig() {
  if (!import.meta.env.PROD) return;
  if (!API_BASE) throw new Error('Backend chưa được cấu hình. Đặt VITE_API_BASE bằng URL HTTPS của backend và triển khai lại frontend.');
  let url;
  try { url = new URL(API_BASE); }
  catch { throw new Error('VITE_API_BASE không hợp lệ. Cần URL HTTPS của backend, không thêm /api.'); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || /^127\./.test(hostname) || hostname === '0.0.0.0' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_API_BASE phải là địa chỉ gốc HTTPS của backend công khai, không dùng localhost hoặc thêm /api.');
  }
}
export const apiUrl = path => { checkApiConfig(); return API_BASE + path; };
export async function api(path, options = {}) {
  const url = apiUrl(path);
  let response;
  try { response = await fetch(url, { credentials: 'include', ...options }); }
  catch { throw new Error('Không kết nối được backend. Kiểm tra URL API, trạng thái máy chủ và cấu hình CORS.'); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail.map(item => item.msg).join('; ') : data.detail;
    const error = new Error(detail || `Yêu cầu thất bại (${response.status}).`);
    error.status = response.status;
    if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('auth-expired'));
    throw error;
  }
  if (response.status === 204) return null;
  try { return await response.json(); }
  catch { throw new Error('Backend trả dữ liệu không hợp lệ. Kiểm tra VITE_API_BASE và cấu hình máy chủ.'); }
}
export const jsonBody = (body, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function uploadVideo(form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/jobs'));
    xhr.withCredentials = true;
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText); } catch { reject(new Error('Máy chủ trả dữ liệu không hợp lệ.')); return; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(typeof data.detail === 'string' ? data.detail : 'Không tải được video.'));
    };
    xhr.onerror = () => reject(new Error('Tải lên gián đoạn. Kiểm tra kết nối backend.'));
    xhr.send(form);
  });
}
export const SOURCE_LANGUAGES = [['auto','Tự động nhận diện'],['en','Tiếng Anh'],['ja','Tiếng Nhật'],['ko','Tiếng Hàn'],['zh','Tiếng Trung'],['fr','Tiếng Pháp'],['de','Tiếng Đức'],['es','Tiếng Tây Ban Nha'],['ru','Tiếng Nga'],['th','Tiếng Thái'],['id','Tiếng Indonesia'],['vi','Tiếng Việt']];
export const languageLabel = code => SOURCE_LANGUAGES.find(([value]) => value === code)?.[1] || code || 'Chưa nhận diện';
export const formatTime = seconds => { const s = Math.max(0, seconds || 0); return `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toFixed(1).padStart(4,'0')}`; };
export const busyJob = job => ['queued','processing'].includes(job?.status);
export const fileUrl = (job, kind, attachment = false) => apiUrl(`/api/jobs/${job.id}/files/${kind}?attachment=${attachment}&v=${encodeURIComponent(job.rendered_at || job.created)}`);

export const formatUploadLimit = mb => mb >= 1024 ? `${Number((mb / 1024).toFixed(2))} GB` : `${mb} MB`;
