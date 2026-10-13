import { useEffect, useRef, useState } from 'react';
import { Languages, LayoutDashboard, History, UploadCloud, Sparkles, Play, Download, Mic2, Check, AlertCircle, Film, ArrowRight, LoaderCircle, Save, Captions, Settings2, Video, Menu, X, ChevronDown, ArrowUpRight, Clock3, CircleCheck, FolderOpen, AudioLines, ShieldCheck, Search, RefreshCw, SlidersHorizontal, Plus, Globe2, WandSparkles, MonitorPlay, LogOut, Crown } from 'lucide-react';
import { API_CONFIG_ERROR, PREVIEW_REASON, api, apiUrl, jsonBody, uploadVideo, SOURCE_LANGUAGES, languageLabel, formatTime, busyJob, fileUrl, formatUploadLimit } from './api';
import { Button, Panel, Empty, JobList, Stat, Processing, Status } from './components/UI';
import Plans from './components/Plans';
import VoicePicker from './components/VoicePicker';

const NAV = [{id:'overview',label:'Tổng quan',icon:LayoutDashboard},{id:'studio',label:'Dịch video',icon:Video},{id:'history',label:'Lịch sử',icon:History},{id:'voices',label:'Giọng đọc AI',icon:AudioLines},{id:'plans',label:'Gói dịch vụ',icon:Crown},{id:'settings',label:'Cài đặt',icon:Settings2}];
const TITLES = {plans:['Nâng cấp không gian sáng tạo.','Mở giới hạn video 1 GB với gói Pro.'],overview:['Không giới hạn ngôn ngữ.','Mang câu chuyện của bạn đến gần hơn với khán giả Việt.'],studio:['Biến video thành tiếng Việt.','Tải lên, dịch thuật và lồng tiếng — tất cả trong một quy trình.'],history:['Thư viện video của bạn.','Quản lý và tiếp tục chỉnh sửa những video đã tải lên.'],voices:['Một giọng đọc. Nhiều cảm xúc.','Tìm giọng tiếng Việt phù hợp cho câu chuyện của bạn.'],settings:['Không gian theo cách của bạn.','Kết nối dịch vụ AI và tùy chỉnh quy trình xử lý video.']};
const DEFAULT_SETTINGS = {translation_base_url:'https://api.openai.com/v1',translation_model:'gpt-4o-mini',translation_api_key:'',translation_allow_no_key:false,whisper_model:'base',default_voice:'female',default_source_language:'auto',max_upload_mb:1024,max_duration_seconds:3600};

