import { FormEvent, useEffect, useState } from 'react';
import { api, faNumber, jsonBody, displayDate } from './api';
import { roleNames, type Role, type User } from './model';

const selectableRoles: Role[] = ['SUPER_ADMIN', 'SALES_OPERATIONS', 'LEGAL_FINANCE', 'CREDIT_APPROVER'];

export default function UsersPage({ notify }: { notify: (message: string) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);

  async function load() {
    setLoading(true); setError('');
    try { setUsers(await api<User[]>('/users')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'دریافت کاربران انجام نشد.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function toggleActive(user: User) {
    try {
      await api('/users/' + user.id, { method: 'PATCH', body: jsonBody({ isActive: !user.isActive }) });
      notify(user.isActive ? 'دسترسی کاربر غیرفعال شد.' : 'دسترسی کاربر فعال شد.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تغییر دسترسی انجام نشد.'); }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">تنظیمات دسترسی</div><h1>کاربران و نقش‌ها</h1><p>حساب‌ها شخصی هستند و هر اقدام در پرونده به نام کاربر ثبت می‌شود.</p></div><button className="btn primary" onClick={() => setCreateOpen(true)}>＋ ساخت کاربر</button></div>
    <div className="summary-strip"><div><span className="summary-icon">♧</span><div><small>کل کاربران</small><b>{faNumber(users.length)}</b></div></div><div><span className="summary-icon green">✓</span><div><small>کاربران فعال</small><b>{faNumber(users.filter((item) => item.isActive).length)}</b></div></div><div><span className="summary-icon blue">⌘</span><div><small>نقش‌های سامانه</small><b>۴ نقش</b></div></div></div>
    {error && <div className="alert error">{error}<button className="text-button" onClick={() => void load()}>تلاش دوباره</button></div>}
    <div className="table-wrap"><table className="data-table"><thead><tr><th>کاربر</th><th>نام کاربری</th><th>نقش‌ها</th><th>وضعیت</th><th>تاریخ ایجاد</th><th /></tr></thead><tbody>
      {loading ? <tr><td colSpan={6}><div className="empty-state"><span className="spinner" />در حال دریافت…</div></td></tr>
        : users.map((user) => <tr key={user.id}><td><div className="driver-cell"><span className="driver-avatar">{user.name.slice(0, 1)}</span><strong>{user.name}</strong></div></td><td>{user.username}</td><td><div className="role-tags">{user.roles.map((role) => <span key={role}>{roleNames[role]}</span>)}</div></td><td><span className={'status-pill ' + (user.isActive ? 'success' : 'muted')}>{user.isActive ? 'فعال' : 'غیرفعال'}</span></td><td className="muted-cell">{displayDate(user.createdAt)}</td><td><div className="row-actions"><button className="btn small" onClick={() => setResetUser(user)}>تغییر رمز</button><button className={'btn small ' + (user.isActive ? 'danger-ghost' : 'subtle')} onClick={() => void toggleActive(user)}>{user.isActive ? 'غیرفعال‌کردن' : 'فعال‌کردن'}</button></div></td></tr>)}
      {!loading && !users.length && <tr><td colSpan={6}><div className="empty-state">هنوز کاربری ساخته نشده است.</div></td></tr>}
    </tbody></table></div>
    {createOpen && <UserModal title="ساخت کاربر" onClose={() => setCreateOpen(false)} onSubmit={async (value) => { await api('/users', { method: 'POST', body: jsonBody(value) }); setCreateOpen(false); await load(); notify('کاربر ساخته شد.'); }} />}
    {resetUser && <PasswordModal user={resetUser} onClose={() => setResetUser(null)} onSubmit={async (password) => { await api('/users/' + resetUser.id + '/reset-password', { method: 'POST', body: jsonBody({ password }) }); setResetUser(null); notify('رمز کاربر تغییر کرد و نشست‌های قبلی بسته شدند.'); }} />}
  </div>;
}

function UserModal({ title, onClose, onSubmit }: { title: string; onClose: () => void; onSubmit: (value: { name: string; username: string; password: string; roles: Role[] }) => Promise<void> }) {
  const [name, setName] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<Role[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSubmit({ name, username, password, roles }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'ساخت کاربر انجام نشد.'); } finally { setBusy(false); }
  }
  function toggle(role: Role) { setRoles((items) => items.includes(role) ? items.filter((item) => item !== role) : [...items, role]); }
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true">
    <div className="modal-head"><div><div className="eyebrow">مدیریت حساب‌ها</div><h2>{title}</h2><p>برای هر نفر حساب جداگانه بسازید؛ رمز اولیه را امن تحویل دهید.</p></div><button className="icon-button" onClick={onClose}>×</button></div>
    <form onSubmit={submit}><div className="form-grid">
      <label className="field wide">نام و نام خانوادگی<input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">نام کاربری<input required pattern="[a-zA-Z0-9._-]{3,40}" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></label>
      <label className="field">رمز اولیه<input required minLength={12} maxLength={128} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
      <fieldset className="role-select wide"><legend>نقش‌ها <span className="optional">انتخاب چند نقش مجاز است</span></legend>{selectableRoles.map((role) => <label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={() => toggle(role)} />{roleNames[role]}</label>)}</fieldset>
    </div>{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="btn" onClick={onClose}>انصراف</button><button className="btn primary" disabled={busy || !roles.length}>{busy ? 'در حال ساخت…' : 'ساخت کاربر'}</button></div></form>
  </section></div>;
}

function PasswordModal({ user, onClose, onSubmit }: { user: User; onClose: () => void; onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSubmit(password); } catch (reason) { setError(reason instanceof Error ? reason.message : 'تغییر رمز انجام نشد.'); } finally { setBusy(false); }
  }
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal compact-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><div className="eyebrow">{user.username}</div><h2>تغییر رمز عبور</h2><p>با ثبت رمز جدید، نشست‌های قبلی کاربر بسته می‌شوند.</p></div><button className="icon-button" onClick={onClose}>×</button></div><form onSubmit={submit}><label className="field">رمز جدید<input required minLength={12} maxLength={128} type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="btn" onClick={onClose}>انصراف</button><button className="btn primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره رمز'}</button></div></form></section></div>;
}
