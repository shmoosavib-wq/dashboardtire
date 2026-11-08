import { FormEvent, useState } from 'react';
import { api, jsonBody } from './api';
import type { User } from './model';

export default function AuthScreen({ initialized, onLogin }: { initialized: boolean; onLogin: (user: User) => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      if (!initialized) {
        await api('/auth/bootstrap', { method: 'POST', body: jsonBody({ name, username, password, bootstrapToken }) });
      }
      const user = await api<User>('/auth/login', { method: 'POST', body: jsonBody({ username, password }) });
      onLogin(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ورود انجام نشد.');
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <img src="/sababar-logo.png" alt="صبابار" />
        <div><span>مدیریت فروش و پرونده رانندگان</span><h1>همهٔ مراحل،<br />در یک پرونده.</h1><p>پیگیری فروش، مدارک و تأییدها در یک فضای مشترک.</p></div>
        <small>صبابار · پنل داخلی</small>
      </section>
      <section className="auth-form-side">
        <form className="auth-form" onSubmit={submit}>
          <div className="eyebrow">{initialized ? 'ورود امن به سامانه' : 'راه‌اندازی اولیه'}</div>
          <h2>{initialized ? 'خوش آمدید' : 'ساخت سوپرادمین'}</h2>
          <p>{initialized ? 'با حساب سازمانی خود وارد شوید.' : 'این فرم فقط تا ساخت نخستین کاربر فعال است.'}</p>
          {!initialized && <label>توکن راه‌اندازی<input required minLength={32} autoComplete="off" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} /><small>از مدیر محیط اجرا دریافت کنید.</small></label>}
          {!initialized && <label>نام و نام خانوادگی<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
          <label>نام کاربری<input required minLength={3} maxLength={40} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label>رمز عبور<input required minLength={12} maxLength={128} type="password" autoComplete={initialized ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} /><small>حداقل ۱۲ نویسه</small></label>
          {error && <div className="alert error">{error}</div>}
          <button className="btn primary full" disabled={busy}>{busy ? 'در حال انجام…' : initialized ? 'ورود به پنل' : 'ساخت حساب و ورود'}</button>
        </form>
      </section>
    </main>
  );
}
