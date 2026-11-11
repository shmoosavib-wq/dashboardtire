import { useState } from 'react';
import { api, displayDateTime, faNumber } from '../api';
import { can, type Document, type Driver, type User } from '../model';
import { categoryNames } from './labels';

function UploadButton({ category, driver, user, onUploaded, notify }: { category: string; driver: Driver; user: User; onUploaded: () => Promise<void>; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const label = categoryNames[category] || category;
  const uploadedDocument = category === 'CUSTOM' ? undefined : driver.documents?.find((document) => document.category === category && (document.stage === driver.currentStage || !document.stage));
  const allowed = category === 'CREDIT_RESULT' ? can(user, 'SALES_OPERATIONS', 'CREDIT_APPROVER')
    : can(user, 'SALES_OPERATIONS') || (['PROFORMA', 'CONTRACT', 'CHEQUE', 'DELIVERY', 'SATISFACTION_VIDEO'].includes(category) && can(user, 'LEGAL_FINANCE'));
  return <div className="upload-wrap">
    {uploadedDocument ? <div className="stage-document-ready">
      <span className="stage-document-check" aria-hidden="true">✓</span>
      <span className="stage-document-name"><b>{uploadedDocument.originalName}</b><small>{label} بارگذاری و در پرونده ذخیره شده</small></span>
      <a className="btn small" href={'/api/drivers/' + driver.id + '/documents/' + uploadedDocument.id + '/download'}>دانلود</a>
      <small className="stage-document-replace">برای بارگذاری نسخهٔ جایگزین، مدرک فعلی را از بخش مدارک پرونده حذف کنید.</small>
    </div> : <>
    {category === 'CUSTOM' && <input className="upload-title" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="عنوان دلخواه مدرک" aria-label="عنوان دلخواه مدرک" />}
    <label className={'upload-control ' + (!allowed ? 'disabled' : '')}>
    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,application/pdf,image/jpeg,image/png,image/webp,video/mp4" disabled={!allowed || busy} onChange={async (event) => {
      const file = event.target.files?.[0]; if (!file) return;
      setBusy(true);
      try {
        const data = new FormData(); data.append('file', file);
        const query = new URLSearchParams({ category, stage: driver.currentStage });
        if (category === 'CUSTOM') query.set('customTitle', customTitle);
        await api('/drivers/' + driver.id + '/documents?' + query.toString(), { method: 'POST', body: data });
        await onUploaded(); notify('مدرک بارگذاری و در پرونده ثبت شد.');
      } catch (reason) { notify(reason instanceof Error ? reason.message : 'بارگذاری فایل انجام نشد.'); }
      finally { event.target.value = ''; setBusy(false); }
    }} />
    <span className="upload-symbol">{busy ? '…' : '＋'}</span><span>{busy ? 'در حال بارگذاری…' : 'افزودن ' + label}</span>
    </label>
    </>}
  </div>;
}

function DocumentsTab({ driver, user, onUploaded, notify }: { driver: Driver; user: User; onUploaded: () => Promise<void>; notify: (message: string) => void }) {
  const [showAddDocument, setShowAddDocument] = useState(false);
  const categories = [...new Set((driver.documents || []).map((doc) => doc.category))];
  return <div className="tab-content">
    <div className="section-head"><div><div className="eyebrow">بایگانی پرونده</div><h3>مدارک راننده</h3><p>فایل‌ها به ترتیب ثبت نمایش داده می‌شوند؛ نسخهٔ قبلی با بارگذاری نسخهٔ تازه حفظ می‌شود.</p></div></div>
    <section className="document-upload-box"><div><b>افزودن مدرک</b><small>عنوان مدرک را وارد کنید و فایل PDF یا تصویر را بارگذاری کنید.</small></div><button className="btn subtle" onClick={() => setShowAddDocument(true)}>＋ افزودن مدرک</button></section>
    {!driver.documents?.length ? <div className="empty-state compact"><div className="empty-mark">▧</div><b>مدرکی ثبت نشده است</b><span>مدارک این راننده پس از بارگذاری در همین بخش می‌مانند.</span></div> : <div className="document-groups">{categories.map((category) => <section className="document-group" key={category}><h4>{categoryNames[category] || category}<span>{faNumber(driver.documents?.filter((doc) => doc.category === category).length || 0)}</span></h4><div className="document-list">{driver.documents?.filter((doc) => doc.category === category).map((doc) => <DocumentRow key={doc.id} document={doc} driver={driver} canDelete={can(user, 'SALES_OPERATIONS')} onDeleted={onUploaded} notify={notify} />)}</div></section>)}</div>}
    {showAddDocument && <AddDocumentModal driver={driver} user={user} onClose={() => setShowAddDocument(false)} onUploaded={onUploaded} notify={notify} />}
  </div>;
}

