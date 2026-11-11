import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, asciiDigits, displayDate, faDigits, faNumber, formatMoney, jsonBody } from '../api';
import { can, type Driver, type User } from '../model';
import PersianDatePicker from './PersianDatePicker';

function SettlementTab({ driver, user, onOpen }: { driver: Driver; user: User; onOpen: () => void }) {
  const settlement = driver.storeSettlement;
  const allowed = can(user, 'LEGAL_FINANCE') && !driver.archivedAt;
  return <div className="tab-content"><div className="section-head"><div><div className="eyebrow">حساب فروشگاه</div><h3>تسویه با فروشگاه</h3><p>این مبلغ از پرداخت راننده جداست و در همین پرونده نگهداری می‌شود.</p></div>{allowed && <button className="btn primary" onClick={onOpen}>{settlement ? 'ویرایش تسویه' : 'ثبت تسویه'}</button>}</div>
    <div className="settlement-card"><div className="settlement-icon">↔</div><div><small>وضعیت تسویه</small><b>{settlement ? 'تسویه ثبت شده' : 'تسویه ثبت نشده'}</b></div>{settlement && <><div><small>مبلغ تسویه</small><b>{formatMoney(settlement.amount)} <small>تومان</small></b></div><div><small>تاریخ تسویه</small><b>{displayDate(settlement.settledAt)}</b></div></>}</div>
    <PurchaseSummary driver={driver} />
  </div>;
}

function PurchaseSummary({ driver }: { driver: Driver }) {
  const draft = (driver.drafts?.find((item) => item.stage === 'PROFORMA_PAYMENT_RESERVATION')?.payload || {}) as Record<string, unknown>;
  const draftLines = Array.isArray(draft.products) ? draft.products as Record<string, unknown>[] : [];
  const lines = draftLines.length ? draftLines : driver.products || [];
  if (!lines.length && !draft.paymentAmount) return null;
  return <div className="finance-summary"><h4>خلاصه خرید راننده</h4>{lines.map((line, index) => {
    const quantity = BigInt(asciiDigits(String(line.quantity || '')).replace(/\D/g, '') || '0');
    const sale = BigInt(asciiDigits(String(line.saleUnitPrice || '')).replace(/\D/g, '') || '0');
    const cost = BigInt(asciiDigits(String(line.supplyUnitCost || '')).replace(/\D/g, '') || '0');
    return <div className="purchase-summary-line" key={index}><span>{String(line.title || 'کالا')}{quantity ? ' · ' + faNumber(quantity) + ' عدد' : ''}</span><b>{formatMoney(sale * quantity)} فروش · {formatMoney(cost * quantity)} تأمین</b></div>;
  })}{draft.invoiceNumber ? <div><span>شماره پیش‌فاکتور</span><b>{String(draft.invoiceNumber)}</b></div> : null}{draft.paymentAmount ? <div><span>پرداخت اولیه</span><b>{formatMoney(String(draft.paymentAmount))} تومان · {displayDate(String(draft.paymentDate || ''))}</b></div> : null}</div>;
}

function SettlementModal({ driver, onClose, onSaved }: { driver: Driver; onClose: () => void; onSaved: () => Promise<void> }) {
  const [amount, setAmount] = useState(driver.storeSettlement?.amount || '');
  const [date, setDate] = useState(driver.storeSettlement?.settledAt?.slice(0, 10) || '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/drivers/' + driver.id + '/store-settlement', { method: 'POST', body: jsonBody({ amount: Number(asciiDigits(amount).replace(/\D/g, '')), settledAt: date }) });
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت تسویه انجام نشد.'); }
    finally { setBusy(false); }
  }
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal compact-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><div className="eyebrow">پرونده {driver.fullName}</div><h2>{driver.storeSettlement ? 'ویرایش تسویه فروشگاه' : 'ثبت تسویه فروشگاه'}</h2><p>مبلغ و تاریخ پرداخت به فروشگاه را ثبت کنید.</p></div><button className="icon-button" onClick={onClose}>×</button></div><form onSubmit={submit}><div className="form-grid"><label className="field wide">مبلغ تسویه<input required inputMode="numeric" value={formatMoney(amount)} onChange={(e) => setAmount(asciiDigits(e.target.value).replace(/\D/g, ''))} placeholder="مبلغ به تومان" /></label><label className="field wide">تاریخ تسویه<PersianDatePicker value={date} onChange={setDate} /></label></div>{error && <div className="alert error">{error}</div>}<div className="modal-actions"><button type="button" className="btn" onClick={onClose}>انصراف</button><button className="btn primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ثبت تسویه'}</button></div></form></section></div>;
}

function ArchiveModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal compact-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><div className="eyebrow">خروج از فهرست جاری</div><h2>آرشیو پرونده</h2><p>مدارک و تاریخچه حفظ می‌شوند؛ پرونده از لیست فعال کنار می‌رود.</p></div><button className="icon-button" onClick={onClose}>×</button></div><label className="field">علت آرشیو <span className="optional">اختیاری</span><textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً انصراف راننده یا نداشتن شرایط" /></label><div className="modal-actions"><button className="btn" onClick={onClose}>انصراف</button><button className="btn danger" disabled={busy} onClick={() => onSubmit(reason)}>{busy ? 'در حال ثبت…' : 'انتقال به آرشیو'}</button></div></section></div>;
}


export { SettlementTab, PurchaseSummary, SettlementModal, ArchiveModal };
