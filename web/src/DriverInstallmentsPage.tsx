import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, displayDate, faDigits, faNumber, formatMoney, jsonBody } from './api';
import LoadingIndicator from './LoadingIndicator';
import PersianDatePicker from './driver-panel/PersianDatePicker';

type Installment = { id: string; number: number; amount: string; dueAt: string; paidAt: string | null; paidBy: { id: string; name: string } | null };
type InstallmentDriver = {
  id: string; fullName: string; mobile: string; archivedAt: string | null;
  initialPaymentAmount: string | null; initialPaymentDate: string | null;
  products: { id: string; title: string; quantity: number; saleUnitPrice: string | null }[];
  installments: Installment[];
};
type Filter = 'all' | 'unpaid' | 'paid';

function tehranToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isoDate(value: string) {
  return value.slice(0, 10);
}

function displayInstallmentDate(value?: string | null) {
  if (!value) return '—';
  return displayDate(`${isoDate(value)}T12:00:00.000Z`);
}

function isOverdue(installment: Installment, today: string) {
  return !installment.paidAt && isoDate(installment.dueAt) < today;
}

function RecordPaymentModal({ driver, installment, onClose, onSaved }: {
  driver: InstallmentDriver; installment: Installment; onClose: () => void; onSaved: (paidAt: string) => Promise<void>;
}) {
  const [paidAt, setPaidAt] = useState(installment.paidAt ? isoDate(installment.paidAt) : tehranToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paidAt || isoDate(paidAt) > tehranToday()) {
      setError('تاریخ پرداخت را انتخاب کنید؛ تاریخ آینده قابل ثبت نیست.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSaved(paidAt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ثبت تاریخ پرداخت انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="modal compact-modal installment-payment-modal" role="dialog" aria-modal="true" aria-labelledby="installment-payment-title">
      <div className="modal-head">
        <div><div className="eyebrow">ثبت پرداخت قسط {faNumber(installment.number)}</div><h2 id="installment-payment-title">{installment.paidAt ? 'اصلاح تاریخ پرداخت' : 'ثبت پرداخت قسط'}</h2><p>{driver.fullName} · {formatMoney(installment.amount)} تومان</p></div>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="بستن">×</button>
      </div>
      <div className="installment-payment-context"><span>تاریخ سررسید</span><strong>{displayInstallmentDate(installment.dueAt)}</strong></div>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">تاریخ پرداخت واقعی <PersianDatePicker value={paidAt} onChange={setPaidAt} disabled={busy} /></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose} disabled={busy}>انصراف</button><button type="submit" className="btn primary" disabled={busy || !paidAt}>{busy ? 'در حال ثبت…' : 'ذخیره تاریخ پرداخت'}</button></div>
      </form>
    </section>
  </div>;
}

export default function DriverInstallmentsPage({ notify }: { notify: (message: string) => void }) {
  const [drivers, setDrivers] = useState<InstallmentDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [paymentTarget, setPaymentTarget] = useState<{ driver: InstallmentDriver; installment: Installment } | null>(null);
  const [today, setToday] = useState(tehranToday);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try { setDrivers(await api<InstallmentDriver[]>('/drivers/installments')); }
    catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'دریافت فهرست اقساط انجام نشد.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(tehranToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => {
    const all = drivers.length;
    const unpaid = drivers.filter((driver) => driver.installments.some((item) => !item.paidAt)).length;
    const paid = drivers.filter((driver) => driver.installments.length > 0 && driver.installments.every((item) => item.paidAt)).length;
    return { all, unpaid, paid };
  }, [drivers]);

  const filteredDrivers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return drivers.filter((driver) => {
      const matchesSearch = !term || driver.fullName.toLocaleLowerCase().includes(term) || driver.mobile.includes(term) || driver.products.some((item) => item.title.toLocaleLowerCase().includes(term));
      const hasUnpaid = driver.installments.some((item) => !item.paidAt);
      const allPaid = driver.installments.length > 0 && driver.installments.every((item) => item.paidAt);
      return matchesSearch && (filter === 'all' || (filter === 'unpaid' && hasUnpaid) || (filter === 'paid' && allPaid));
    });
  }, [drivers, filter, search, today]);

  async function savePayment(paidAt: string) {
    if (!paymentTarget) return;
    await api(`/drivers/${paymentTarget.driver.id}/installments/${paymentTarget.installment.id}/payment`, {
      method: 'POST', body: jsonBody({ paidAt }),
    });
    setPaymentTarget(null);
    await load();
    notify('تاریخ پرداخت قسط ثبت شد.');
  }

  return <div className="page-stack installment-page">
    <header className="page-heading">
      <div><div className="eyebrow">پیگیری بازپرداخت رانندگان</div><h1>اقساط رانندگان</h1><p>سررسید هر قسط و تاریخ واقعی پرداخت را جداگانه ببینید و ثبت کنید.</p></div>
    </header>

    <div className="installment-summary" aria-label="خلاصه اقساط">
      <div><span>رانندگان دارای برنامه</span><strong>{faNumber(counts.all)}</strong></div>
      <div><span>دارای قسط پرداخت‌نشده</span><strong>{faNumber(counts.unpaid)}</strong></div>
      <div><span>همهٔ اقساط پرداخت‌شده</span><strong>{faNumber(counts.paid)}</strong></div>
    </div>

    <div className="installment-toolbar">
      <div className="installment-filters" role="tablist" aria-label="فیلتر اقساط">
        {([
          ['all', 'همه', counts.all], ['unpaid', 'پرداخت‌نشده', counts.unpaid], ['paid', 'پرداخت‌شده', counts.paid],
        ] as [Filter, string, number][]).map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'installment-filter active' : 'installment-filter'} onClick={() => setFilter(id)}>{label}<span>{faNumber(count)}</span></button>)}
      </div>
      <label className="installment-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجو نام راننده، موبایل یا کالا" aria-label="جستجو در اقساط" /></label>
    </div>

    {loading ? <div className="installment-loading"><LoadingIndicator label="در حال دریافت فهرست اقساط…" /></div>
      : loadError ? <div className="empty-state installment-empty"><p>{loadError}</p><button type="button" className="btn" onClick={() => void load()}>تلاش دوباره</button></div>
        : !filteredDrivers.length ? <div className="empty-state installment-empty"><strong>{drivers.length ? 'موردی با این فیلتر پیدا نشد.' : 'هنوز برنامهٔ قسطی ثبت نشده است.'}</strong><p>{drivers.length ? 'فیلتر یا عبارت جستجو را تغییر دهید.' : 'پس از تأیید پرداخت اولیه، برنامهٔ سه‌قسطی به‌صورت خودکار اینجا نمایش داده می‌شود.'}</p></div>
          : <div className="table-wrap installment-table-wrap"><table className="data-table installment-driver-table">
            <thead><tr><th>#</th><th>راننده</th><th>کالا</th><th>پرداخت اولیه</th><th>تعداد اقساط</th><th>وضعیت</th><th>جزئیات</th></tr></thead>
            <tbody>{filteredDrivers.map((driver, index) => {
              const overdue = driver.installments.some((item) => isOverdue(item, today));
              const paidCount = driver.installments.filter((item) => item.paidAt).length;
              const expanded = expandedId === driver.id;
              return <Fragment key={driver.id}>
                <tr className={overdue ? 'installment-driver-row has-overdue' : 'installment-driver-row'}>
                  <td className="row-number">{faNumber(index + 1)}</td>
                  <td><div className="installment-driver-name"><strong>{driver.fullName}</strong><small>{faDigits(driver.mobile)}{driver.archivedAt && <span className="archive-tag">آرشیو</span>}</small></div></td>
                  <td className="installment-products">{driver.products.length ? driver.products.map((item) => `${item.title} (${faNumber(item.quantity)})`).join('، ') : '—'}</td>
                  <td>{driver.initialPaymentAmount ? <><strong>{formatMoney(driver.initialPaymentAmount)} تومان</strong><small className="installment-subdate">{displayInstallmentDate(driver.initialPaymentDate)}</small></> : '—'}</td>
                  <td>{faNumber(paidCount)} از {faNumber(driver.installments.length)} پرداخت‌شده</td>
                  <td>{overdue ? <span className="installment-status overdue"><i className="overdue-pulse" />سررسید گذشته</span> : paidCount === driver.installments.length ? <span className="status-pill success">تکمیل‌شده</span> : <span className="status-pill">در جریان</span>}</td>
                  <td><button type="button" className="btn small installment-expand" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : driver.id)}>{expanded ? 'بستن جزئیات' : 'مشاهده اقساط'}<span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span></button></td>
                </tr>
                {expanded && <tr className="installment-detail-row"><td colSpan={7}>
                  <div className="installment-detail-head"><div><strong>برنامهٔ پرداخت {driver.fullName}</strong><small>تاریخ سررسید و پرداخت واقعی در ستون‌های جدا ثبت می‌شوند.</small></div><span>{faNumber(driver.installments.length)} قسط</span></div>
                  <div className="table-wrap installment-child-wrap"><table className="data-table installment-child-table"><thead><tr><th>قسط</th><th>مبلغ</th><th>تاریخ سررسید</th><th>تاریخ پرداخت واقعی</th><th>وضعیت</th><th>اقدام</th></tr></thead>
                    <tbody>{driver.installments.map((item) => {
                      const itemOverdue = isOverdue(item, today);
                      return <tr key={item.id} className={itemOverdue ? 'installment-child-overdue' : ''}>
                        <td>قسط {faNumber(item.number)}</td><td><strong>{formatMoney(item.amount)} تومان</strong></td><td>{displayInstallmentDate(item.dueAt)}</td><td>{item.paidAt ? displayInstallmentDate(item.paidAt) : <span className="installment-not-recorded">ثبت نشده</span>}</td>
                        <td>{item.paidAt ? <span className="status-pill success">پرداخت‌شده</span> : itemOverdue ? <span className="installment-status overdue"><i className="overdue-pulse" />سررسید گذشته</span> : <span className="status-pill">پرداخت‌نشده</span>}</td>
                        <td>{item.paidAt ? <button type="button" className="btn small" onClick={() => setPaymentTarget({ driver, installment: item })}>ویرایش تاریخ</button> : <button type="button" className="btn small primary" onClick={() => setPaymentTarget({ driver, installment: item })}>ثبت پرداخت</button>}</td>
                      </tr>;
                    })}</tbody></table></div>
                </td></tr>}
              </Fragment>;
            })}</tbody>
          </table></div>}
    {paymentTarget && <RecordPaymentModal driver={paymentTarget.driver} installment={paymentTarget.installment} onClose={() => setPaymentTarget(null)} onSaved={savePayment} />}
  </div>;
}
