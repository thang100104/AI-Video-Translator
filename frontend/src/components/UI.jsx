import { Check, Circle, LoaderCircle, AlertCircle, Film, ArrowUpRight, Clock3, Captions } from 'lucide-react';
import { busyJob, formatTime, languageLabel } from '../api';
export function Button({ children, variant = 'secondary', loading, className = '', ...props }) {
  return <button {...props} type={props.type || 'button'} className={`button button-${variant} ${className}`} disabled={props.disabled || loading}>{loading && <LoaderCircle size={16} className="animate-spin"/>}{children}</button>;
}
export function Empty({ icon: Icon = Film, title, description, children }) { return <div className="empty-state"><span className="empty-icon"><Icon size={30}/></span><h3>{title}</h3><p>{description}</p>{children}</div>; }
export function Panel({ title, icon: Icon, eyebrow, actions, children, className = '' }) {
  return <section className={`panel ${className}`}><div className="panel-header"><div className="panel-title">{Icon && <span className="panel-icon"><Icon size={18}/></span>}<div>{eyebrow && <span className="panel-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div></div><div className="panel-actions">{actions}</div></div>{children}</section>;
}
const statusLabels = { queued: 'Đang chờ', processing: 'Đang xử lý', done: 'Hoàn tất', edited: 'Đã chỉnh sửa', error: 'Có lỗi' };
export function Status({ job }) { return <span className={`status-pill status-${job.status}`}>{busyJob(job) ? <LoaderCircle size={12} className="animate-spin"/> : job.status === 'done' ? <Check size={12}/> : job.status === 'error' ? <AlertCircle size={12}/> : <Circle size={10}/>} {statusLabels[job.status] || job.status}</span>; }
export function JobList({ jobs, onSelect, compact = false }) {
  if (!jobs.length) return <Empty icon={Clock3} title="Chưa có video nào" description="Tải video đầu tiên để bắt đầu. Lịch sử xử lý được lưu trên máy của bạn."/>;
  return <div className="job-list">{jobs.map(job => <button key={job.id} className="job-row" onClick={() => onSelect(job)}><span className="job-thumbnail"><Film size={23}/></span><span className="job-info"><strong>{job.name}</strong><small>{new Date(job.created).toLocaleString('vi-VN')} {!compact && `· ${languageLabel(job.language)} · ${job.duration ? formatTime(job.duration) : '—'}`}</small></span><Status job={job}/><ArrowUpRight size={17} className="job-arrow"/></button>)}</div>;
}
const phases = [['transcribe','Nhận diện'],['translate','Dịch thuật'],['tts','Lồng tiếng'],['export','Xuất video']];
export function Processing({ job, onRetry, loading }) {
  if (!job) return <div className="pipeline-idle">{phases.map(([key,label],i) => <span key={key}><i>{i+1}</i>{label}{i !== 3 && <span className="pipeline-line"/>}</span>)}</div>;
  const current = phases.findIndex(([phase]) => phase === job.phase);
  return <div className="processing"><div className="processing-top"><span>{busyJob(job) && <LoaderCircle size={15} className="animate-spin"/>}{job.stage}</span><strong>{job.progress}%</strong></div><div className="progress-track" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ xử lý video"><div style={{width: `${job.progress}%`}}/></div><div className="processing-phases">{phases.map(([key,label],i) => <span className={job.status === 'done' || i < current ? 'complete' : i === current ? 'current' : ''} key={key}>{job.status === 'done' || i < current ? <Check size={12}/> : <i>{i+1}</i>}{label}</span>)}</div>{job.error && <div className="processing-error"><AlertCircle size={17}/><p>{job.error}</p><Button loading={loading} onClick={onRetry}>Thử lại</Button></div>}</div>;
}
export function Stat({ label, value, icon: Icon, color = 'purple', note }) { return <div className={`stat-card stat-${color}`}><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><span className="stat-icon"><Icon size={23}/></span></div>; }
