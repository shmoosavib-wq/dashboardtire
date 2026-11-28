import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, asciiDigits, displayDate, faDigits, faNumber, formatMoney, jsonBody, normalizeIntegerInput, normalizeSearchText } from './api';
import LoadingIndicator from './LoadingIndicator';
import PersianDatePicker from './driver-panel/PersianDatePicker';
import TablePagination from './TablePagination';

type Installment = { id: string; number: number; amount: string; dueAt: string; paidAt: string | null; paidBy: { id: string; name: string } | null };
type ContactAttempt = { id: string; note: string; createdAt: string; actorName: string; installmentNumbers: number[] };
type InstallmentDriver = {
  id: string; fullName: string; mobile: string; archivedAt: string | null;
  initialPaymentAmount: string | null; initialPaymentDate: string | null;
  needsPlan: boolean;
  contactAttempts: ContactAttempt[];
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

function displayTimestamp(value: string) {
  return new Intl.DateTimeFormat('fa-IR-u-nu-arabext', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran',
  }).format(new Date(value));
}

function isOverdue(installment: Installment, today: string) {
  return !installment.paidAt && isoDate(installment.dueAt) < today;
}

function isDueSoon(installment: Installment, today: string) {
  if (installment.paidAt) return false;
  const daysUntilDue = (Date.parse(`${isoDate(installment.dueAt)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return daysUntilDue >= 0 && daysUntilDue <= 3;
}

function RecordPaymentModal({ driver, installment, onClose, onSaved }: {
  driver: InstallmentDriver; installment: Installment; onClose: () => void; onSaved: (paidAt: string, amount?: number) => Promise<void>;
}) {
  const [paidAt, setPaidAt] = useState(installment.paidAt ? isoDate(installment.paidAt) : tehranToday());
  const [amount, setAmount] = useState(installment.amount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paidAt || isoDate(paidAt) > tehranToday()) {
      setError('تاریخ پرداخت را انتخاب کنید؛ تاریخ آینده قابل ثبت نیست.');
      return;
    }
    const numericAmount = Number(asciiDigits(amount).replace(/[^\d]/g, ''));
    if (installment.paidAt && (!Number.isSafeInteger(numericAmount) || numericAmount < 1 || numericAmount > 1_000_000_000_000_000)) {
      setError('مبلغ پرداخت‌شده باید عددی مثبت و معتبر باشد.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSaved(paidAt, installment.paidAt ? numericAmount : undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ثبت تاریخ پرداخت انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="modal compact-modal installment-payment-modal" role="dialog" aria-modal="true" aria-labelledby="installment-payment-title">
      <div className="modal-head">
        <div><div className="eyebrow">ثبت پرداخت قسط {faNumber(installment.number)}</div><h2 id="installment-payment-title">{installment.paidAt ? 'اصلاح مبلغ و تاریخ پرداخت' : 'ثبت پرداخت قسط'}</h2><p>{driver.fullName} · {formatMoney(installment.amount)} تومان</p></div>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="بستن">×</button>
      </div>
      <div className="installment-payment-context"><span>تاریخ سررسید</span><strong>{displayInstallmentDate(installment.dueAt)}</strong></div>
      <form onSubmit={(event) => void submit(event)}>
        {installment.paidAt && <label className="field">مبلغ واقعی پرداخت‌شده<input inputMode="numeric" value={formatMoney(amount)} onChange={(event) => setAmount(normalizeIntegerInput(event.target.value))} disabled={busy} aria-label="مبلغ واقعی پرداخت‌شده" /><small>پس از اصلاح، مبلغ قسط‌های پرداخت‌نشده دوباره توزیع می‌شود؛ تاریخ سررسیدشان ثابت می‌ماند.</small></label>}
        <label className="field">تاریخ پرداخت واقعی <PersianDatePicker value={paidAt} onChange={setPaidAt} disabled={busy} /></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose} disabled={busy}>انصراف</button><button type="submit" className="btn primary" disabled={busy || !paidAt}>{busy ? 'در حال ثبت…' : installment.paidAt ? 'ذخیره اصلاحات' : 'ذخیره تاریخ پرداخت'}</button></div>
      </form>
    </section>
  </div>;
}

function RecordContactModal({ driver, installment, onClose, onSaved }: {
  driver: InstallmentDriver; installment: Installment; onClose: () => void; onSaved: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedNote = note.trim();
    if (!trimmedNote || trimmedNote.length > 1000) {
      setError('یادداشت تماس را وارد کنید (حداکثر ۱۰۰۰ نویسه).');
      return;
    }
    setBusy(true);
    setError('');
    try { await onSaved(trimmedNote); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت پیگیری تماس انجام نشد.'); }
    finally { setBusy(false); }
  }

  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="modal compact-modal installment-contact-modal" role="dialog" aria-modal="true" aria-labelledby="installment-contact-title">
      <div className="modal-head">
        <div><div className="eyebrow">پیگیری قسط نزدیک سررسید</div><h2 id="installment-contact-title">ثبت نتیجه تماس</h2><p>{driver.fullName} · {faDigits(driver.mobile)}</p></div>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="بستن">×</button>
      </div>
      <div className="installment-contact-context">
        <strong>قسط {faNumber(installment.number)}</strong>
        <span>سررسید {displayInstallmentDate(installment.dueAt)} · {formatMoney(installment.amount)} تومان</span>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">نتیجه تماس / یادداشت<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} placeholder="نتیجه تماس یا زمان پیگیری بعدی را بنویسید…" disabled={busy} required /></label>
        <small className="installment-contact-hint">زمان ثبت و نام کاربر واردشده به‌صورت خودکار ذخیره می‌شود.</small>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose} disabled={busy}>انصراف</button><button type="submit" className="btn primary" disabled={busy || !note.trim()}>{busy ? 'در حال ثبت…' : 'ثبت یادداشت تماس'}</button></div>
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paymentTarget, setPaymentTarget] = useState<{ driver: InstallmentDriver; installment: Installment } | null>(null);
  const [contactTarget, setContactTarget] = useState<{ driver: InstallmentDriver; installment: Installment } | null>(null);
  const [today, setToday] = useState(tehranToday);
  const [creatingPlanId, setCreatingPlanId] = useState<string | null>(null);
  const [planError, setPlanError] = useState('');

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
    const term = normalizeSearchText(search);
    return drivers.filter((driver) => {
      const matchesSearch = !term || normalizeSearchText(driver.fullName).includes(term) || normalizeSearchText(driver.mobile).includes(term) || driver.products.some((item) => normalizeSearchText(item.title).includes(term));
      const hasUnpaid = driver.installments.some((item) => !item.paidAt);
      const allPaid = driver.installments.length > 0 && driver.installments.every((item) => item.paidAt);
      return matchesSearch && (filter === 'all' || (filter === 'unpaid' && hasUnpaid) || (filter === 'paid' && allPaid));
    });
  }, [drivers, filter, search, today]);

  useEffect(() => { setPage(1); }, [filter, search]);
  const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageDrivers = filteredDrivers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function savePayment(paidAt: string, amount?: number) {
    if (!paymentTarget) return;
    const amountChanged = amount !== undefined && String(amount) !== paymentTarget.installment.amount;
    await api(`/drivers/${paymentTarget.driver.id}/installments/${paymentTarget.installment.id}/payment`, {
      method: 'POST', body: jsonBody({ paidAt, ...(amount !== undefined ? { amount } : {}) }),
    });
    setPaymentTarget(null);
    await load();
    notify(amountChanged ? 'مبلغ پرداخت‌شده اصلاح و ماندهٔ اقساط بازتوزیع شد.' : 'تاریخ پرداخت قسط ثبت شد.');
  }

  async function saveContact(note: string) {
    if (!contactTarget) return;
    await api(`/drivers/${contactTarget.driver.id}/installments/contact-attempts`, {
      method: 'POST', body: jsonBody({ installmentId: contactTarget.installment.id, note }),
    });
    setExpandedId(contactTarget.driver.id);
    setContactTarget(null);
    await load();
    notify('یادداشت تماس و اطلاعات پیگیری ثبت شد.');
  }

  async function createPlan(driver: InstallmentDriver) {
    setCreatingPlanId(driver.id);
    setPlanError('');
    try {
      await api(`/drivers/${driver.id}/installments`, { method: 'POST' });
      await load();
      notify('برنامهٔ اقساط پرونده ساخته شد.');
    } catch (reason) {
      setPlanError(reason instanceof Error ? reason.message : 'ساخت برنامهٔ اقساط انجام نشد.');
    } finally {
      setCreatingPlanId(null);
    }
  }

  return <div className="page-stack installment-page">
    <header className="page-heading">
      <div><div className="eyebrow">پیگیری بازپرداخت رانندگان</div><h1>اقساط رانندگان</h1><p>سررسید هر قسط و تاریخ واقعی پرداخت را جداگانه ببینید و ثبت کنید؛ پرونده‌های قدیمیِ واجد شرایط را هم می‌توانید به برنامهٔ اقساط اضافه کنید.</p></div>
    </header>

    <div className="installment-summary" aria-label="خلاصه اقساط">
      <div><span>پرونده‌های واجد شرایط اقساط</span><strong>{faNumber(counts.all)}</strong></div>
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
    {planError && <div className="alert error" role="alert">{planError}<button type="button" className="text-button" onClick={() => setPlanError('')}>بستن</button></div>}

    {loading ? <div className="installment-loading"><LoadingIndicator label="در حال دریافت فهرست اقساط…" /></div>
      : loadError ? <div className="empty-state installment-empty"><p>{loadError}</p><button type="button" className="btn" onClick={() => void load()}>تلاش دوباره</button></div>
        : !filteredDrivers.length ? <div className="empty-state installment-empty"><strong>{drivers.length ? 'موردی با این فیلتر پیدا نشد.' : 'هنوز برنامهٔ قسطی ثبت نشده است.'}</strong><p>{drivers.length ? 'فیلتر یا عبارت جستجو را تغییر دهید.' : 'پس از تأیید پرداخت اولیه، سه قسط ماهانهٔ بعدی به‌صورت خودکار اینجا نمایش داده می‌شود.'}</p></div>
          : <div className="table-wrap installment-table-wrap"><table className="data-table installment-driver-table">
            <thead><tr><th>#</th><th>راننده</th><th>کالا</th><th>پرداخت اولیه</th><th>تعداد اقساط</th><th>وضعیت</th><th>جزئیات</th></tr></thead>
            <tbody>{pageDrivers.map((driver, index) => {
              const overdue = driver.installments.some((item) => isOverdue(item, today));
              const dueSoonInstallments = driver.installments.filter((item) => isDueSoon(item, today));
              const dueSoon = !overdue && dueSoonInstallments.length > 0;
              const initialPaymentPaid = Boolean(driver.initialPaymentAmount && BigInt(driver.initialPaymentAmount) > 0n);
              const paidCount = driver.installments.filter((item) => item.paidAt).length + Number(initialPaymentPaid);
              const totalPaymentCount = driver.installments.length + Number(initialPaymentPaid);
              const expanded = expandedId === driver.id;
              return <Fragment key={driver.id}>
                <tr className={`installment-driver-row${overdue ? ' has-overdue' : dueSoon ? ' has-due-soon' : ''}`}>
                  <td className="row-number">{faNumber((currentPage - 1) * pageSize + index + 1)}</td>
                  <td><div className="installment-driver-name"><strong>{driver.fullName}</strong><small>{faDigits(driver.mobile)}{driver.archivedAt && <span className="archive-tag">آرشیو</span>}</small></div></td>
                  <td className="installment-products">{driver.products.length ? driver.products.map((item) => `${item.title} (${faNumber(item.quantity)})`).join('، ') : '—'}</td>
                  <td>{driver.initialPaymentAmount ? <><strong>{formatMoney(driver.initialPaymentAmount)} تومان</strong><small className="installment-subdate">{displayInstallmentDate(driver.initialPaymentDate)}</small></> : '—'}</td>
                  <td>{driver.needsPlan ? 'برنامه ثبت نشده' : <>{faNumber(paidCount)} از {faNumber(totalPaymentCount)} پرداخت‌شده</>}</td>
                  <td>{driver.needsPlan ? <span className="status-pill">نیازمند ساخت برنامه</span> : overdue ? <span className="installment-status overdue"><i className="overdue-pulse" />سررسید گذشته</span> : dueSoon ? <span className="installment-status due-soon"><i className="due-soon-pulse" />سررسید نزدیک</span> : paidCount === totalPaymentCount ? <span className="status-pill success">تکمیل‌شده</span> : <span className="status-pill">در جریان</span>}</td>
                  <td><div className="installment-row-actions">{dueSoon && !driver.needsPlan && <button type="button" className="btn installment-contact-button" title={`ثبت یادداشت تماس برای قسط ${faNumber(dueSoonInstallments[0].number)}`} aria-label={`ثبت یادداشت تماس برای قسط ${faNumber(dueSoonInstallments[0].number)} راننده ${driver.fullName}`} onClick={() => setContactTarget({ driver, installment: dueSoonInstallments[0] })}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M7.1 3.8h2.8l1.4 4-1.8 1.5a15.4 15.4 0 0 0 5.2 5.2l1.5-1.8 4 1.4v2.8c0 1-.8 1.8-1.8 1.8A14.6 14.6 0 0 1 5.3 5.6c0-1 .8-1.8 1.8-1.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></button>}{driver.needsPlan
                    ? <button type="button" className="btn small primary" disabled={creatingPlanId !== null} onClick={() => void createPlan(driver)}>{creatingPlanId === driver.id ? 'در حال ساخت…' : 'ساخت برنامه'}</button>
                    : <button type="button" className="btn small installment-expand" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : driver.id)}>{expanded ? 'بستن جزئیات' : 'مشاهده اقساط'}<span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span></button>}</div></td>
                </tr>
                {expanded && <tr className="installment-detail-row"><td colSpan={7}>
                  <div className="installment-detail-head"><div><strong>برنامهٔ پرداخت {driver.fullName}</strong><small>تاریخ سررسید و پرداخت واقعی در ستون‌های جدا ثبت می‌شوند.</small></div><span>{faNumber(driver.installments.length)} قسط</span></div>
                  <div className="table-wrap installment-child-wrap"><table className="data-table installment-child-table"><thead><tr><th>قسط</th><th>مبلغ</th><th>تاریخ سررسید</th><th>تاریخ پرداخت واقعی</th><th>وضعیت</th><th>اقدام</th></tr></thead>
                    <tbody>{driver.installments.map((item) => {
                      const itemOverdue = isOverdue(item, today);
                      const itemDueSoon = !itemOverdue && isDueSoon(item, today);
                      return <tr key={item.id} className={itemOverdue ? 'installment-child-overdue' : itemDueSoon ? 'installment-child-due-soon' : ''}>
                        <td>قسط {faNumber(item.number)}</td><td><strong>{formatMoney(item.amount)} تومان</strong></td><td>{displayInstallmentDate(item.dueAt)}</td><td>{item.paidAt ? displayInstallmentDate(item.paidAt) : <span className="installment-not-recorded">ثبت نشده</span>}</td>
                        <td>{item.paidAt ? <span className="status-pill success">پرداخت‌شده</span> : itemOverdue ? <span className="installment-status overdue"><i className="overdue-pulse" />سررسید گذشته</span> : itemDueSoon ? <span className="installment-status due-soon"><i className="due-soon-pulse" />سررسید نزدیک</span> : <span className="status-pill">پرداخت‌نشده</span>}</td>
                        <td>{item.paidAt ? <button type="button" className="btn small" onClick={() => setPaymentTarget({ driver, installment: item })}>ویرایش</button> : <button type="button" className="btn small primary" onClick={() => setPaymentTarget({ driver, installment: item })}>ثبت پرداخت</button>}</td>
                      </tr>;
                    })}</tbody></table></div>
                  {(driver.contactAttempts.length > 0 || (dueSoon && !driver.needsPlan)) && <section className="installment-contact-history" aria-label="سوابق تماس">
                    <div className="installment-contact-history-heading"><strong>یادداشت‌های پیگیری</strong>{dueSoon && !driver.needsPlan && <button type="button" className="btn small installment-add-note" onClick={() => setContactTarget({ driver, installment: dueSoonInstallments[0] })}>یادداشت جدید</button>}</div>
                    {driver.contactAttempts.map((attempt) => <article key={attempt.id}><div><span>{attempt.actorName}</span><time dateTime={attempt.createdAt}>{displayTimestamp(attempt.createdAt)}</time></div><p>{attempt.note}</p><small>پیگیری قسط {attempt.installmentNumbers.map((number) => faNumber(number)).join('، ')}</small></article>)}
                  </section>}
                </td></tr>}
              </Fragment>;
            })}</tbody>
          </table></div>}
    {!loading && !loadError && filteredDrivers.length > 0 && <TablePagination page={currentPage} pageSize={pageSize} total={filteredDrivers.length} itemLabel="راننده" onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />}
    {paymentTarget && <RecordPaymentModal driver={paymentTarget.driver} installment={paymentTarget.installment} onClose={() => setPaymentTarget(null)} onSaved={savePayment} />}
    {contactTarget && <RecordContactModal driver={contactTarget.driver} installment={contactTarget.installment} onClose={() => setContactTarget(null)} onSaved={saveContact} />}
  </div>;
}
