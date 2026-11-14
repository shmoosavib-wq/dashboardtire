import { useEffect, useRef, useState } from 'react';
import { api, displayDateTime, faDigits, faNumber, jsonBody } from './api';
import { can, stageList, type Driver, type Stage, type User } from './model';
import LoadingIndicator from './LoadingIndicator';
import { statusLabel } from './driver-panel/labels';
import { actionButtons, categoriesFor, Field, responsibleName, stageFields, type FieldDef } from './driver-panel/stage-ui';
import { StageHistory } from './driver-panel/StageHistory';
import { ArchiveModal, DocumentsTab, HistoryTab, PurchaseSummary, UploadButton } from './driver-panel/records';

const historicalProductFields: FieldDef[] = [
  { name: 'title', label: 'نام کالا' },
  { name: 'quantity', label: 'تعداد', kind: 'number' },
  { name: 'saleUnitPrice', label: 'قیمت فروش هر واحد', kind: 'money' },
  { name: 'supplyUnitCost', label: 'قیمت تأمین هر واحد', kind: 'money' },
];

function hasStageDocument(driver: Driver, category: string) {
  return driver.documents?.some((document) => document.category === category && (document.stage === driver.currentStage || !document.stage)) || false;
}

function actionMissingDocuments(driver: Driver, action: string) {
  if (action === 'SUBMIT_PROFORMA') return !hasStageDocument(driver, 'PROFORMA');
  if (action === 'SUBMIT_CONTRACT_CHEQUE') return !hasStageDocument(driver, 'CONTRACT') || !hasStageDocument(driver, 'CHEQUE');
  return false;
}

