import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, asciiDigits, displayDate, faDigits, faNumber, jsonBody } from './api';
import { can, stageList, type Driver, type Stage, type User } from './model';
import LoadingIndicator from './LoadingIndicator';
import TablePagination from './TablePagination';

type Mode = 'flow' | 'drivers' | 'archive';
const statusNames: Record<string, string> = {
  IN_PROGRESS: 'در حال انجام',
  AWAITING_CREDIT_APPROVAL: 'منتظر تأیید اعتبار',
  CREDIT_REJECTED: 'اعتبار رد شده',
  CREDIT_CHANGES_REQUESTED: 'نیازمند اصلاح اعتبار',
  AWAITING_INITIAL_PAYMENT: 'منتظر پرداخت اولیه',
  AWAITING_PAYMENT_CONFIRMATION: 'منتظر تأیید مالی',
  PAYMENT_CONFIRMED_AWAITING_RESERVATION: 'پرداخت تأیید شد · منتظر رزرو',
  AWAITING_LEGAL_FINANCE_APPROVAL: 'منتظر تأیید حقوقی و مالی',
  COMPLETED: 'فرایند کامل',
};
const responsible: Record<Stage, string> = {
  NEED_DECLARED: 'فروش و عملیات',
  APP_VERIFICATION: 'فروش و عملیات',
  CREDIT_REVIEW: 'فروش و عملیات / تأیید اعتبار',
  PROFORMA_PAYMENT_RESERVATION: 'فروش و عملیات / مالی',
  CONTRACT_CHEQUE: 'فروش و عملیات / حقوقی و مالی',
  DELIVERY_FINAL_DOCS: 'فروش و عملیات',
  COMPLETED: 'پایان فرایند',
};

export default function DriversPage({ mode, user, notify, onOpen, refreshToken, selectedStage, onStageChange }: {
  mode: Mode; user: User; notify: (message: string) => void; onOpen: (id: string, view?: 'flow' | 'dossier') => void; refreshToken: number;
  selectedStage: Stage | ''; onStageChange: (stage: Stage | '') => void;
}) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Stage, number>>>({});
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (mode === 'flow' && selectedStage) query.set('stage', selectedStage);
      if (mode === 'archive') query.set('archived', 'true');
      const [rows, totals] = await Promise.all([
        api<Driver[]>('/drivers?' + query.toString()),
        api<Partial<Record<Stage, number>>>('/drivers/stage-counts'),
      ]);
      setDrivers(rows); setCounts(totals);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'دریافت پرونده‌ها انجام نشد.');
    } finally { setLoading(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 160); return () => window.clearTimeout(timer); }, [search, selectedStage, mode, refreshToken]);

  const heading = mode === 'flow' ? 'پیگیری گردش فروش' : mode === 'archive' ? 'پرونده‌های آرشیوشده' : 'پرونده رانندگان';
  useEffect(() => { setPage(1); }, [search, selectedStage, mode]);

  const canCreate = mode !== 'archive' && can(user, 'SALES_OPERATIONS');
  const visibleStages = useMemo(() => stageList, []);
  const totalPages = Math.max(1, Math.ceil(drivers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageDrivers = drivers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><div className="eyebrow">مدیریت پرونده‌های فروش</div><h1>{heading}</h1><p>{mode === 'flow' ? 'با انتخاب مرحله، پرونده‌های منتظر اقدام همان بخش را ببینید.' : 'هر راننده یک پروندهٔ متمرکز برای مراحل، مدارک و تاریخچه دارد.'}</p></div>
        {canCreate && <button className="btn primary" onClick={() => setShowCreate(true)}><span>＋</span> متقاضی جدید</button>}
      </div>
      {mode === 'flow' && <div className="stage-tabs" role="tablist" aria-label="مراحل گردش فروش">
        <button className={!selectedStage ? 'stage-tab active' : 'stage-tab'} onClick={() => onStageChange('')}><b>{faNumber(Object.values(counts).reduce((sum, value) => sum + (value || 0), 0))}</b><span>همه مراحل</span></button>
        {visibleStages.map((stage, index) => <button key={stage.id} className={selectedStage === stage.id ? 'stage-tab active' : 'stage-tab'} onClick={() => onStageChange(stage.id)}><b>{faNumber(counts[stage.id] || 0)}</b><span><small>{faNumber(index + 1, { minimumIntegerDigits: 2 })}</small>{stage.compact}</span></button>)}
      </div>}
      <div className="toolbar">
        <div className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجو با نام، موبایل یا کد ملی" aria-label="جستجوی راننده" /></div>
        <div className="toolbar-note"><span className="online-dot" />{faNumber(drivers.length)} پرونده{mode === 'archive' ? ' در آرشیو' : ' در فهرست'}</div>
      </div>
      {error && <div className="alert error">{error}<button className="text-button" onClick={() => void load()}>تلاش دوباره</button></div>}
      <div className="table-wrap">
        <table className="data-table mobile-card-table driver-table">
          <thead><tr><th>#</th><th>راننده</th><th>کالا</th><th>مرحله فعلی</th><th>وضعیت اقدام</th><th>مسئول پیگیری</th><th>آخرین تغییر</th><th>اقدام</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8}><div className="empty-state"><LoadingIndicator label="در حال دریافت پرونده‌ها…" compact /></div></td></tr>
              : drivers.length === 0 ? <tr><td colSpan={8}><div className="empty-state"><div className="empty-mark">⌕</div><b>{search ? 'نتیجه‌ای پیدا نشد' : mode === 'archive' ? 'آرشیو خالی است' : selectedStage ? `پرونده‌ای در مرحلهٔ «${stageList.find((item) => item.id === selectedStage)?.compact}» نیست` : 'هنوز پرونده‌ای ثبت نشده'}</b><span>{search ? 'نام، شماره موبایل یا کد ملی دیگری را جستجو کنید.' : selectedStage ? 'برای دیدن سایر پرونده‌ها، همهٔ مراحل را انتخاب کنید.' : 'با ثبت متقاضی، پروندهٔ راننده وارد گردش فروش می‌شود.'}</span>{selectedStage && <button className="btn subtle" onClick={() => onStageChange('')}>نمایش همهٔ مراحل</button>}{canCreate && !search && !selectedStage && <button className="btn subtle" onClick={() => setShowCreate(true)}>ثبت متقاضی</button>}</div></td></tr>
              : pageDrivers.map((driver, index) => {
                const stage = stageList.find((item) => item.id === driver.currentStage);
                return <tr key={driver.id} onDoubleClick={() => onOpen(driver.id)}>
                  <td className="row-number" data-label="ردیف">{faNumber((currentPage - 1) * pageSize + index + 1)}</td><td data-label="راننده"><div className="driver-cell"><span className="driver-avatar">{driver.fullName.slice(0, 1)}</span><div><strong>{driver.fullName}</strong><small>{faDigits(driver.mobile)}{driver.nationalId ? ' · ' + faDigits(driver.nationalId) : ''}</small></div></div></td>
                  <td data-label="کالا">{driver.productHint || '—'}</td>
                  <td data-label="مرحله فعلی"><span className="stage-label"><i>{driver.currentStage === 'COMPLETED' ? '✓' : faNumber(stageList.findIndex((item) => item.id === driver.currentStage) + 1, { minimumIntegerDigits: 2 })}</i>{stage?.title || 'تکمیل‌شده'}</span></td>
                  <td data-label="وضعیت اقدام"><span className={'status-pill ' + (driver.stageStatus === 'COMPLETED' ? 'success' : driver.stageStatus.includes('REJECTED') ? 'warning' : '')}>{statusNames[driver.stageStatus] || statusNames[driver.currentStage] || driver.stageStatus}</span></td>
                  <td className="responsible-cell" data-label="مسئول پیگیری">{responsible[driver.currentStage]}</td>
                  <td className="muted-cell" data-label="آخرین تغییر">{displayDate(driver.updatedAt)}</td>
                  <td data-label="اقدام"><div className="row-actions">{mode === 'flow' && <button className="btn small row-action" onClick={() => onOpen(driver.id, 'flow')}>اقدام <span>←</span></button>}<button className="btn small" onClick={() => onOpen(driver.id, 'dossier')}>مشاهده پرونده</button></div></td>
                </tr>;
              })}
          </tbody>
        </table>
      </div>
      {!loading && drivers.length > 0 && <TablePagination page={currentPage} pageSize={pageSize} total={drivers.length} itemLabel="راننده" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      {showCreate && <CreateDriverModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); void load(); notify('پرونده متقاضی ثبت شد.'); }} />}
    </div>
  );
}

function CreateDriverModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [productHint, setProductHint] = useState('');
  const [intentNote, setIntentNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/drivers', { method: 'POST', body: jsonBody({
        fullName: fullName.trim(), mobile: asciiDigits(mobile).replace(/\D/g, ''),
        nationalId: nationalId ? asciiDigits(nationalId).replace(/\D/g, '') : undefined,
        productHint: productHint.trim() || undefined, intentNote: intentNote.trim() || undefined,
      }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت متقاضی انجام نشد.'); }
    finally { setBusy(false); }
  }

  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-driver-title">
    <div className="modal-head"><div><div className="eyebrow">شروع گردش فروش</div><h2 id="new-driver-title">ثبت متقاضی</h2><p>اطلاعات اولیه را وارد کنید؛ کالا در این مرحله اختیاری است.</p></div><button className="icon-button" onClick={onClose} aria-label="بستن">×</button></div>
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field wide">نام و نام خانوادگی *<input autoFocus required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="مثلاً رضا محمدی" /></label>
        <label className="field">شماره موبایل *<input required inputMode="tel" maxLength={11} value={faDigits(mobile)} onChange={(e) => setMobile(e.target.value)} placeholder="۰۹۱۲…" /></label>
        <label className="field">کد ملی<input inputMode="numeric" maxLength={10} value={faDigits(nationalId)} onChange={(e) => setNationalId(e.target.value)} placeholder="اختیاری" /></label>
        <label className="field wide">کالای موردنظر <span className="optional">اختیاری</span><input maxLength={160} value={productHint} onChange={(e) => setProductHint(e.target.value)} placeholder="اگر در زمان اعلام تمایل مشخص است" /></label>
        <label className="field wide">یادداشت اعلام تمایل<textarea rows={3} maxLength={1500} value={intentNote} onChange={(e) => setIntentNote(e.target.value)} placeholder="دلیل تماس یا توضیح کوتاه" /></label>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>انصراف</button><button className="btn primary" disabled={busy}>{busy ? 'در حال ثبت…' : 'ثبت متقاضی'}</button></div>
    </form>
  </section></div>;
}