function AddDocumentModal({ driver, user, onClose, onUploaded, notify }: { driver: Driver; user: User; onClose: () => void; onUploaded: () => Promise<void>; notify: (message: string) => void }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allowed = can(user, 'SUPER_ADMIN', 'SALES_OPERATIONS');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !title.trim()) return;
    setBusy(true); setError('');
    try {
      const data = new FormData(); data.append('file', file);
      const query = new URLSearchParams({ category: 'CUSTOM', stage: driver.currentStage, customTitle: title.trim() });
      await api('/drivers/' + driver.id + '/documents?' + query.toString(), { method: 'POST', body: data });
      await onUploaded(); notify('مدرک بارگذاری و در پرونده ثبت شد.'); onClose();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'بارگذاری فایل انجام نشد.';
      setError(message); notify(message);
    } finally { setBusy(false); }
  }

  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-document-title">
    <div className="modal-head"><div><div className="eyebrow">بایگانی پرونده</div><h2 id="add-document-title">افزودن مدرک</h2><p>برای مدرک عنوان انتخاب کنید و فایل PDF یا تصویر را بارگذاری کنید.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="بستن">×</button></div>
    <form onSubmit={submit}><div className="form-grid">
      <label className="field wide">عنوان مدرک *<input autoFocus required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثلاً تأییدیه حساب" /></label>
      <label className="field wide">فایل مدرک *<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" disabled={!allowed || busy} onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
    </div>{file && <p className="muted-cell">{file.name}</p>}{error && <div className="alert error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn" onClick={onClose} disabled={busy}>انصراف</button><button className="btn primary" disabled={!allowed || busy || !title.trim() || !file}>{busy ? 'در حال بارگذاری…' : 'ثبت مدرک'}</button></div>
    </form>
  </section></div>;
}
function DocumentRow({ document, driver, canDelete, onDeleted, notify }: { document: Document; driver: Driver; canDelete: boolean; onDeleted: () => Promise<void>; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const date = displayDateTime(document.uploadedAt);
  const downloadUrl = '/api/drivers/' + driver.id + '/documents/' + document.id + '/download';
  async function remove() {
    setBusy(true);
    try {
      await api('/drivers/' + driver.id + '/documents/' + document.id, { method: 'DELETE' });
      await onDeleted(); notify('مدرک از پرونده حذف شد.'); setShowDeleteConfirm(false);
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'حذف مدرک انجام نشد.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="document-row"><span className="file-type">{document.mimeType === 'application/pdf' ? 'PDF' : document.mimeType.startsWith('video') ? 'MP4' : 'IMG'}</span><div className="document-main"><b>{document.customTitle || document.originalName}</b><small>{document.originalName} · {(document.sizeBytes / 1024 / 1024).toFixed(1)} مگابایت · {document.uploadedBy?.name || 'کاربر'} · {date}</small></div><a className="btn small" href={downloadUrl}>دانلود</a>{canDelete && <button className="btn small danger-ghost" type="button" onClick={() => setShowDeleteConfirm(true)}>حذف</button>}</div>
    {showDeleteConfirm && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && setShowDeleteConfirm(false)}><section className="modal compact-modal" role="alertdialog" aria-modal="true" aria-labelledby={'delete-document-' + document.id}>
      <div className="modal-head"><div><div className="eyebrow">حذف از پرونده</div><h2 id={'delete-document-' + document.id}>مدرک حذف شود؟</h2><p>«{document.customTitle || document.originalName}» از فهرست مدارک و دسترسی دانلود خارج می‌شود. رویداد حذف در تاریخچه باقی می‌ماند.</p></div><button type="button" className="icon-button" onClick={() => setShowDeleteConfirm(false)} disabled={busy} aria-label="بستن">×</button></div>
      <div className="modal-actions"><button type="button" className="btn" onClick={() => setShowDeleteConfirm(false)} disabled={busy}>انصراف</button><button type="button" className="btn danger" onClick={() => void remove()} disabled={busy}>{busy ? 'در حال حذف…' : 'حذف مدرک'}</button></div>
    </section></div>}
  </>;
}


export { UploadButton, DocumentsTab };