export default function App({ user = {}, onLogout, onUserChange, preview = false }) {
  const [view,setView] = useState(new URLSearchParams(window.location.search).has('billing_order') ? 'plans' : 'studio'), [menuOpen,setMenuOpen] = useState(false);
  const [jobs,setJobs] = useState([]), [selectedId,setSelectedId] = useState(null), [job,setJob] = useState(null);
  const [health,setHealth] = useState(null), [online,setOnline] = useState(false), [reload,setReload] = useState(0);
  const [voice,setVoice] = useState('female'), [sourceLanguage,setSourceLanguage] = useState('auto');
  const [file,setFile] = useState(null), [localSource,setLocalSource] = useState(''), [dragging,setDragging] = useState(false);
  const [draft,setDraft] = useState([]), [dirty,setDirty] = useState(false), [activeSegment,setActiveSegment] = useState(-1);
  const [busy,setBusy] = useState(''), [uploadProgress,setUploadProgress] = useState(0), [notice,setNotice] = useState(null);
  const [previewing,setPreviewing] = useState(''), [sampleText,setSampleText] = useState('Xin chào! Mỗi câu chuyện đều xứng đáng được lắng nghe. Hãy cùng khám phá thế giới bằng tiếng Việt.');
  const [query,setQuery] = useState(''), [filter,setFilter] = useState('all'), [previewMode,setPreviewMode] = useState('compare');
  const [settings,setSettings] = useState(DEFAULT_SETTINGS), [settingsLoaded,setSettingsLoaded] = useState(false), [keyConfigured,setKeyConfigured] = useState(false), [removeKey,setRemoveKey] = useState(false);
  const fileInput = useRef(), sourcePlayer = useRef(), translatedPlayer = useRef(), audio = useRef(), audioURL = useRef(), dirtyRef = useRef(false), initialDefaults = useRef(false);
  const processing = busyJob(job);
  const refresh = () => setReload(value => value + 1);
  function notify(message,type='success') { setNotice({message,type}); }

  useEffect(() => {
    if (preview) return;
    let alive = true, inFlight = false;
    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const [list,status,detail,account] = await Promise.all([api('/api/jobs'),api('/api/health'),selectedId ? api(`/api/jobs/${selectedId}`) : Promise.resolve(null),api('/api/auth/me')]);
        if (alive) { setJobs(list); setHealth(status); setOnline(true); setJob(detail); onUserChange(account); }
      } catch (e) { if (alive) { setOnline(false); setNotice(current => current?.type === 'error' ? current : {type:'error',message:e.message}); } }
      finally { inFlight = false; }
    }
    poll();
    const timer = setInterval(poll,2500);
    return () => { alive = false; clearInterval(timer); };
  },[selectedId,reload]);

  useEffect(() => {
    if (job && !dirtyRef.current) { setDraft(job.segments || []); setVoice(job.voice); }
    else if (!job && !selectedId) setDraft([]);
  },[job?.id,JSON.stringify(job?.segments),job?.voice]);
  useEffect(() => { if (!file) { setLocalSource(''); return; } const objectURL = URL.createObjectURL(file); setLocalSource(objectURL); return () => URL.revokeObjectURL(objectURL); },[file]);
  useEffect(() => () => { audio.current?.pause(); if (audioURL.current) URL.revokeObjectURL(audioURL.current); },[]);
  useEffect(() => { if (!dirty) return; const warn = event => { event.preventDefault(); event.returnValue=''; }; window.addEventListener('beforeunload',warn); return () => window.removeEventListener('beforeunload',warn); },[dirty]);
  useEffect(() => {
    if (preview) return;
    let alive = true;
    api('/api/settings').then(data => { if (!alive) return; setSettings({...DEFAULT_SETTINGS,...data,translation_api_key:''}); setKeyConfigured(data.translation_key_configured); setSettingsLoaded(true); if (!initialDefaults.current) { setVoice(data.default_voice); setSourceLanguage(data.default_source_language); initialDefaults.current=true; } }).catch(() => {});
    return () => { alive=false; };
  },[]);
  useEffect(() => { if (!notice || notice.type !== 'success') return; const timer=setTimeout(() => setNotice(null),6000); return () => clearTimeout(timer); },[notice]);

  function navigate(next) { setView(next); setMenuOpen(false); }
  function canDiscard() { return !dirtyRef.current || window.confirm('Bạn có thay đổi phụ đề chưa lưu. Bỏ những thay đổi này?'); }
  function selectJob(next) {
    if (!canDiscard()) return;
    dirtyRef.current=false; setDirty(false); setDraft([]); setJob(null); setFile(null); setSourceLanguage(next.source_language || 'auto'); setSelectedId(next.id); setActiveSegment(-1); navigate('studio');
  }
  function newProject() {
    if (!canDiscard()) return;
    dirtyRef.current=false; setDirty(false); setSelectedId(null); setJob(null); setDraft([]); setFile(null); setActiveSegment(-1); setVoice(settings.default_voice); setSourceLanguage(settings.default_source_language); navigate('studio');
  }
  function chooseFile(candidate) {
    if (!candidate) return;
    if (!/\.(mp4|mov|webm)$/i.test(candidate.name)) return notify('Chỉ hỗ trợ tệp MP4, MOV và WebM.','error');
    if (!candidate.size) return notify('Tệp video đang rỗng. Hãy chọn một tệp khác.','error');
    if (candidate.size > (user.max_upload_mb || 500) * 1024 ** 2) return notify(`Video vượt giới hạn ${formatUploadLimit(user.max_upload_mb || 500)}.`,'error');
    if (!canDiscard()) return;
    dirtyRef.current=false; setDirty(false); setSelectedId(null); setJob(null); setDraft([]); setFile(candidate); setActiveSegment(-1); setNotice(null);
  }
  async function action(name,operation) { if (preview) return notify(PREVIEW_REASON,'error'); setBusy(name); setNotice(null); try { await operation(); refresh(); } catch (e) { notify(e.message,'error'); } finally { setBusy(''); } }
  function startUpload() {
    if (preview) return notify(PREVIEW_REASON,'error');
    if (!file) return;
    const needsTranslation=sourceLanguage !== 'vi';
    if (!health?.ffmpeg || !health?.whisper || !health?.tts || (needsTranslation && !health?.translation)) {
      const missing=[!health?.ffmpeg && 'FFmpeg',!health?.whisper && 'Whisper',!health?.tts && 'TTS',needsTranslation && !health?.translation && 'API dịch thuật'].filter(Boolean);
      notify(`Cần cấu hình ${missing.join(', ')} trước khi bắt đầu. Xem trang Cài đặt.`,'error'); return;
    }
    action('upload',async () => {
      const form=new FormData(); form.append('file',file); form.append('voice',voice); form.append('source_language',sourceLanguage); form.append('target_language','vi');
      setUploadProgress(0);
      const created=await uploadVideo(form,setUploadProgress);
      setSelectedId(created.id); setJob(created); setFile(null); notify('Đã tải lên. Video được đưa vào hàng đợi xử lý.');
    });
  }
  async function saveDraft() {
    const saved=await api(`/api/jobs/${selectedId}/subtitles`,jsonBody({segments:draft,voice},'PUT'));
    dirtyRef.current=false; setDirty(false); setJob(saved); setDraft(saved.segments); return saved;
  }
  function editSegment(index,field,value) { dirtyRef.current=true; setDirty(true); setDraft(items => items.map((segment,i) => i === index ? {...segment,[field]:value} : segment)); }
  function chooseVoice(next) { setVoice(next); if (job?.segments?.length && !processing) { dirtyRef.current=true; setDirty(true); } }
  async function previewVoice(next=voice) {
    if (preview) return notify(PREVIEW_REASON,'error');
    if (!sampleText.trim()) return notify('Nhập một câu để nghe thử.','error');
    setPreviewing(next); setNotice(null);
    try {
      const response=await fetch(apiUrl('/api/voices/preview'),{...jsonBody({voice:next,text:sampleText}),credentials:'include'});
      if (!response.ok) { const data=await response.json().catch(() => ({})); throw new Error(data.detail || 'Không tạo được giọng đọc.'); }
      audio.current?.pause(); if (audioURL.current) URL.revokeObjectURL(audioURL.current);
      audioURL.current=URL.createObjectURL(await response.blob()); audio.current=new Audio(audioURL.current); await audio.current.play();
    } catch (e) { notify(e.message || 'Không kết nối được dịch vụ TTS.','error'); } finally { setPreviewing(''); }
  }
  function seek(segment,index) { setActiveSegment(index); const player=translatedPlayer.current || sourcePlayer.current; if (player) { player.currentTime=segment.start; player.play().catch(() => {}); } }
  async function saveSettings(event) {
    event.preventDefault();
    await action('settings',async () => {
      const payload={...settings,translation_api_key:settings.translation_api_key || null,clear_translation_key:removeKey};
      const saved=await api('/api/settings',jsonBody(payload,'PUT'));
      setSettings({...DEFAULT_SETTINGS,...saved,translation_api_key:''}); setKeyConfigured(saved.translation_key_configured); setRemoveKey(false); setSettingsLoaded(true);
      notify('Đã lưu cấu hình. Những video tiếp theo sẽ dùng thiết lập mới.');
    });
  }
  const finished=jobs.filter(item => item.status === 'done').length;
  const active=jobs.filter(busyJob).length;
  const filteredJobs=jobs.filter(item => item.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || item.status === filter));
  const serviceItems=[['ffmpeg','FFmpeg'],['whisper','Whisper'],['translation','API dịch thuật'],['tts','Giọng AI']];
  const sourceURL=file ? localSource : job?.has_source ? fileUrl(job,'source') : '';

  return <div className="app-shell">
    {menuOpen && <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}/>}
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <button className="sidebar-brand" onClick={() => navigate('overview')}><span className="brand-symbol"><Languages size={24}/></span><span>AI Video<span>TRANSLATOR</span></span></button>
      <div className="workspace-switch"><span className="workspace-icon"><FolderOpen size={17}/></span><span>Không gian cá nhân<small>Local workspace</small></span><ShieldCheck size={15}/></div>
      <div className="nav-heading">WORKSPACE</div>
      <nav aria-label="Điều hướng chính">{NAV.map(({id,label,icon:Icon}) => <button className={`nav-item ${view === id ? 'nav-active' : ''}`} key={id} aria-label={label} onClick={() => navigate(id)}><Icon size={19}/><span>{label}</span>{id === 'history' && jobs.length > 0 && <span className="nav-count">{jobs.length}</span>}{view === id && <span className="nav-active-dot"/>}</button>)}</nav>
      <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={23}/></div><h3>Câu chuyện không biên giới</h3><p>Kết nối video của bạn với khán giả bằng phụ đề và giọng đọc tiếng Việt.</p><button onClick={newProject}>Tạo bản dịch mới <ArrowUpRight size={15}/></button></div>
      <div className="sidebar-footer"><span className={`connection-dot ${online ? 'is-online' : ''}`}/><span>{online ? 'Backend đã kết nối' : 'Backend chưa kết nối'}</span><button disabled={preview} title={preview ? PREVIEW_REASON : 'Kiểm tra lại kết nối'} aria-label="Kiểm tra lại kết nối" onClick={refresh}><RefreshCw size={13}/></button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" aria-label="Mở menu" onClick={() => setMenuOpen(true)}><Menu size={20}/></button><Languages size={19} className="header-logo"/><span className="header-name">AI Video Translator</span><span className="header-divider"/><span className="header-page">{NAV.find(item => item.id === view)?.label}</span></div><div className="topbar-right"><button className="billing-chip" onClick={() => navigate('plans')}>{preview ? 'Xem trước' : user.plan === 'pro' ? 'PRO' : 'Nâng cấp Pro'}</button><span className="local-badge"><ShieldCheck size={13}/> {preview ? 'Xem trước giao diện' : 'Chạy trên máy của bạn'}</span><button className="account-button" onClick={() => navigate('settings')}><span className="account-avatar">{preview ? '?' : user.name[0].toUpperCase()}</span><span>{preview ? 'Chưa đăng nhập' : user.name}<small>{preview ? 'Backend chưa kết nối' : user.email}</small></span><ChevronDown size={14}/></button><button className="icon-button" aria-label="Đăng xuất" title={preview ? PREVIEW_REASON : 'Đăng xuất'} disabled={preview || Boolean(busy)} onClick={() => { if (canDiscard()) action('logout', onLogout); }}><LogOut size={17}/></button></div></header>
      <main className="page-content"><div className="page-heading"><div><span className="page-eyebrow"><span/> AI-POWERED VIDEO WORKSPACE</span><h1>{TITLES[view][0]}</h1><p>{TITLES[view][1]}</p></div>{view !== 'studio' ? <Button variant="primary" onClick={newProject}><Plus size={17}/> Dịch video mới</Button> : <span className="heading-badge"><Sparkles size={14}/> Powered by AI</span>}</div>
      {preview && <div className="notice notice-preview" role="status"><AlertCircle size={18}/><div><strong>Chế độ xem trước – Backend chưa được kết nối</strong><p>{PREVIEW_REASON} Không có dữ liệu lịch sử hoặc kết quả dịch trong chế độ này.</p><p>{API_CONFIG_ERROR}</p></div></div>}
      {notice && <div className={`notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.type === 'error' ? <AlertCircle size={18}/> : <CircleCheck size={18}/>}<span>{notice.message}</span>{notice.type === 'error' && view !== 'settings' && <button onClick={() => navigate('settings')}>Cài đặt <ArrowUpRight size={13}/></button>}<button className="notice-close" aria-label="Đóng thông báo" onClick={() => setNotice(null)}><X size={16}/></button></div>}
      <div className="service-strip"><span className="service-strip-label"><Globe2 size={14}/> Dịch vụ</span>{serviceItems.map(([key,label]) => <button key={key} onClick={() => navigate('settings')} className={`service-item ${online && health?.[key] ? 'service-ready' : 'service-missing'}`}><i/>{label}<span>{online ? health?.[key] ? 'Sẵn sàng' : 'Cần cấu hình' : 'Chưa kết nối'}</span></button>)}</div>

      {view === 'overview' && <>
        <div className="overview-hero"><div><span className="hero-tag"><Sparkles size={14}/> VIDEO TRANSLATION STUDIO</span><h2>Video toàn cầu.<br/><span>Giọng kể Việt Nam.</span></h2><p>Whisper nhận diện, AI dịch nội dung, phụ đề và giọng đọc đồng bộ. Bắt đầu từ video trên máy tính của bạn.</p><Button variant="primary" onClick={newProject}>Bắt đầu dịch video <ArrowRight size={17}/></Button></div><div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="hero-video"><span><Film size={18}/> YOUR STORY</span><div><Play size={32}/></div><p>Xin chào, thế giới.</p><div className="hero-wave">{Array.from({length:21},(_,i) => <i key={i} style={{height:`${8 + i * 13 % 29}px`}}/>)}</div></div><span className="hero-floating floating-language"><Languages size={19}/> EN <ArrowRight size={13}/> VI</span><span className="hero-floating floating-audio"><AudioLines size={19}/> Giọng đọc AI</span></div></div>
        <div className="stats-grid"><Stat label="Tổng số video" value={preview ? '—' : jobs.length} icon={FolderOpen} note="Tệp đã tải lên"/><Stat label="Đã hoàn tất" value={preview ? '—' : finished} icon={CircleCheck} color="green" note="Xuất video thành công"/><Stat label="Đang xử lý" value={preview ? '—' : active} icon={Clock3} color="blue" note="Trong hàng đợi hoặc đang chạy"/><Stat label="Phụ đề đã tạo" value={preview ? '—' : jobs.reduce((sum,item) => sum + (item.segment_count || 0),0)} icon={Captions} color="pink" note="Số đoạn thực tế trong lịch sử"/></div>
        <Panel title="Video gần đây" icon={History} actions={<button className="text-button" onClick={() => navigate('history')}>Xem tất cả <ArrowRight size={14}/></button>}><JobList jobs={jobs.slice(0,5)} onSelect={selectJob}/></Panel>
      </>}

      {view === 'studio' && <>
        <div className="studio-layout"><div className="studio-main">
          <Panel title="Tải video lên" icon={UploadCloud} eyebrow="BƯỚC 01" actions={<span className="panel-label">MP4 · MOV · WEBM</span>} className="upload-panel">
            <div role="button" tabIndex={0} className={`dropzone ${dragging ? 'dropzone-dragging' : ''} ${file ? 'dropzone-selected' : ''}`} onClick={() => !busy && fileInput.current.click()} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !busy) { event.preventDefault(); fileInput.current.click(); } }} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) chooseFile(event.dataTransfer.files[0]); }} aria-label="Chọn hoặc kéo thả video"><div className="dropzone-icon"><UploadCloud size={30}/></div><div><h3>{file ? file.name : 'Kéo & thả video của bạn vào đây'}</h3><p>{file ? `${(file.size / 1024 ** 2).toFixed(1)} MB · Đã chọn, chưa tải lên` : <>hoặc <span>chọn tệp từ máy tính</span> để bắt đầu</>}</p><small>Tối đa {formatUploadLimit(user.max_upload_mb || 500)} · Chỉ tải video bạn lựa chọn</small></div><span className="dropzone-choose">{file ? 'Đổi video' : 'Chọn video'}<Plus size={15}/></span></div>

            <input hidden ref={fileInput} type="file" accept=".mp4,.mov,.webm" onChange={event => { chooseFile(event.target.files[0]); event.target.value=''; }}/>
            {busy === 'upload' && <div className="upload-transfer"><span>Đang tải lên máy chủ · {uploadProgress}%</span><div className="progress-track"><div style={{width:`${uploadProgress}%`}}/></div></div>}
          </Panel>
          <Panel title="Không gian xem trước" icon={MonitorPlay} eyebrow="BƯỚC 02" actions={<div className="segmented-control" aria-label="Chế độ xem video">{[['compare','So sánh'],['source','Gốc'],['translated','Bản dịch']].map(([value,label]) => <button key={value} className={previewMode === value ? 'is-active' : ''} onClick={() => setPreviewMode(value)}>{label}</button>)}</div>}>
            <div className={`video-grid video-mode-${previewMode}`}>
              {previewMode !== 'translated' && <div className="video-pane"><div className="video-pane-label"><span><Film size={13}/> Video gốc</span><span>{job?.language ? languageLabel(job.language) : languageLabel(sourceLanguage)}</span></div><div className="video-screen">{sourceURL ? <video key={sourceURL} ref={sourcePlayer} controls preload="metadata" src={sourceURL} onError={() => notify('Trình duyệt chưa hỗ trợ codec video gốc. Video xuất ra dùng MP4 H.264/AAC.','error')}/> : <Empty icon={Video} title="Video của bạn bắt đầu ở đây" description="Chọn một video để xem trước."/>}</div></div>}
              {previewMode !== 'source' && <div className="video-pane translated-pane"><div className="video-pane-label"><span><Sparkles size={13}/> Video đã dịch</span><span className="vi-label">TIẾNG VIỆT</span></div><div className="video-screen">{job?.has_output ? <video key={fileUrl(job,'video')} ref={translatedPlayer} controls preload="metadata" src={fileUrl(job,'video')} onError={() => notify('Chưa tải được bản xuất. Kiểm tra backend hoặc thử làm mới.','error')}/> : <Empty icon={WandSparkles} title={processing ? 'AI đang xử lý video' : 'Chờ bản dịch của bạn'} description={processing ? 'Video xuất sẽ xuất hiện khi xử lý thành công.' : 'Phụ đề và giọng đọc tiếng Việt sẽ được tạo sau khi bắt đầu.'}/>}</div></div>}
            </div>
            {job && <div className="preview-metadata"><div><Film size={14}/><strong>{job.name}</strong><span>{job.duration ? formatTime(job.duration) : 'Chờ đọc video'}</span></div><Status job={job}/></div>}
            {job?.has_output && !job.output_current && <div className="stale-output"><AlertCircle size={14}/> Bản xem trước hiện tại là lần xuất trước. Xuất lại để áp dụng nội dung mới.</div>}
            <Processing job={job} loading={busy === 'retry'} onRetry={() => action('retry',async () => { if (!canDiscard()) return; dirtyRef.current=false; setDirty(false); setJob(await api(`/api/jobs/${job.id}/retry`,{method:'POST'})); })}/>
          </Panel>
        </div><div className="studio-options"><Panel title="Thiết lập bản dịch" icon={SlidersHorizontal}><div className="translation-options"><label className="field-label">Ngôn ngữ gốc<select disabled={Boolean(job) || processing || Boolean(busy)} value={sourceLanguage} onChange={event => setSourceLanguage(event.target.value)}>{SOURCE_LANGUAGES.map(([code,label]) => <option value={code} key={code}>{label}</option>)}</select></label><div className="language-direction"><ArrowRight size={14}/></div><label className="field-label">Ngôn ngữ đích<select value="vi" disabled={processing || Boolean(busy)} onChange={() => {}}><option value="vi">🇻🇳 Tiếng Việt</option></select></label><p className="field-help">Phiên bản hiện tại hỗ trợ đầu ra tiếng Việt.</p><div className="option-divider"/><label className="field-label voice-field-label"><Mic2 size={14}/> Giọng lồng tiếng AI</label><VoicePicker value={voice} onChange={chooseVoice} onPreview={previewVoice} previewing={previewing} previewDisabled={preview} disabled={processing || Boolean(busy)}/><div className="translation-summary"><span><Check size={13}/> Nhận diện lời nói bằng Whisper</span><span><Check size={13}/> Tạo phụ đề theo thời gian</span><span><Check size={13}/> Lồng giọng Việt nam / nữ</span></div><Button variant="primary" className="start-translation" loading={busy === 'upload'} disabled={preview || !file || !online || Boolean(busy)} title={preview ? PREVIEW_REASON : undefined} onClick={startUpload}><Sparkles size={17}/> {busy === 'upload' ? 'Đang tải video…' : 'Bắt đầu dịch video'}<ArrowRight size={15}/></Button><p className="translation-footnote">{preview ? PREVIEW_REASON : <>Video lưu trên máy. Nội dung văn bản gửi đến API dịch và dịch vụ giọng đọc.</>}</p></div></Panel><div className="studio-tip"><span><ShieldCheck size={19}/></span><div><h3>Nội dung của bạn, quyền của bạn</h3><p>Tải video từ máy tính để tạo phụ đề và lồng tiếng Việt. Hỗ trợ MP4, MOV và WebM.</p></div></div></div></div>
        <Panel title="Chỉnh sửa phụ đề" icon={Captions} eyebrow="BƯỚC 03" className="subtitle-panel" actions={<><span className="subtitle-count">{draft.length} đoạn{dirty && <i> Chưa lưu</i>}</span><Button loading={busy === 'save'} disabled={!dirty || !draft.length || processing || Boolean(busy)} onClick={() => action('save',async () => { await saveDraft(); notify('Đã lưu phụ đề. Xuất lại để áp dụng vào video.'); })}><Save size={14}/> Lưu thay đổi</Button></>}>
          {!draft.length ? <Empty icon={Captions} title="Mỗi câu đều có một chỗ đứng" description="Phụ đề nhận diện và bản dịch sẽ xuất hiện ở đây. Bạn có thể chỉnh nội dung và thời gian trước khi xuất."/> : <div className="subtitle-table-wrap"><table className="subtitle-table"><thead><tr><th>#</th><th>Bắt đầu (giây)</th><th>Kết thúc (giây)</th><th>Nội dung tiếng Việt <span>/ Nguyên bản</span></th></tr></thead><tbody>{draft.map((segment,index) => <tr key={index} className={activeSegment === index ? 'segment-active' : ''}><td><button className="segment-number" aria-label={`Phát đoạn ${index+1}`} onClick={() => seek(segment,index)}>{String(index+1).padStart(2,'0')}<Play size={10}/></button></td><td><input aria-label={`Bắt đầu đoạn ${index+1}`} type="number" step="0.01" min="0" value={segment.start} disabled={processing || Boolean(busy)} onChange={event => editSegment(index,'start',event.target.value === '' ? '' : Number(event.target.value))}/></td><td><input aria-label={`Kết thúc đoạn ${index+1}`} type="number" step="0.01" min="0" value={segment.end} disabled={processing || Boolean(busy)} onChange={event => editSegment(index,'end',event.target.value === '' ? '' : Number(event.target.value))}/></td><td><textarea aria-label={`Nội dung tiếng Việt đoạn ${index+1}`} rows={2} disabled={processing || Boolean(busy)} value={segment.text} onChange={event => editSegment(index,'text',event.target.value)}/><p className="original-caption">{segment.original}</p></td></tr>)}</tbody></table></div>}
          <div className="export-toolbar"><div><span className="export-icon"><Download size={19}/></span><span><strong>Sẵn sàng cho câu chuyện mới</strong><small>{dirty ? 'Lưu phụ đề trước khi tải SRT/TXT.' : 'MP4 có phụ đề và giọng AI tiếng Việt.'}</small></span></div><div className="export-buttons">{job?.has_subtitles && <><a className={`button button-secondary ${dirty || processing ? 'link-disabled' : ''}`} aria-disabled={dirty || processing} onClick={event => { if (dirty || processing) event.preventDefault(); }} href={fileUrl(job,'srt',true)}><Captions size={15}/> Tải SRT</a><a className={`button button-secondary ${dirty || processing ? 'link-disabled' : ''}`} aria-disabled={dirty || processing} onClick={event => { if (dirty || processing) event.preventDefault(); }} href={fileUrl(job,'txt',true)}><Download size={14}/> TXT</a></>}<Button variant="primary" loading={busy === 'export'} disabled={!draft.length || processing || Boolean(busy)} onClick={() => action('export',async () => { if (dirty) await saveDraft(); setJob(await api(`/api/jobs/${job.id}/export`,{method:'POST'})); notify('Đã đưa video vào hàng đợi xuất MP4.'); })}><Film size={15}/> Xuất video MP4</Button>{job?.has_output && <a className="button button-secondary" href={fileUrl(job,'video',true)}><Download size={15}/> Tải MP4</a>}</div></div>
        </Panel>
      </>}

      {view === 'history' && <Panel title="Tất cả video" icon={FolderOpen} actions={<span className="panel-label">{jobs.length} VIDEO</span>}><div className="history-controls"><label className="search-input"><Search size={17}/><input aria-label="Tìm video" placeholder="Tìm kiếm tên video…" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Lọc trạng thái video" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="done">Hoàn tất</option><option value="processing">Đang xử lý</option><option value="queued">Đang chờ</option><option value="edited">Đã chỉnh sửa</option><option value="error">Có lỗi</option></select><Button disabled={preview} title={preview ? PREVIEW_REASON : undefined} onClick={refresh}><RefreshCw size={15}/> Làm mới</Button></div>{filteredJobs.length ? <JobList jobs={filteredJobs} onSelect={selectJob}/> : <Empty icon={Search} title={jobs.length ? 'Không tìm thấy video' : 'Thư viện đang chờ câu chuyện đầu tiên'} description={jobs.length ? 'Thử một tên khác hoặc đổi bộ lọc trạng thái.' : 'Video của bạn sẽ được lưu tại đây sau khi tải lên.'}><Button variant="primary" onClick={newProject}><Plus size={15}/> Dịch video mới</Button></Empty>}</Panel>}

      {view === 'voices' && <div className="voices-page"><Panel title="Thư viện giọng tiếng Việt" icon={Mic2} actions={<span className="panel-label">2 GIỌNG ĐỌC</span>}><div className="voice-library-content"><p className="section-description">Giọng đọc AI trực tuyến cho thuyết minh, hướng dẫn và những câu chuyện của bạn.</p><VoicePicker full previewDisabled={preview} disabled={processing || Boolean(busy)} value={voice} onChange={chooseVoice} onPreview={previewVoice} previewing={previewing}/></div></Panel><Panel title="Nghe thử với nội dung của bạn" icon={AudioLines}><div className="voice-sample"><label className="field-label">Nội dung tiếng Việt<textarea rows={5} maxLength={500} value={sampleText} onChange={event => setSampleText(event.target.value)} placeholder="Nhập nội dung bạn muốn nghe…"/></label><div className="sample-footer"><span>{sampleText.length}/500 ký tự</span><Button variant="primary" loading={Boolean(previewing)} onClick={() => previewVoice(voice)} disabled={preview || !sampleText.trim()} title={preview ? PREVIEW_REASON : undefined}><Play size={15}/> Nghe thử {voice === 'female' ? 'Hoài My' : 'Nam Minh'}</Button></div><p className="field-help">{preview ? PREVIEW_REASON : 'Đây là âm thanh được tạo thật qua dịch vụ TTS. Cần kết nối Internet.'}</p></div></Panel></div>}

      {view === 'plans' && (preview ? <Panel title="Gói dịch vụ" icon={Crown}><Empty icon={Crown} title="Chưa kết nối backend" description="Thông tin gói dịch vụ và thanh toán chỉ có sau khi kết nối backend và đăng nhập."/></Panel> : <Plans user={user} onUserChange={onUserChange}/>)}
      {view === 'settings' && <form onSubmit={saveSettings} className="settings-layout"><div className="settings-main"><Panel title="Kết nối API dịch thuật" icon={Globe2} actions={<span className={`status-pill ${health?.translation ? 'status-done' : 'status-edited'}`}>{health?.translation ? 'Đã cấu hình' : 'Chưa cấu hình'}</span>}><fieldset disabled={preview || user.role !== 'admin'} className="settings-fields"><p className="section-description">Sử dụng dịch vụ tương thích OpenAI Chat Completions, có hỗ trợ JSON mode.</p><label className="field-label">Địa chỉ API<input type="url" required value={settings.translation_base_url} onChange={event => setSettings({...settings,translation_base_url:event.target.value})} placeholder="https://api.openai.com/v1"/></label><label className="field-label">Tên model<input required value={settings.translation_model} onChange={event => setSettings({...settings,translation_model:event.target.value})} placeholder="gpt-4o-mini"/></label><label className="field-label">API key <span>{keyConfigured ? 'Đã lưu trên backend' : 'Chưa có key'}</span><input type="password" autoComplete="new-password" value={settings.translation_api_key} onChange={event => { setRemoveKey(false); setSettings({...settings,translation_api_key:event.target.value}); }} placeholder={keyConfigured ? 'Để trống để giữ key hiện tại' : 'Nhập API key của bạn'}/></label><p className="field-help">Key lưu trong backend/.env, không trả về frontend và không commit Git.</p><label className="checkbox-field"><input type="checkbox" checked={settings.translation_allow_no_key} onChange={event => setSettings({...settings,translation_allow_no_key:event.target.checked})}/><span>API local không yêu cầu key<small>Chỉ bật khi máy chủ API của bạn thực sự không cần xác thực.</small></span></label>{keyConfigured && <label className="checkbox-field"><input type="checkbox" checked={removeKey} onChange={event => setRemoveKey(event.target.checked)}/><span>Xóa API key đã lưu</span></label>}</fieldset></Panel><Panel title="Thiết lập xử lý mặc định" icon={SlidersHorizontal}><fieldset disabled={preview || user.role !== 'admin'} className="settings-fields settings-field-grid"><label className="field-label">Model Whisper<select value={settings.whisper_model} onChange={event => setSettings({...settings,whisper_model:event.target.value})}>{['tiny','base','small','medium','large-v3'].map(model => <option key={model} value={model}>{model}{model === 'base' ? ' · Khuyên dùng cho Intel' : ''}</option>)}</select></label><label className="field-label">Giọng mặc định<select value={settings.default_voice} onChange={event => setSettings({...settings,default_voice:event.target.value})}><option value="female">Hoài My · Nữ</option><option value="male">Nam Minh · Nam</option></select></label><label className="field-label">Ngôn ngữ gốc mặc định<select value={settings.default_source_language} onChange={event => setSettings({...settings,default_source_language:event.target.value})}>{SOURCE_LANGUAGES.map(([code,label]) => <option value={code} key={code}>{label}</option>)}</select></label><label className="field-label">Giới hạn mỗi video (MB)<input type="number" min="1" max="2000" required value={settings.max_upload_mb} onChange={event => setSettings({...settings,max_upload_mb:Number(event.target.value)})}/></label><p className="field-help grid-full">Giới hạn hiện tại: {formatUploadLimit(settings.max_upload_mb)} mỗi video. 1024 MB tương ứng 1 GB trong ứng dụng.</p><label className="field-label">Thời lượng tối đa (giây)<input type="number" min="1" max="7200" required value={settings.max_duration_seconds} onChange={event => setSettings({...settings,max_duration_seconds:Number(event.target.value)})}/></label><p className="field-help grid-full">Model Whisper chạy CPU int8. Lần đầu sử dụng sẽ tải model. Thiết lập mới áp dụng cho video tiếp theo.</p></fieldset></Panel><div className="settings-save"><span>{preview ? PREVIEW_REASON : user.role === 'admin' ? 'Cấu hình chỉ thay đổi khi nhấn lưu.' : 'Chỉ quản trị viên được thay đổi cấu hình dịch vụ.'}</span><Button type="submit" variant="primary" loading={busy === 'settings'} disabled={preview || user.role !== 'admin' || !settingsLoaded || Boolean(busy) || active > 0}><Save size={16}/> Lưu cấu hình</Button></div>{active > 0 && <p className="field-help">Chờ các video đang xử lý hoàn tất trước khi thay đổi cấu hình.</p>}</div><div className="settings-side"><Panel title="Tình trạng hệ thống" icon={MonitorPlay}><div className="system-status">{serviceItems.map(([key,label]) => <div key={key}><span>{label}</span><span className={health?.[key] ? 'system-ok' : 'system-warning'}>{health?.[key] ? <Check size={14}/> : <AlertCircle size={14}/>} {health?.[key] ? 'Đã cài / cấu hình' : preview ? 'Chưa kết nối' : 'Cần thiết lập'}</span></div>)}<Button disabled={preview} title={preview ? PREVIEW_REASON : undefined} onClick={refresh}><RefreshCw size={14}/> Kiểm tra lại</Button></div></Panel><div className="setup-notes"><h3>Để xử lý video đầy đủ</h3><p><strong>01</strong> Cài Python 3.11 và các thư viện trong requirements.txt.</p><p><strong>02</strong> Cài FFmpeg bằng <code>brew install ffmpeg</code>.</p><p><strong>03</strong> Lưu API dịch ở biểu mẫu bên trái. TTS dùng dịch vụ trực tuyến.</p><p className="setup-note-footer">Trạng thái sẵn sàng cho biết đã cài hoặc cấu hình, chưa xác nhận hạn mức API hay kết nối dịch vụ.</p></div></div></form>}
      <footer className="page-footer"><span><Languages size={13}/> AI Video Translator</span><span>Được tạo cho những câu chuyện không biên giới.</span><span>Local workspace · v1.0</span></footer>
      </main>
    </div>
  </div>;
}
