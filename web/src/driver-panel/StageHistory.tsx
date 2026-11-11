import { asciiDigits, displayDate, displayDateTime, faDigits, faNumber, formatMoney } from '../api';
import { can, stageList, type Driver, type Role, type Stage, type User } from '../model';
import { stageFields } from './stage-ui';

const editRoles: Partial<Record<Stage, Role[]>> = {
  NEED_DECLARED: ['SALES_OPERATIONS'],
  APP_VERIFICATION: ['SALES_OPERATIONS'],
  CREDIT_REVIEW: ['SALES_OPERATIONS', 'CREDIT_APPROVER'],
  PROFORMA_PAYMENT_RESERVATION: ['SALES_OPERATIONS', 'LEGAL_FINANCE'],
  CONTRACT_CHEQUE: ['SALES_OPERATIONS', 'LEGAL_FINANCE'],
  DELIVERY_FINAL_DOCS: ['SALES_OPERATIONS', 'LEGAL_FINANCE'],
};

function valueLabel(kind: string | undefined, value: unknown) {
  if (typeof value === 'boolean') return value ? 'تأیید شده' : 'تأیید نشده';
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (kind === 'date') return displayDate(text);
  if (kind === 'money') return `${formatMoney(text)} تومان`;
  if (kind === 'number') {
    const parsed = Number(asciiDigits(text).replace(/[٬,\s]/g, ''));
    return Number.isSafeInteger(parsed) ? faNumber(parsed) : faDigits(text);
  }
  return faDigits(text);
}

function StageHistory({ driver, user, onEdit }: {
  driver: Driver;
  user: User;
  onEdit: (stage: Stage) => void;
}) {
  const currentIndex = driver.currentStage === 'COMPLETED'
    ? stageList.length
    : stageList.findIndex((stage) => stage.id === driver.currentStage);
  const previousStages = currentIndex > 0
    ? stageList.slice(0, currentIndex).filter((stage) => driver.drafts?.some((draft) => draft.stage === stage.id))
    : [];

  return <section className="dossier-section stage-history">
    <div className="section-head">
      <div><h3>اطلاعات ثبت‌شده در مراحل</h3><p>اصلاح هر مرحله با نام کاربر و زمان در تاریخچه ثبت می‌شود.</p></div>
      <span className="count-chip">{faNumber(previousStages.length)} مرحله</span>
    </div>
    {!previousStages.length ? <div className="empty-state compact">هنوز مرحلهٔ قبلی برای نمایش وجود ندارد.</div> : <div className="stage-history-list">
      {previousStages.map((stage) => {
        const draft = driver.drafts?.find((item) => item.stage === stage.id);
        if (!draft) return null;
        const fields = stageFields[stage.id].filter((field) => draft.payload[field.name] !== undefined && draft.payload[field.name] !== '');
        const products = stage.id === 'PROFORMA_PAYMENT_RESERVATION' && Array.isArray(draft.payload.products)
          ? draft.payload.products as Record<string, unknown>[]
          : [];
        const wasCorrected = driver.auditEvents?.some((event) => event.eventType === 'STAGE_DRAFT_CORRECTED' && event.details.stage === stage.id);
        const roles = editRoles[stage.id] || [];
        return <article className="stage-history-row" key={stage.id}>
          <header><div className="stage-history-title"><span className="stage-history-check">✓</span><div><strong>{stage.title}</strong><small>{draft.updatedBy?.name || 'کاربر سامانه'} · {displayDateTime(draft.updatedAt)}</small></div></div>
            {wasCorrected && <span className="status-pill corrected">اصلاح‌شده</span>}
            {!driver.archivedAt && can(user, ...roles) && <button className="btn small subtle" onClick={() => onEdit(stage.id)}>ویرایش اطلاعات</button>}
          </header>
          {fields.length ? <dl>{fields.map((field) => <div key={field.name}><dt>{field.label}</dt><dd>{valueLabel(field.kind, draft.payload[field.name])}</dd></div>)}</dl> : <p className="stage-history-empty">اطلاعاتی برای این مرحله ثبت نشده است.</p>}
          {products.length > 0 && <div className="stage-history-products">{products.map((product, index) => <div key={index}><strong>{String(product.title || 'کالا')}</strong><span>{valueLabel('number', product.quantity)} عدد</span><span>فروش: {valueLabel('money', product.saleUnitPrice)}</span><span>تأمین: {valueLabel('money', product.supplyUnitCost)}</span></div>)}</div>}
        </article>;
      })}
    </div>}
  </section>;
}

export { StageHistory };
