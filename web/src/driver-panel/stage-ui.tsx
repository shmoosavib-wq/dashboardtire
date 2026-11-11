import { faDigits, faNumber, formatMoney, normalizeIntegerInput } from '../api';
import { can, type Driver, type Stage, type User } from '../model';
import PersianDatePicker from './PersianDatePicker';

export type FieldDef = { name: string; label: string; kind?: 'text' | 'textarea' | 'date' | 'number' | 'money' | 'check'; placeholder?: string; wide?: boolean };

const stageFields: Record<Stage, FieldDef[]> = {
  NEED_DECLARED: [{ name: 'intentNote', label: 'یادداشت اعلام تمایل', kind: 'textarea', wide: true, placeholder: 'توضیح کوتاه درباره تماس یا نیاز راننده' }],
  APP_VERIFICATION: [
    { name: 'smartFleetNumber', label: 'شماره هوشمند ناوگان' },
    { name: 'ownerVerified', label: 'مالکیت ناوگان بررسی و تأیید شد', kind: 'check', wide: true },
    { name: 'identityVerified', label: 'ثبت‌نام و احراز هویت در اپ تأیید شد', kind: 'check', wide: true },
  ],
  CREDIT_REVIEW: [
    { name: 'sababarTrips', label: 'تعداد سفر با اپ صبابار', kind: 'number' },
    { name: 'transportPayments', label: 'تعداد پرداخت در سامانه ترنسپورت', kind: 'number' },
    { name: 'lastWaybillDate', label: 'تاریخ آخرین بارنامه', kind: 'date' },
    { name: 'bankRank', label: 'رتبه اعتباری بانکی' },
    { name: 'suggestedLimit', label: 'سقف پیشنهادی اعتبار', kind: 'money' },
    { name: 'approvedLimit', label: 'سقف اعتبار مصوب', kind: 'money' },
    { name: 'decisionNote', label: 'یادداشت تصمیم یا علت رد', kind: 'textarea', wide: true, placeholder: 'اختیاری' },
  ],
  PROFORMA_PAYMENT_RESERVATION: [
    { name: 'invoiceNumber', label: 'شماره پیش‌فاکتور' }, { name: 'invoiceDate', label: 'تاریخ پیش‌فاکتور', kind: 'date' },
    { name: 'paymentAmount', label: 'مبلغ پرداخت اولیه', kind: 'money' }, { name: 'paymentDate', label: 'تاریخ پرداخت', kind: 'date' },
    { name: 'paymentReference', label: 'شماره پیگیری پرداخت' },
    { name: 'reservationLocation', label: 'محل رزرو کالا' }, { name: 'reservationDate', label: 'تاریخ رزرو', kind: 'date' },
    { name: 'paymentReceivedConfirmed', label: 'دریافت پیش‌پرداخت تأیید شد', kind: 'check', wide: true },
    { name: 'reservationConfirmed', label: 'کالا رزرو شد', kind: 'check', wide: true },
  ],
  CONTRACT_CHEQUE: [
    { name: 'contractNumber', label: 'شماره قرارداد' }, { name: 'chequeNumber', label: 'شماره چک' },
    { name: 'sayadId', label: 'شناسه صیادی' }, { name: 'chequeAmount', label: 'مبلغ چک', kind: 'money' },
    { name: 'chequeDueDate', label: 'تاریخ سررسید چک', kind: 'date' },
    { name: 'contractChecked', label: 'قرارداد بررسی و تأیید شد', kind: 'check', wide: true },
    { name: 'chequeChecked', label: 'چک بررسی و تأیید شد', kind: 'check', wide: true },
  ],
  DELIVERY_FINAL_DOCS: [
    { name: 'deliveryDate', label: 'تاریخ تحویل کالا', kind: 'date' },
    { name: 'deliveryLocation', label: 'محل تحویل' }, { name: 'recipient', label: 'تحویل‌گیرنده' },
    { name: 'contractPhysical', label: 'نسخه فیزیکی قرارداد تحویل شد', kind: 'check', wide: true },
    { name: 'chequePhysical', label: 'اصل فیزیکی چک تحویل شد', kind: 'check', wide: true },
    { name: 'goodsDelivered', label: 'کالا به راننده تحویل شد', kind: 'check', wide: true },
  ],
  COMPLETED: [],
};




