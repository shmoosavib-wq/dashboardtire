import { useEffect, useState } from 'react';
import { api, asciiDigits, displayDate, faDigits, faNumber, formatMoney, jsonBody, normalizeIntegerInput } from './api';
import LoadingIndicator from './LoadingIndicator';
import TablePagination from './TablePagination';
import PersianDatePicker from './driver-panel/PersianDatePicker';
import type { Driver } from './model';

type Settlement = { id: string; storeName: string; amount: string; settledAt: string; registeredAt: string; registeredBy: { name: string } };
type SupplierProduct = {
  id: string; title: string; quantity: number; saleTotal: string | null; payableTotal: string | null;
  paidTotal: string; remaining: string | null;
  driver: { id: string; fullName: string; mobile: string; archivedAt: string | null };
  settlements: Settlement[];
};
type ProductPage = { items: SupplierProduct[]; total: number; page: number; pageSize: number; totalPages: number };

function AddPurchaseProductModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState('');
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [saleUnitPrice, setSaleUnitPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Driver[]>('/drivers?stage=COMPLETED').then((items) => {
      setDrivers(items);
      if (items.length) setDriverId(items[0].id);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'فهرست پرونده‌ها دریافت نشد.'))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericQuantity = Number(asciiDigits(quantity).replace(/\D/g, ''));
    const numericPrice = Number(asciiDigits(saleUnitPrice).replace(/\D/g, ''));
    if (!driverId || !title.trim() || !Number.isSafeInteger(numericQuantity) || numericQuantity < 1 || !Number.isSafeInteger(numericPrice) || numericPrice < 1) {
      setError('راننده، عنوان کالا، تعداد و قیمت فروش را کامل و درست وارد کنید.');
      return;
    }
    setBusy(true); setError('');
    try {
      await api('/supplier-settlements/products', { method: 'POST', body: jsonBody({ driverId, title: title.trim(), quantity: numericQuantity, saleUnitPrice: numericPrice }) });
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'افزودن قلم خرید انجام نشد.'); }
    finally { setBusy(false); }
  }

  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="add-purchase-title">
      <div className="modal-head"><div><div className="eyebrow">ورود قلم خرید قدیمی</div><h2 id="add-purchase-title">افزودن کالا به فهرست تسویه</h2><p>این گزینه برای پرونده‌های تکمیل‌شده‌ای است که کالایشان در مرحلهٔ پیش‌فاکتور ثبت نشده.</p></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="بستن">×</button></div>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">پروندهٔ راننده
          <select required value={driverId} disabled={loading || busy || !drivers.length} onChange={(event) => setDriverId(event.target.value)}>
            {!drivers.length && <option value="">{loading ? 'در حال دریافت پرونده‌ها…' : 'پروندهٔ تکمیل‌شده‌ای پیدا نشد'}</option>}
            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName} · {faDigits(driver.mobile)}</option>)}
          </select>
        </label>
        <label className="field">عنوان کالا<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثلاً لاستیک کامیون" /></label>
        <div className="form-grid">
          <label className="field">تعداد<input required inputMode="numeric" value={faDigits(quantity)} onChange={(event) => setQuantity(normalizeIntegerInput(event.target.value))} /></label>
          <label className="field">قیمت فروش هر واحد (تومان)<input required inputMode="numeric" value={saleUnitPrice ? faDigits(formatMoney(saleUnitPrice)) : ''} onChange={(event) => setSaleUnitPrice(normalizeIntegerInput(event.target.value))} placeholder="مبلغ فروش به راننده" /></label>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose} disabled={busy}>انصراف</button><button type="submit" className="btn primary" disabled={loading || busy || !drivers.length}>{busy ? 'در حال ثبت…' : 'افزودن به فهرست'}</button></div>
      </form>
    </section>
  </div>;
}

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function RecordSettlementModal({ product, debtOnly, onClose, onSaved }: {
  product: SupplierProduct; debtOnly: boolean; onClose: () => void; onSaved: (message: string) => Promise<void>;
}) {
  const firstSettlement = product.payableTotal === null;
  const [storeName, setStoreName] = useState(product.settlements.at(-1)?.storeName ?? '');
  const [payableTotal, setPayableTotal] = useState(product.payableTotal ?? '');
  const [amount, setAmount] = useState('');
  const [settledAt, setSettledAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remaining = Math.max(0, Number(asciiDigits(payableTotal).replace(/\D/g, '') || 0) - Number(product.paidTotal));

  async function submit(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(asciiDigits(amount).replace(/\D/g, ''));
    const numericPayable = Number(asciiDigits(payableTotal).replace(/\D/g, ''));
    if (!Number.isSafeInteger(numericPayable) || numericPayable < 1 || numericPayable < Number(product.paidTotal) || (!debtOnly && firstSettlement && !storeName.trim()) || (!debtOnly && (!settledAt || !Number.isSafeInteger(numericAmount) || numericAmount < 1 || numericAmount > remaining))) {
      setError(numericPayable < Number(product.paidTotal) ? 'مبلغ کل بدهی نمی‌تواند از مجموع پرداخت‌های ثبت‌شده کمتر باشد.' : debtOnly ? 'مبلغ کل بدهی را درست وارد کنید.' : firstSettlement ? 'نام فروشگاه، مبلغ کل بدهی، مبلغ پرداخت و تاریخ را درست وارد کنید.' : 'مبلغ کل بدهی، مبلغ پرداخت و تاریخ را بررسی کنید؛ مبلغ پرداخت نباید از مانده بیشتر باشد.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (debtOnly) {
        await api(`/supplier-settlements/products/${product.id}/debt`, { method: 'PATCH', body: jsonBody({ payableTotal: numericPayable }) });
      } else {
        await api(`/supplier-settlements/products/${product.id}/settlements`, {
          method: 'POST', body: jsonBody({ ...(firstSettlement ? { storeName: storeName.trim() } : {}), payableTotal: numericPayable, amount: numericAmount, settledAt }),
        });
      }
      await onSaved(debtOnly ? 'مبلغ کل بدهی به‌روزرسانی شد.' : 'تسویه با موفقیت ثبت شد.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ثبت تسویه انجام نشد.');
    } finally { setBusy(false); }
  }

  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="modal compact-modal supplier-settlement-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-settlement-title">
      <div className="modal-head"><div><div className="eyebrow">{debtOnly ? 'اصلاح اطلاعات بدهی' : 'ثبت پرداخت به تأمین‌کننده'}</div><h2 id="supplier-settlement-title">{debtOnly ? 'ویرایش مبلغ کل بدهی' : 'ثبت تسویهٔ کالا'}</h2><p>{product.title} · {product.driver.fullName}</p></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="بستن">×</button></div>
      <div className="supplier-settlement-context"><span>مبلغ فروش به راننده</span><b>{product.saleTotal === null ? 'ثبت نشده' : `${formatMoney(product.saleTotal)} تومان`}</b>{!firstSettlement && <><span>پرداخت‌شده تا امروز</span><b>{formatMoney(product.paidTotal)} تومان</b></>}</div>
      <form onSubmit={(event) => void submit(event)}>
        {!debtOnly && firstSettlement && <>
          <label className="field">فروشگاه / تأمین‌کننده
            <input required maxLength={120} autoFocus value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="نام فروشگاه را وارد کنید" />
          </label>
        </>}
        <label className="field">مبلغ کل بدهی به تأمین‌کننده (تومان)
          <input required inputMode="numeric" value={payableTotal ? faDigits(formatMoney(payableTotal)) : ''} onChange={(event) => setPayableTotal(normalizeIntegerInput(event.target.value))} placeholder="مبلغ کل بدهی" />
          <small>پرداخت‌شده: {formatMoney(product.paidTotal)} تومان · مانده: {formatMoney(String(remaining))} تومان</small>
        </label>
        {!debtOnly && <label className="field">مبلغ پرداخت این نوبت (تومان)
          <input required inputMode="numeric" value={amount ? faDigits(formatMoney(amount)) : ''} onChange={(event) => setAmount(normalizeIntegerInput(event.target.value))} placeholder="مبلغ پرداخت‌شده" />
          <small>حداکثر مبلغ قابل ثبت: {formatMoney(remaining)} تومان</small>
        </label>}
        {!debtOnly && <div className="field"><span>تاریخ پرداخت</span><PersianDatePicker value={settledAt} onChange={setSettledAt} disabled={busy} /></div>}
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose} disabled={busy}>انصراف</button><button type="submit" className="btn primary" disabled={busy}>{busy ? 'در حال ثبت…' : debtOnly ? 'ذخیره مبلغ بدهی' : 'ثبت پرداخت'}</button></div>
      </form>
    </section>
  </div>;
}

