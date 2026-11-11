import { useEffect, useState } from 'react';
import { api } from './api';
import AuditPage from './AuditPage';
import AuthScreen from './AuthScreen';
import DriverPanel from './DriverPanel';
import DriversPage from './DriversPage';
import LoadingIndicator from './LoadingIndicator';
import UsersPage from './UsersPage';
import SupplierSettlementsPage from './SupplierSettlementsPage';
import { can, roleNames, type Stage, type User } from './model';

type Section = 'flow' | 'drivers' | 'users' | 'archive' | 'audit' | 'supplier-settlements';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.localStorage.getItem('sababar-theme') === 'dark' ? 'dark' : 'light');
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>('flow');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<'flow' | 'dossier'>('flow');
  const [flowStage, setFlowStage] = useState<Stage | ''>('');
  const [driversRefresh, setDriversRefresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [bootError, setBootError] = useState('');

  async function loadSession() {
    setBootError('');
    try {
      const status = await api<{ initialized: boolean }>('/auth/setup-status');
      setInitialized(status.initialized);
      if (status.initialized) {
        try { setUser(await api<User>('/auth/me')); } catch { setUser(null); }
      }
    } catch (error) {
      setBootError(error instanceof Error ? error.message : 'اتصال به API برقرار نشد.');
    }
  }

  useEffect(() => { void loadSession(); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('sababar-theme', theme);
  }, [theme]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3500);
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } finally { setUser(null); }
  }

  if (initialized === null) {
    return <main className="boot-screen"><img src="/sababar-logo.png" alt="" /><h1>در حال اتصال به سامانه</h1><LoadingIndicator label="در حال آماده‌سازی فضای کار شما…" />{bootError && <><p>{bootError}</p><button className="btn" onClick={() => void loadSession()}>تلاش دوباره</button></>}</main>;
  }
  if (!user) return <AuthScreen initialized={initialized} onLogin={setUser} />;

  const isAdmin = can(user, 'SUPER_ADMIN');
  const viewingDossier = Boolean(selectedId && panelMode === 'dossier');
  const title = viewingDossier ? 'پرونده راننده' : section === 'flow' ? 'گردش فروش' : section === 'drivers' ? 'پرونده رانندگان' : section === 'users' ? 'مدیریت کاربران' : section === 'audit' ? 'گزارش رویدادها' : section === 'supplier-settlements' ? 'تسویه با تأمین‌کنندگان' : 'آرشیو پرونده‌ها';
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand"><img src="/sababar-logo.png" alt="صبابار" /><div><strong>صبابار</strong><small>مدیریت فروش و پرونده رانندگان</small></div></div>
        <div className="nav-caption">فضای کاری</div>
        <nav>
          <button className={section === 'flow' ? 'nav-item active' : 'nav-item'} onClick={() => { setSection('flow'); setSelectedId(null); setFlowStage(''); }}><span className="nav-icon">↗</span>گردش فروش</button>
          <button className={section === 'drivers' ? 'nav-item active' : 'nav-item'} onClick={() => { setSection('drivers'); setSelectedId(null); }}><span className="nav-icon">♙</span>رانندگان</button>
          <button className={section === 'archive' ? 'nav-item active' : 'nav-item'} onClick={() => { setSection('archive'); setSelectedId(null); }}><span className="nav-icon">▣</span>آرشیو</button>
          {can(user, 'LEGAL_FINANCE') && <button className={section === 'supplier-settlements' ? 'nav-item active' : 'nav-item'} onClick={() => { setSection('supplier-settlements'); setSelectedId(null); }}><span className="nav-icon">↔</span>تسویه با تأمین‌کنندگان</button>}
          {isAdmin && <><div className="nav-caption second">مدیریت سامانه</div><button className={section === 'users' ? 'nav-item active' : 'nav-item'} onClick={() => { setSection('users'); setSelectedId(null); }}><span className="nav-icon">♧</span>کاربران و دسترسی‌ها</button><button className={section === 'audit' ? 'nav-item active' : 'nav-item'} onClick={() => { setSection('audit'); setSelectedId(null); }}><span className="nav-icon">◷</span>گزارش رویدادها</button></>}
        </nav>
        <div className="sidebar-footer"><span className="online-dot" />سامانهٔ داخلی صبابار</div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>صبابار</span><i>/</i><strong>{title}</strong></div>
          <div className="user-menu"><button className="theme-toggle" type="button" aria-pressed={theme === 'dark'} aria-label={theme === 'dark' ? 'فعال‌کردن حالت روشن' : 'فعال‌کردن حالت تاریک'} title={theme === 'dark' ? 'حالت روشن' : 'حالت تاریک'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}><svg viewBox="0 0 24 24" aria-hidden="true">{theme === 'dark' ? <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42m-9.88 9.88-1.42 1.42M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /> : <path d="M20.2 15.3A8.5 8.5 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" />}</svg><span>{theme === 'dark' ? 'روشن' : 'تیره'}</span></button><span className="user-avatar">{user.name.slice(0, 1)}</span><div><b>{user.name}</b><small>{user.roles.map((role) => roleNames[role]).join('، ')}</small></div><button className="text-button" onClick={() => void logout()}>خروج</button></div>
        </header>
        <section className="page-content">
          {viewingDossier && selectedId
            ? <DriverPanel driverId={selectedId} viewMode="dossier" user={user} notify={flash} onClose={() => setSelectedId(null)} onChanged={() => setDriversRefresh((version) => version + 1)} />
            : section === 'users' && isAdmin
              ? <UsersPage notify={flash} />
              : section === 'audit' && isAdmin ? <AuditPage />
              : section === 'supplier-settlements' && can(user, 'LEGAL_FINANCE') ? <SupplierSettlementsPage notify={flash} />
              : <DriversPage refreshToken={driversRefresh} mode={section === 'archive' ? 'archive' : section === 'drivers' ? 'drivers' : 'flow'} user={user} notify={flash} selectedStage={flowStage} onStageChange={setFlowStage} onOpen={(id, view) => { setPanelMode(view || (section === 'flow' ? 'flow' : 'dossier')); setSelectedId(id); }} />}
        </section>
      </main>
      {selectedId && panelMode === 'flow' && <DriverPanel driverId={selectedId} viewMode={panelMode} user={user} notify={flash} onClose={() => setSelectedId(null)} onChanged={(stage) => { setDriversRefresh((version) => version + 1); if (stage && panelMode === 'flow') setFlowStage(stage === 'COMPLETED' ? '' : stage); }} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
