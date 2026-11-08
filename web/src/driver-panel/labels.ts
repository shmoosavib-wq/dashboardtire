const statusLabel: Record<string, string> = {
  IN_PROGRESS: 'در حال انجام',
  AWAITING_CREDIT_APPROVAL: 'منتظر تأیید اعتبار',
  CREDIT_REJECTED: 'اعتبار رد شده · امکان اصلاح و ارسال مجدد',
  CREDIT_CHANGES_REQUESTED: 'برای اصلاح برگشت داده شده',
  AWAITING_INITIAL_PAYMENT: 'پیش‌فاکتور ارسال شد · منتظر پرداخت',
  AWAITING_PAYMENT_CONFIRMATION: 'اطلاعات پرداخت ثبت شد · منتظر تأیید مالی',
  PAYMENT_CONFIRMED_AWAITING_RESERVATION: 'پرداخت تأیید شد · منتظر رزرو کالا',
  AWAITING_LEGAL_FINANCE_APPROVAL: 'مدارک قرارداد و چک · منتظر تأیید',
  COMPLETED: 'پرونده فروش تکمیل شد',
};
const actionNames: Record<string, string> = {
  DRIVER_CREATED: 'پرونده راننده ایجاد شد', STAGE_DRAFT_SAVED: 'پیش‌نویس مرحله ذخیره شد',
  DOCUMENT_UPLOADED: 'مدرک بارگذاری شد', DRIVER_ARCHIVED: 'پرونده به آرشیو رفت', DRIVER_RESTORED: 'پرونده از آرشیو خارج شد',
  STORE_SETTLEMENT_RECORDED: 'تسویه فروشگاه ثبت شد', STORE_SETTLEMENT_UPDATED: 'اطلاعات تسویه به‌روزرسانی شد',
  WORKFLOW_SUBMIT_NEED: 'اعلام تمایل ثبت شد', WORKFLOW_VERIFY_APP: 'احراز هویت تأیید شد',
  WORKFLOW_SUBMIT_CREDIT: 'اطلاعات برای تأیید اعتبار ارسال شد', WORKFLOW_APPROVE_CREDIT: 'اعتبار تأیید شد',
  WORKFLOW_REJECT_CREDIT: 'درخواست اعتبار رد شد', WORKFLOW_REQUEST_CREDIT_CHANGES: 'اصلاح اعتبار درخواست شد',
  WORKFLOW_SUBMIT_PROFORMA: 'پیش‌فاکتور ثبت و ارسال شد', WORKFLOW_REGISTER_INITIAL_PAYMENT: 'اطلاعات پرداخت ثبت شد',
  WORKFLOW_CONFIRM_INITIAL_PAYMENT: 'پرداخت اولیه تأیید شد', WORKFLOW_RESERVE_GOODS: 'کالا رزرو شد',
  WORKFLOW_SUBMIT_CONTRACT_CHEQUE: 'قرارداد و چک برای بررسی ارسال شد', WORKFLOW_APPROVE_CONTRACT_CHEQUE: 'قرارداد و چک تأیید شد',
  WORKFLOW_COMPLETE_DELIVERY: 'تحویل و مستندات نهایی شد',
};
const categoryNames: Record<string, string> = {
  IDENTITY: 'مدارک هویتی', CREDIT_RESULT: 'نتیجه اعتبارسنجی', PROFORMA: 'پیش‌فاکتور',
  CONTRACT: 'قرارداد', CHEQUE: 'چک', DELIVERY: 'مدارک تحویل', SATISFACTION_VIDEO: 'ویدئوی رضایت', CUSTOM: 'مدرک متفرقه',
};

export { statusLabel, actionNames, categoryNames };