export default function DriverPanel({ driverId, viewMode, user, notify, onClose, onChanged }: {
  driverId: string; viewMode: 'flow' | 'dossier'; user: User; notify: (message: string) => void; onClose: () => void; onChanged: (stage?: Stage) => void;
}) {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [editPayload, setEditPayload] = useState<Record<string, unknown>>({});
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const loadVersion = useRef(0);

  async function load(options: { preserveCurrentPayload?: boolean } = {}) {
    const version = ++loadVersion.current;
    const currentPayload = options.preserveCurrentPayload ? payload : undefined;
    setError('');
    try {
      const value = await api<Driver>('/drivers/' + driverId);
      if (version !== loadVersion.current) return;
      setDriver(value);
      const active = value.drafts?.find((item) => item.stage === value.currentStage);
      setPayload(currentPayload ?? active?.payload ?? {});
    } catch (reason) {
      if (version === loadVersion.current) setError(reason instanceof Error ? reason.message : 'پرونده دریافت نشد.');
    }
  }
  useEffect(() => {
    setDriver(null);
    setPayload({});
    void load();
  }, [driverId, viewMode]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (editingStage) setEditingStage(null);
      else if (archiveOpen) setArchiveOpen(false);
      else onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, archiveOpen, editingStage]);

  async function saveDraft() {
    if (!driver) return;
    setBusy(true); setError('');
    try {
      await api('/drivers/' + driver.id + '/draft', { method: 'PATCH', body: jsonBody({ stage: driver.currentStage, payload }) });
      onChanged(driver.currentStage); onClose(); notify('پیش‌نویس این مرحله ذخیره و پنجره بسته شد.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ذخیره انجام نشد.'); }
    finally { setBusy(false); }
  }

  function editPreviousStage(stage: Stage) {
    const saved = driver?.drafts?.find((item) => item.stage === stage);
    if (!saved) return;
    setEditingStage(stage);
    setEditPayload({ ...saved.payload });
    setEditError('');
  }

  function updateHistoricalProduct(index: number, name: string, value: unknown) {
    setEditPayload((previous) => {
      const products = Array.isArray(previous.products) ? [...previous.products] as Record<string, unknown>[] : [];
      products[index] = { ...(products[index] || {}), [name]: value };
      return { ...previous, products };
    });
  }

  function addHistoricalProduct() {
    setEditPayload((previous) => ({ ...previous, products: [...(Array.isArray(previous.products) ? previous.products : []), { title: '', quantity: '', saleUnitPrice: '', supplyUnitCost: '' }] }));
  }

  function removeHistoricalProduct(index: number) {
    setEditPayload((previous) => ({ ...previous, products: (Array.isArray(previous.products) ? previous.products : []).filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function savePreviousStage() {
    if (!driver || !editingStage) return;
    setEditBusy(true); setEditError('');
    try {
      await api('/drivers/' + driver.id + '/draft', { method: 'PATCH', body: jsonBody({ stage: editingStage, payload: editPayload }) });
      const editedTitle = stageList.find((item) => item.id === editingStage)?.title || 'مرحله';
      setEditingStage(null);
      await load();
      onChanged(driver.currentStage);
      notify(`اطلاعات «${editedTitle}» اصلاح و در تاریخچه ثبت شد.`);
    } catch (reason) {
      setEditError(reason instanceof Error ? reason.message : 'اصلاح اطلاعات ذخیره نشد.');
    } finally { setEditBusy(false); }
  }

  async function act(action: string) {
    if (!driver) return;
    setBusy(true); setError('');
    try {
      const updated = await api<Driver>('/drivers/' + driver.id + '/actions', { method: 'POST', body: jsonBody({ action, payload, note: typeof payload.decisionNote === 'string' && payload.decisionNote.trim() ? payload.decisionNote.trim() : undefined }) });
      onChanged(updated.currentStage); onClose(); notify('اقدام ثبت شد؛ پرونده در مرحلهٔ بعد قرار گرفت.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'اقدام انجام نشد.'); }
    finally { setBusy(false); }
  }

  async function backToPreviousStage() {
    if (!driver) return;
    setBusy(true); setError('');
    try {
      if (canEdit && !readOnlyReview && driver.currentStage !== 'COMPLETED') {
        await api('/drivers/' + driver.id + '/draft', { method: 'PATCH', body: jsonBody({ stage: driver.currentStage, payload }) });
      }
      const updated = await api<Driver>('/drivers/' + driver.id + '/back', { method: 'POST' });
      onChanged(updated.currentStage); onClose(); notify('پرونده به مرحلهٔ قبل برگشت؛ اطلاعات و مدارک قبلی حفظ شدند.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'بازگشت به مرحلهٔ قبل انجام نشد.'); }
    finally { setBusy(false); }
  }

  async function archive(reason: string) {
    if (!driver) return;
    setBusy(true); setError('');
    try {
      await api('/drivers/' + driver.id + '/archive', { method: 'POST', body: jsonBody({ reason }) });
      setArchiveOpen(false); await load(); onChanged(); notify('پرونده به آرشیو منتقل شد.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'آرشیو انجام نشد.'); }
    finally { setBusy(false); }
  }

  if (!driver) return viewMode === 'dossier' ? <div className="dossier-loading"><LoadingIndicator label="در حال بارگذاری پرونده…" />{error && <div className="alert error">{error}</div>}</div> : <div className="workflow-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="workflow-dialog workflow-loading-dialog" role="dialog" aria-modal="true" aria-labelledby="workflow-loading-title"><header className="workflow-dialog-head"><div><span className="eyebrow">اقدام روی پرونده راننده</span><h2 id="workflow-loading-title">در حال بارگذاری مرحله</h2></div><button className="icon-button" onClick={onClose} aria-label="بستن">×</button></header><div className="workflow-dialog-body"><div className="workflow-loading">{error ? <div className="alert error" role="alert">{error}<button className="text-button" onClick={() => void load()}>تلاش دوباره</button></div> : <LoadingIndicator label="در حال دریافت اطلاعات پرونده…" />}</div></div></section></div>;
  const stageIndex = stageList.findIndex((item) => item.id === driver.currentStage);
  const activeTab = stageList.find((item) => item.id === driver.currentStage)?.title || 'پرونده';
  const drafts = driver.drafts || [];
  const currentDraft = drafts.find((item) => item.stage === driver.currentStage);
  const isArchived = Boolean(driver.archivedAt);
  const financeReview = driver.currentStage === 'PROFORMA_PAYMENT_RESERVATION' && driver.stageStatus === 'AWAITING_PAYMENT_CONFIRMATION' && can(user, 'LEGAL_FINANCE');
  const creditReview = driver.currentStage === 'CREDIT_REVIEW' && driver.stageStatus === 'AWAITING_CREDIT_APPROVAL' && can(user, 'CREDIT_APPROVER');
  const contractReview = driver.currentStage === 'CONTRACT_CHEQUE' && driver.stageStatus === 'AWAITING_LEGAL_FINANCE_APPROVAL' && can(user, 'LEGAL_FINANCE');
  const canEdit = !isArchived && (driver.currentStage === 'CREDIT_REVIEW'
    ? can(user, 'SALES_OPERATIONS', 'CREDIT_APPROVER')
    : ['PROFORMA_PAYMENT_RESERVATION', 'CONTRACT_CHEQUE'].includes(driver.currentStage)
      ? can(user, 'SALES_OPERATIONS', 'LEGAL_FINANCE')
      : driver.currentStage === 'DELIVERY_FINAL_DOCS' ? can(user, 'SALES_OPERATIONS', 'LEGAL_FINANCE')
      : can(user, 'SALES_OPERATIONS'));
  const readOnlyReview = financeReview || (driver.stageStatus === 'AWAITING_CREDIT_APPROVAL' && !creditReview) || (driver.stageStatus === 'AWAITING_LEGAL_FINANCE_APPROVAL' && !contractReview);
  const editingFields = (stageFields[driver.currentStage] || []).filter((field) =>
    field.name !== 'paymentReceivedConfirmed' || (financeReview && driver.stageStatus === 'AWAITING_PAYMENT_CONFIRMATION')
  ).filter((field) => field.name !== 'reservationConfirmed' || driver.stageStatus === 'PAYMENT_CONFIRMED_AWAITING_RESERVATION');
  const fileCategories = categoriesFor(driver.currentStage);

  async function doRestore() {
    const currentDriverId = driver?.id;
    if (!currentDriverId) return;
    setBusy(true);
    try { await api('/drivers/' + currentDriverId + '/restore', { method: 'POST' }); await load(); onChanged(); notify('پرونده به فهرست فعال برگشت.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'بازیابی انجام نشد.'); }
    finally { setBusy(false); }
  }

  if (viewMode === 'dossier') return <div className="dossier-page">
    <div className="dossier-sticky-actions">
      <div className="dossier-sticky-left">
        <button className="icon-button" onClick={onClose} aria-label="بازگشت">←</button>
        <strong>پرونده راننده</strong>
        <span className="status-pill">{stageList.find((item) => item.id === driver.currentStage)?.compact || 'تکمیل‌شده'}</span>
        <span className="status-pill">{statusLabel[driver.stageStatus] || statusLabel[driver.currentStage]}</span>
      </div>
      <div className="dossier-sticky-right">
        {isArchived ? <button className="btn subtle" onClick={() => void doRestore()} disabled={!can(user, 'SUPER_ADMIN') || busy}>بازگردانی پرونده</button> : can(user, 'SALES_OPERATIONS') && <button className="btn danger-ghost" onClick={() => setArchiveOpen(true)}>آرشیو پرونده</button>}
      </div>
    </div>
    <header className="dossier-driver-head">
      <div className="drawer-title">
        <span className="driver-avatar large">{driver.fullName.slice(0, 1)}</span>
        <div>
          <div className="eyebrow">پرونده راننده · {faDigits(driver.mobile)}</div>
          <h2>{driver.fullName}</h2>
          <small>{driver.nationalId ? 'کد ملی ' + faDigits(driver.nationalId) : 'کد ملی ثبت نشده'}{driver.productHint ? ' · ' + driver.productHint : ''}</small>
        </div>
      </div>
      <span className="dossier-cycle-count">{faNumber(driver.auditEvents?.length || 0)} رویداد ثبت‌شده</span>
    </header>
    {error && <div className="alert error">{error}<button className="text-button" onClick={() => void load()}>تلاش دوباره</button></div>}
    <div className="dossier-sections">
      <section className="dossier-block dossier-documents"><DocumentsTab driver={driver} user={user} onUploaded={load} notify={notify} /></section>
      {(driver.currentStage === 'DELIVERY_FINAL_DOCS' || driver.currentStage === 'COMPLETED') && !driver.documents?.some((document) => document.category === 'SATISFACTION_VIDEO') && <div className="alert missing-video-warning" role="status">{'\u0648\u06cc\u062f\u0626\u0648\u06cc \u0631\u0636\u0627\u06cc\u062a \u0628\u0627\u0631\u06af\u0630\u0627\u0631\u06cc \u0646\u0634\u062f\u0647'}</div>}
      <div className="dossier-stepper"><div className="stage-line">{stageList.map((stage, index) => { const done = stageIndex > index || driver.currentStage === 'COMPLETED'; const current = stage.id === driver.currentStage; return <div className={'stage-node ' + (done ? 'done ' : '') + (current ? 'current' : '')} key={stage.id}><span>{done ? '✓' : faNumber(index + 1)}</span><small>{stage.compact}</small></div>; })}</div><span className="status-pill">{statusLabel[driver.stageStatus] || statusLabel[driver.currentStage]}</span></div>
      <section className="dossier-block"><DossierOverview driver={driver} /></section>
      <section className="dossier-block"><StageHistory driver={driver} user={user} onEdit={editPreviousStage} /></section>
      <section className="dossier-block"><HistoryTab events={driver.auditEvents || []} /></section>
    </div>
    {editingStage && <div className="workflow-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditingStage(null)}>
      <section className="workflow-dialog historical-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="historical-edit-title">
        <header className="workflow-dialog-head"><div><span className="eyebrow">اصلاح اطلاعات ثبت‌شده</span><h2 id="historical-edit-title">{stageList.find((item) => item.id === editingStage)?.title}</h2></div><button className="icon-button" onClick={() => setEditingStage(null)} aria-label="بستن">×</button></header>
        <div className="workflow-context"><span><b>راننده:</b> {driver.fullName}</span><span><b>مرحلهٔ جاری:</b> {stageList.find((item) => item.id === driver.currentStage)?.title || 'تکمیل‌شده'}</span></div>
        <div className="workflow-dialog-body">
          <div className="review-notice"><b>اصلاح مرحلهٔ قبلی</b><span>مرحلهٔ جاری تغییر نمی‌کند. نام کاربر، زمان و فیلدهای اصلاح‌شده در تاریخچهٔ پرونده ثبت می‌شود؛ اطلاعات مراحل بعد را پس از اصلاح بازبینی کنید.</span></div>
          {editError && <div className="alert error" role="alert">{editError}</div>}
          <div className="stage-form-grid">{stageFields[editingStage].map((field) => <Field key={field.name} field={field} value={editPayload[field.name]} disabled={editBusy} onChange={(value) => { setEditError(''); setEditPayload((old) => ({ ...old, [field.name]: value })); }} />)}</div>
          {editingStage === 'PROFORMA_PAYMENT_RESERVATION' && <section className="historical-products">
            <div className="section-head"><div><h4>کالاهای ثبت‌شده</h4><p>عنوان، تعداد و قیمت هر قلم را اصلاح کنید.</p></div><button className="btn small subtle" type="button" disabled={editBusy} onClick={addHistoricalProduct}>＋ افزودن کالا</button></div>
            {(Array.isArray(editPayload.products) ? editPayload.products as Record<string, unknown>[] : []).map((product, index) => <div className="historical-product-row" key={index}>
              {historicalProductFields.map((field) => <Field key={field.name} field={field} value={product[field.name]} disabled={editBusy} onChange={(value) => updateHistoricalProduct(index, field.name, value)} />)}
              <button className="btn small danger-ghost" type="button" disabled={editBusy} onClick={() => removeHistoricalProduct(index)}>حذف</button>
            </div>)}
          </section>}
        </div>
        <footer className="workflow-dialog-actions"><button className="btn" disabled={editBusy} onClick={() => setEditingStage(null)}>انصراف</button><button className="btn primary" disabled={editBusy} onClick={() => void savePreviousStage()}>{editBusy ? 'در حال ذخیره…' : 'ذخیرهٔ اصلاحات'}</button></footer>
      </section>
    </div>}
    {archiveOpen && <ArchiveModal onClose={() => setArchiveOpen(false)} onSubmit={archive} busy={busy} />}
  </div>;

  return <div className="workflow-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="workflow-dialog" role="dialog" aria-modal="true" aria-labelledby="workflow-title">
      <header className="workflow-dialog-head">
        <div><span className="eyebrow">{'\u0627\u0642\u062f\u0627\u0645 \u0631\u0648\u06cc \u067e\u0631\u0648\u0646\u062f\u0647 \u0631\u0627\u0646\u0646\u062f\u0647'}</span><h2 id="workflow-title">{activeTab}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label={'\u0628\u0633\u062a\u0646'}>×</button>
      </header>
      <div className="workflow-context">
        <span><b>{'\u0631\u0627\u0646\u0646\u062f\u0647:'}</b> {driver.fullName}</span>
        <span><b>{'\u0645\u0648\u0628\u0627\u06cc\u0644:'}</b> {faDigits(driver.mobile)}</span>
        <span><b>{'\u0645\u0631\u062d\u0644\u0647:'}</b> {activeTab}</span>
        <span><b>{'\u062b\u0628\u062a\u200c\u06a9\u0646\u0646\u062f\u0647 \u0627\u0642\u062f\u0627\u0645:'}</b> {user.name}</span>
      </div>
      <div className="workflow-dialog-body">
        {error && <div className="alert error" role="alert">{error}<button className="text-button" onClick={() => void load()}>{'\u062a\u0644\u0627\u0634 \u062f\u0648\u0628\u0627\u0631\u0647'}</button></div>}
        <div className="stage-content" key={driver.currentStage}>
          {driver.currentStage === 'COMPLETED' ? <section className="complete-banner"><span>✓</span><div><strong>{'\u067e\u0631\u0648\u0646\u062f\u0647\u0654 \u0641\u0631\u0648\u0634 \u062a\u06a9\u0645\u06cc\u0644 \u0634\u062f\u0647 \u0627\u0633\u062a'}</strong><small>{'\u0645\u062f\u0627\u0631\u06a9\u060c \u0645\u0631\u0627\u062d\u0644 \u0648 \u0631\u0648\u06cc\u062f\u0627\u062f\u0647\u0627\u06cc \u067e\u0631\u0648\u0646\u062f\u0647 \u062f\u0631 \u0628\u062e\u0634\u200c\u0647\u0627\u06cc \u067e\u0631\u0648\u0646\u062f\u0647 \u062f\u0631 \u062f\u0633\u062a\u0631\u0633 \u0647\u0633\u062a\u0646\u062f.'}</small></div></section> : <>
            <div className="stage-context"><div><span className="eyebrow">{'\u0645\u0631\u062d\u0644\u0647'} {faNumber(stageIndex + 1, { minimumIntegerDigits: 2 })} {'\u0627\u0632'} ۶</span><p>{'\u0645\u0633\u0626\u0648\u0644 \u067e\u06cc\u06af\u06cc\u0631\u06cc:'} <b>{responsibleName(driver.currentStage)}</b></p></div><div className="draft-meta">{currentDraft ? <><span>{'\u067e\u06cc\u0634\u200c\u0646\u0648\u06cc\u0633 \u0630\u062e\u06cc\u0631\u0647\u200c\u0634\u062f\u0647'}</span><small>{'\u0622\u062e\u0631\u06cc\u0646 \u0630\u062e\u06cc\u0631\u0647:'} {displayDateTime(currentDraft.updatedAt)} · {currentDraft.updatedBy?.name || 'کاربر سامانه'}</small></> : <span>{'\u0647\u0646\u0648\u0632 \u067e\u06cc\u0634\u200c\u0646\u0648\u06cc\u0633\u06cc \u0630\u062e\u06cc\u0631\u0647 \u0646\u0634\u062f\u0647'}</span>}</div></div>
            {driver.currentStage === 'CREDIT_REVIEW' && driver.stageStatus.startsWith('AWAITING') && <div className="review-notice"><b>{'\u0627\u0637\u0644\u0627\u0639\u0627\u062a \u062b\u0628\u062a\u200c\u0634\u062f\u0647 \u0628\u0631\u0627\u06cc \u0628\u0631\u0631\u0633\u06cc'}</b><span>{'\u0639\u062f\u062f \u0633\u0641\u0631\u0647\u0627\u060c \u067e\u0631\u062f\u0627\u062e\u062a\u200c\u0647\u0627 \u0648 \u0631\u062a\u0628\u0647\u0654 \u0627\u0639\u062a\u0628\u0627\u0631\u06cc \u0627\u0632 \u0647\u0645\u06cc\u0646 \u067e\u0631\u0648\u0646\u062f\u0647 \u0628\u0631\u0627\u06cc \u062a\u0635\u0645\u06cc\u0645\u200c\u06af\u06cc\u0631\u0646\u062f\u0647 \u0646\u0645\u0627\u06cc\u0634 \u062f\u0627\u062f\u0647 \u0645\u06cc\u200c\u0634\u0648\u062f.'}</span></div>}
            <div className="stage-form-grid">{editingFields.map((field) => {
              const creditEntryField = ['sababarTrips', 'transportPayments', 'lastWaybillDate', 'bankRank', 'suggestedLimit'].includes(field.name);
              const editablePaymentConfirmation = field.name === 'paymentReceivedConfirmed' && financeReview;
              const waitingForFinance = driver.currentStage === 'PROFORMA_PAYMENT_RESERVATION' && driver.stageStatus === 'AWAITING_PAYMENT_CONFIRMATION';
              const readOnly = !canEdit || (readOnlyReview && !editablePaymentConfirmation) || (waitingForFinance && !editablePaymentConfirmation) || (creditReview && creditEntryField) || (contractReview && !['contractChecked', 'chequeChecked', 'chequeAmount', 'chequeNumber', 'chequeDueDate'].includes(field.name));
              return <Field key={field.name} field={field} value={payload[field.name]} disabled={readOnly} onChange={(value) => { setError(''); setPayload((old) => ({ ...old, [field.name]: value })); }} />;
            })}</div>
            {!isArchived && fileCategories.length > 0 && <section className="stage-docs"><div className="section-head"><div><h4>{'\u0645\u062f\u0627\u0631\u06a9 \u0627\u06cc\u0646 \u0645\u0631\u062d\u0644\u0647'}</h4><p>{'\u0641\u0627\u06cc\u0644\u200c\u0647\u0627 \u0628\u0644\u0627\u0641\u0627\u0635\u0644\u0647 \u062b\u0628\u062a \u0645\u06cc\u200c\u0634\u0648\u0646\u062f \u0648 \u062f\u0631 \u067e\u0631\u0648\u0646\u062f\u0647 \u0628\u0627\u0642\u06cc \u0645\u06cc\u200c\u0645\u0627\u0646\u0646\u062f.'}</p></div></div><div className="upload-row">{fileCategories.map((category) => <UploadButton key={category} category={category} driver={driver} user={user} onUploaded={() => load({ preserveCurrentPayload: true })} notify={notify} />)}</div></section>}
            {driver.stageStatus === 'CREDIT_REJECTED' && <div className="rejected-note"><span>!</span><div><b>{'\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0627\u0639\u062a\u0628\u0627\u0631 \u0631\u062f \u0634\u062f\u0647 \u0627\u0633\u062a.'}</b><small>{String(payload.decisionNote || 'یادداشتی ثبت نشده است.')}</small></div></div>}
          </>}
        </div>
      </div>
      <footer className="workflow-dialog-actions">
        <button className="btn" onClick={onClose}>{'\u0628\u0633\u062a\u0646'}</button>
        {(stageIndex > 0 || driver.currentStage === 'COMPLETED') && !isArchived && can(user, 'SALES_OPERATIONS', 'LEGAL_FINANCE') && <button className="btn" disabled={busy} onClick={() => void backToPreviousStage()}>{busy ? 'در حال بازگشت…' : 'بازگشت به مرحلهٔ قبل'}</button>}
        {driver.currentStage !== 'COMPLETED' && <>
          {canEdit && !readOnlyReview && <button className="btn" disabled={busy} onClick={() => void saveDraft()}>{busy ? '\u0630\u062e\u06cc\u0631\u0647\u2026' : '\u0630\u062e\u06cc\u0631\u0647 \u0645\u0648\u0642\u062a'}</button>}
          <div className="workflow-primary-actions">{actionButtons(driver, user).map((item) => {
            const confirmationMissing = (item.action === 'CONFIRM_INITIAL_PAYMENT' && payload.paymentReceivedConfirmed !== true) || (item.action === 'RESERVE_GOODS' && payload.reservationConfirmed !== true);
            const documentMissing = actionMissingDocuments(driver, item.action);
            return <button key={item.action} className={'btn ' + (item.kind || 'primary')} disabled={busy || confirmationMissing || documentMissing} title={documentMissing ? 'ابتدا مدارک لازم همین مرحله را بارگذاری کنید.' : undefined} onClick={() => void act(item.action)}>{item.label}</button>;
          })}</div>
        </>}
      </footer>
    </section>
  </div>;
}

function DossierOverview({ driver }: { driver: Driver }) {
  const currentStage = stageList.find((stage) => stage.id === driver.currentStage);
  const draft = driver.drafts?.find((item) => item.stage === 'PROFORMA_PAYMENT_RESERVATION')?.payload || {};
  return <div className="dossier-overview">
    <section className="dossier-status"><div><small>وضعیت فعلی پرونده</small><strong>{currentStage?.title || 'فرایند تکمیل شده'}</strong></div><span className="status-pill">{statusLabel[driver.stageStatus] || statusLabel[driver.currentStage]}</span></section>
    <section className="dossier-section"><h3>مشخصات راننده</h3><div className="dossier-facts"><div><small>نام و نام خانوادگی</small><b>{driver.fullName}</b></div><div><small>شماره موبایل</small><b>{faDigits(driver.mobile)}</b></div><div><small>کد ملی</small><b>{driver.nationalId ? faDigits(driver.nationalId) : 'ثبت نشده'}</b></div><div><small>تاریخ ایجاد پرونده</small><b>{displayDateTime(driver.createdAt)}</b></div><div className="wide"><small>کالای موردنظر / خریداری‌شده</small><b>{driver.products?.map((item) => `${item.title} · ${faNumber(item.quantity)} عدد`).join('، ') || driver.productHint || 'هنوز ثبت نشده'}</b></div></div></section>
    <section className="dossier-section dossier-records"><div><span>مدارک پرونده</span><b>{faNumber(driver.documents?.length || 0)}</b></div><div><span>رویدادهای ثبت‌شده</span><b>{faNumber(driver.auditEvents?.length || 0)}</b></div><div><span>قلم کالای ثبت‌شده</span><b>{faNumber(driver.products?.length || 0)}</b></div></section>
    {Object.keys(draft).length > 0 && <section className="dossier-section"><h3>خلاصهٔ خرید</h3><PurchaseSummaryForDossier driver={driver} /></section>}
  </div>;
}

function PurchaseSummaryForDossier({ driver }: { driver: Driver }) { return <PurchaseSummary driver={driver} />; }

