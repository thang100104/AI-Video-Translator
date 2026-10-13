import { useEffect, useState } from 'react';
import { LoaderCircle, Languages, RefreshCw } from 'lucide-react';
import { api, jsonBody } from './api';
import App from './App';
import Auth from './components/Auth';
import { Button } from './components/UI';

export default function SessionApp() {
  const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(() => {
    let alive=true;setLoading(true);setError('');
    api('/api/auth/me').then(data => {if(alive)setUser(data);}).catch(e => {if(alive){if(e.status === 401)setUser(null);else setError(e.message);}}).finally(() => {if(alive)setLoading(false);});
    return () => {alive=false;};
  },[retry]);
  useEffect(() => {const expired=() => setUser(null);window.addEventListener('auth-expired',expired);return () => window.removeEventListener('auth-expired',expired);},[]);
  async function logout() {await api('/api/auth/logout',jsonBody({}));setUser(null);}
  if(loading || error) return <div className="session-loading"><span className="brand-symbol"><Languages size={25}/></span>{loading ? <><LoaderCircle className="animate-spin" size={23}/><p>Đang kiểm tra phiên đăng nhập…</p></> : <><p role="alert">{error}</p><Button onClick={() => setRetry(value => value+1)}><RefreshCw size={15}/> Kết nối lại</Button></>}</div>;
  return user ? <App key={user.id} user={user} onLogout={logout} onUserChange={setUser}/> : <Auth onAuthenticated={setUser}/>;
}
