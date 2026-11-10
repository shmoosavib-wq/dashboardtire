import { FormEvent, useEffect, useState } from 'react';
import { api, displayDateTime, faNumber } from './api';
import LoadingIndicator from './LoadingIndicator';

type EventRow = {
  id: string; eventType: string; details: Record<string, unknown>; createdAt: string;
  actor?: { name: string; username: string } | null;
  driver?: { id: string; fullName: string; mobile: string } | null;
};
type AuditResult = { items: EventRow[]; total: number; page: number; pageSize: number; totalPages: number };
const labels: Record<string, string> = {
  USER_CREATED: 'ساخت کاربر', USER_UPDATED: 'تغییر دسترسی کاربر', USER_PASSWORD_RESET: 'بازنشانی رمز کاربر',
  SUPER_ADMIN_BOOTSTRAPPED: 'راه‌اندازی سوپرادمین', DRIVER_CREATED: 'ایجاد پرونده راننده',
  STAGE_DRAFT_SAVED: 'ذخیره پیش‌نویس مرحله', DOCUMENT_UPLOADED: 'بارگذاری مدرک', DOCUMENT_DELETED: 'حذف مدرک',
  DOCUMENT_DOWNLOADED: 'دریافت مدرک', DRIVER_ARCHIVED: 'آرشیو پرونده', DRIVER_RESTORED: 'بازگردانی پرونده',
  STORE_SETTLEMENT_RECORDED: 'ثبت تسویه فروشگاه', STORE_SETTLEMENT_UPDATED: 'ویرایش تسویه فروشگاه',
};
const categories = [
  ['', 'همه رویدادها'], ['workflow', 'گردش فروش'], ['documents', 'مدارک'],
  ['users', 'کاربران'], ['settlements', 'تسویه‌ها'], ['archive', 'بایگانی'],
];

export default function AuditPage() {
  const [result, setResult] = useState<AuditResult>({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    api<AuditResult>(`/audit?${params.toString()}`).then((data) => {
      if (current) setResult(data);
    }).catch((reason) => {
      if (current) setError(reason instanceof Error ? reason.message : 'دریافت تاریخچه انجام نشد.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, query, category, refresh]);

  function search(event: FormEvent) { event.preventDefault(); setPage(1); setQuery(searchInput.trim()); }
  const first = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const last = Math.min(result.page * result.pageSize, result.total);

  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">فقط برای سوپرادمین</div><h1>گزارش رویدادهای سامانه</h1><p>برای بررسی کلی رویدادها؛ جزئیات کامل هر راننده در تاریخچه پرونده اوست.</p></div>
      <button className="btn" onClick={() => setRefresh((value) => value + 1)}>تازه‌سازی</button></div>
    <form className="audit-controls" onSubmit={search}>
      <label className="search-box"><span>⌕</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="جست‌وجوی راننده، کاربر یا نوع رویداد" /></label>
      <select aria-label="فیلتر نوع رویداد" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
        {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button className="btn primary" type="submit">جست‌وجو</button>
    </form>
    {error && <div className="alert error">{error}</div>}
    <div className="table-wrap"><table className="data-table audit-table"><thead><tr><th>زمان</th><th>کاربر</th><th>رویداد</th><th>پرونده</th><th>جزئیات ثبت</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={5}><div className="empty-state"><LoadingIndicator label="در حال دریافت رویدادها…" compact /></div></td></tr>
        : result.items.map((event) => <tr key={event.id}><td>{displayDateTime(event.createdAt)}</td><td>{event.actor?.name || 'سامانه'}</td><td><span className="audit-event">{labels[event.eventType] || event.eventType.replace(/^WORKFLOW_/, 'اقدام گردش: ')}</span></td><td>{event.driver ? <div className="audit-driver"><b>{event.driver.fullName}</b><small>{event.driver.mobile}</small></div> : '—'}</td><td className="audit-details">{format(event.details)}</td></tr>)}
      {!loading && !result.items.length && <tr><td colSpan={5}><div className="empty-state">رویدادی با این مشخصات پیدا نشد.</div></td></tr>}
    </tbody></table></div>
    <div className="audit-pagination"><span>نمایش {faNumber(first)} تا {faNumber(last)} از {faNumber(result.total)} رویداد</span>
      <div><button className="btn" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>قبلی</button><span>صفحه {faNumber(result.page)} از {faNumber(Math.max(result.totalPages, 1))}</span><button className="btn" disabled={loading || page >= result.totalPages} onClick={() => setPage((value) => value + 1)}>بعدی</button></div>
    </div>
    <div className="audit-footnote">برای حفظ حریم اطلاعات، متن فایل‌ها و رمزها وارد تاریخچه نمی‌شود؛ زمان و نوع اقدام، کاربر و فیلدهای تغییرکرده ثبت می‌شوند.</div>
  </div>;
}

function format(details: Record<string, unknown>) {
  const parts: string[] = [];
  if (Array.isArray(details.changedKeys)) parts.push('فیلدها: ' + details.changedKeys.join('، '));
  if (typeof details.action === 'string') parts.push('اقدام: ' + details.action);
  if (typeof details.fromStage === 'string' && typeof details.toStage === 'string') parts.push(details.fromStage + ' ← ' + details.toStage);
  if (typeof details.category === 'string') parts.push('دسته: ' + details.category);
  if (typeof details.note === 'string' && details.note) parts.push('یادداشت: ' + details.note);
  if (typeof details.userId === 'string') parts.push('شناسه کاربر: ' + details.userId.slice(0, 8));
  if (typeof details.amount === 'string') parts.push('مبلغ: ' + details.amount);
  return parts.join(' · ') || '—';
}