function actionButtons(driver: Driver, user: User): { action: string; label: string; kind?: string }[] {
  if (driver.archivedAt || driver.currentStage === 'COMPLETED') return [];
  const stage = driver.currentStage;
  if (stage === 'NEED_DECLARED' && can(user, 'SALES_OPERATIONS')) return [{ action: 'SUBMIT_NEED', label: 'رفتن به مرحله بعد' }];
  if (stage === 'APP_VERIFICATION' && can(user, 'SALES_OPERATIONS')) return [{ action: 'VERIFY_APP', label: 'تأیید احراز هویت و ادامه' }];
  if (stage === 'CREDIT_REVIEW') {
    if (driver.stageStatus === 'AWAITING_CREDIT_APPROVAL' && can(user, 'CREDIT_APPROVER')) return [
      { action: 'REJECT_CREDIT', label: 'رد درخواست', kind: 'danger' },
      { action: 'REQUEST_CREDIT_CHANGES', label: 'درخواست اصلاح', kind: 'subtle' },
      { action: 'APPROVE_CREDIT', label: 'تأیید سقف اعتبار' },
    ];
    if (can(user, 'SALES_OPERATIONS') && driver.stageStatus !== 'AWAITING_CREDIT_APPROVAL') return [{ action: 'SUBMIT_CREDIT', label: 'ارسال برای تأیید اعتبار' }];
  }
  if (stage === 'PROFORMA_PAYMENT_RESERVATION') {
    if (driver.stageStatus === 'IN_PROGRESS' && can(user, 'SALES_OPERATIONS')) return [{ action: 'SUBMIT_PROFORMA', label: 'ثبت پیش‌فاکتور و انتظار پرداخت' }];
    if (driver.stageStatus === 'AWAITING_INITIAL_PAYMENT' && can(user, 'SALES_OPERATIONS')) return [{ action: 'REGISTER_INITIAL_PAYMENT', label: 'ثبت پرداخت برای تأیید مالی' }];
    if (driver.stageStatus === 'AWAITING_PAYMENT_CONFIRMATION' && can(user, 'LEGAL_FINANCE')) return [{ action: 'CONFIRM_INITIAL_PAYMENT', label: 'تأیید دریافت پرداخت' }];
    if (driver.stageStatus === 'PAYMENT_CONFIRMED_AWAITING_RESERVATION' && can(user, 'SALES_OPERATIONS')) return [{ action: 'RESERVE_GOODS', label: 'تأیید رزرو کالا' }];
  }
  if (stage === 'CONTRACT_CHEQUE') {
    if (driver.stageStatus === 'IN_PROGRESS' && can(user, 'SALES_OPERATIONS')) return [{ action: 'SUBMIT_CONTRACT_CHEQUE', label: 'ارسال قرارداد و چک برای بررسی' }];
    if (driver.stageStatus === 'AWAITING_LEGAL_FINANCE_APPROVAL' && can(user, 'LEGAL_FINANCE')) return [{ action: 'APPROVE_CONTRACT_CHEQUE', label: 'تأیید قرارداد و چک' }];
  }
  if (stage === 'DELIVERY_FINAL_DOCS' && can(user, 'SALES_OPERATIONS')) return [{ action: 'COMPLETE_DELIVERY', label: 'تکمیل تحویل و پرونده' }];
  return [];
}

function responsibleName(stage: Stage) {
  if (stage === 'CREDIT_REVIEW') return 'فروش و عملیات؛ تأیید نهایی با تأییدکننده اعتبار';
  if (stage === 'PROFORMA_PAYMENT_RESERVATION') return 'فروش و عملیات؛ تأیید پرداخت با مالی';
  if (stage === 'CONTRACT_CHEQUE') return 'فروش و عملیات؛ تأیید مدارک با حقوقی و مالی';
  return stage === 'COMPLETED' ? 'پایان فرایند' : 'فروش و عملیات';
}


function Field({ field, value, disabled, onChange }: { field: FieldDef; value: unknown; disabled: boolean; onChange: (value: unknown) => void }) {
  const text = value === undefined || value === null ? '' : String(value);
  if (field.kind === 'check') return <label className={'check-field ' + (field.wide ? 'wide' : '')}><input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span className="custom-check" /><span>{field.label}</span></label>;
  if (field.kind === 'textarea') return <label className={'field ' + (field.wide ? 'wide' : '')}>{field.label}<textarea rows={3} maxLength={2000} disabled={disabled} value={text} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} /></label>;
  if (field.kind === 'money' || field.kind === 'number') return <label className={'field ' + (field.wide ? 'wide' : '')}>{field.label}<div className="input-unit"><input type="text" inputMode="numeric" disabled={disabled} value={field.kind === 'money' ? formatMoney(text) : faDigits(text)} onChange={(e) => onChange(normalizeIntegerInput(e.target.value))} placeholder="۰" /><span>{field.kind === 'money' ? 'تومان' : 'عدد'}</span></div></label>;
  if (field.kind === 'date') return <label className={'field ' + (field.wide ? 'wide' : '')}>{field.label}<PersianDatePicker value={text} disabled={disabled} onChange={onChange} /></label>;
  return <label className={'field ' + (field.wide ? 'wide' : '')}>{field.label}<input type="text" disabled={disabled} value={text} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} /></label>;
}

function categoriesFor(stage: Stage) {
  if (stage === 'APP_VERIFICATION') return ['IDENTITY'];
  if (stage === 'CREDIT_REVIEW') return ['CREDIT_RESULT'];
  if (stage === 'PROFORMA_PAYMENT_RESERVATION') return ['PROFORMA'];
  if (stage === 'CONTRACT_CHEQUE') return ['CONTRACT', 'CHEQUE'];
  if (stage === 'DELIVERY_FINAL_DOCS') return ['DELIVERY', 'SATISFACTION_VIDEO'];
  return [];
}


export { actionButtons, responsibleName, Field, categoriesFor, stageFields };