export default function SupplierSettlementsPage({ notify }: { notify: (message: string) => void }) {
  const [result, setResult] = useState<ProductPage>({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<SupplierProduct | null>(null);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [debtOnly, setDebtOnly] = useState(false);
  const [refresh, setRefresh] = useState(0);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setResult(await api<ProductPage>(`/supplier-settlements?page=${page}&pageSize=${pageSize}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'دریافت فهرست تسویه‌ها انجام نشد.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [page, pageSize, refresh]);

  async function saved(message: string) {
    setSelectedProduct(null);
    setDebtOnly(false);
    notify(message);
    setRefresh((value) => value + 1);
  }

  async function addedProduct() {
    setAddProductOpen(false);
    notify('قلم خرید به فهرست تسویه اضافه شد.');
    setRefresh((value) => value + 1);
  }

  return <div className="page-stack supplier-settlements-page">
    <div className="page-heading"><div><div className="eyebrow">حساب‌های خرید نهایی‌شده</div><h1>تسویه با تأمین‌کنندگان</h1><p>مبلغ فروش از پرونده خوانده می‌شود؛ مبلغ کل بدهی را وارد کنید و پرداخت‌های هر نوبت را از آن کم کنید.</p></div><button type="button" className="btn primary" onClick={() => setAddProductOpen(true)}>افزودن قلم خرید</button></div>
    {error && <div className="alert error" role="alert">{error}<button type="button" className="text-button" onClick={() => void load()}>تلاش دوباره</button></div>}
    {loading ? <LoadingIndicator label="در حال دریافت کالاهای تحویل‌شده…" /> : !result.items.length ? <div className="empty-state"><b>هنوز کالای تحویل‌شده‌ای برای تسویه ثبت نشده است.</b><span>از «افزودن قلم خرید» برای ثبت دستی کالای پرونده‌های قدیمی استفاده کنید.</span></div> : <>
      <div className="table-wrap supplier-settlement-table-wrap"><table className="data-table supplier-settlement-table">
        <thead><tr><th>#</th><th>کالا</th><th>راننده</th><th>مبلغ فروش</th><th>فروشگاه / تأمین‌کننده</th><th>بدهی تأمین‌کننده</th><th>پرداخت‌شده</th><th>مانده بدهی</th><th>ثبت تسویه</th></tr></thead>
        <tbody>{result.items.map((product, index) => <tr key={product.id}>
          <td className="row-number">{faNumber((page - 1) * pageSize + index + 1)}</td>
          <td><b>{product.title}</b><small className="supplier-product-quantity">{faNumber(product.quantity)} عدد</small></td>
          <td><b>{product.driver.fullName}</b><small className="supplier-product-quantity">{faDigits(product.driver.mobile)}{product.driver.archivedAt ? ' · آرشیو' : ''}</small></td>
          <td>{product.saleTotal === null ? 'ثبت نشده' : `${formatMoney(product.saleTotal)} تومان`}</td>
          <td>{product.payableTotal === null ? '—' : product.settlements.at(-1)?.storeName ?? '—'}</td>
          <td>{product.payableTotal === null ? '—' : `${formatMoney(product.payableTotal)} تومان`}</td>
          <td>{product.payableTotal === null ? '—' : `${formatMoney(product.paidTotal)} تومان`}</td>
          <td className={product.remaining && BigInt(product.remaining) > 0n ? 'supplier-balance-open' : ''}>{product.remaining === null ? '—' : `${formatMoney(product.remaining)} تومان`}</td>
          <td><div className="supplier-settlement-actions"><button type="button" className="btn small primary" disabled={product.remaining !== null && BigInt(product.remaining) <= 0n} onClick={() => { setDebtOnly(false); setSelectedProduct(product); }}>{product.payableTotal === null || (product.remaining !== null && BigInt(product.remaining) > 0n) ? 'ثبت پرداخت' : 'تسویه کامل'}</button>
            {product.payableTotal !== null && <button type="button" className="btn small" onClick={() => { setDebtOnly(true); setSelectedProduct(product); }}>ویرایش بدهی</button>}</div>
            {product.settlements.length > 0 && <details className="supplier-payment-history"><summary>{faNumber(product.settlements.length)} پرداخت ثبت‌شده</summary><div>{product.settlements.map((settlement) => <p key={settlement.id}><b>{settlement.storeName}</b><span>{formatMoney(settlement.amount)} تومان · {displayDate(settlement.settledAt)}</span><small>ثبت‌کننده: {settlement.registeredBy.name}</small></p>)}</div></details>}
          </td>
        </tr>)}</tbody>
      </table></div>
      <TablePagination page={page} pageSize={pageSize} total={result.total} disabled={loading} itemLabel="قلم کالا" onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />
    </>}
    {selectedProduct && <RecordSettlementModal product={selectedProduct} debtOnly={debtOnly} onClose={() => setSelectedProduct(null)} onSaved={saved} />}
    {addProductOpen && <AddPurchaseProductModal onClose={() => setAddProductOpen(false)} onSaved={addedProduct} />}
  </div>;
}
