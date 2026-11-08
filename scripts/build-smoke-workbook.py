from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "test-plans" / "bnpl-smoke-uat-2026-11-08.xlsx"

NAVY = "102B43"
TEAL = "00A896"
PALE_TEAL = "E5F6F3"
PALE_BLUE = "F1F5F9"
PALE_GREEN = "E7F5EC"
PALE_RED = "FCE8E6"
PALE_AMBER = "FFF4D6"
TEXT = "183B56"
MUTED = "627D98"
WHITE = "FFFFFF"
LINE = "D8E2EC"

e2e_rows = [
    ("E2E-01", "راه‌اندازی", "API محلی آماده و پیکربندی شده است", "GET /auth/setup-status مقدار initialized=true می‌دهد.", "پاس شد"),
    ("E2E-02", "رابط", "صفحهٔ وب از مبدأ محلی سرو می‌شود", "مبدأ UI پاسخ ۲۰۰ و سند دارای #root می‌دهد؛ تعامل مرورگری در چک‌لیست دستی است.", "پاس شد"),
    ("E2E-03", "ورود و نقش", "ورود کاربر ادمین و ساخت حساب‌های نقش‌دار", "حساب فروش، اعتبار و مالی با نقش مجزا وارد می‌شود.", "پاس شد"),
    ("E2E-04", "کاربران", "مدیریت کاربران فقط برای سوپرادمین", "دریافت فهرست کاربران با نقش فروش ۴۰۳ و با سوپرادمین موفق است.", "پاس شد"),
    ("E2E-05", "احراز هویت", "درخواست بدون نشست رد می‌شود", "GET /drivers بدون نشست پاسخ ۴۰۱ می‌دهد.", "پاس شد"),
    ("E2E-06", "ثبت نیاز", "ایجاد متقاضی با مرحلهٔ اولیه و جست‌وجو", "پرونده با NEED_DECLARED و IN_PROGRESS ساخته و با موبایل پیدا می‌شود.", "پاس شد"),
    ("E2E-07", "گردش", "جلوگیری از اقدام نقش نامرتبط و ارسال نیاز", "نقش اعتبار اجازهٔ ارسال نیاز ندارد؛ نقش فروش مرحله را جلو می‌برد.", "پاس شد"),
    ("E2E-08", "پیش‌نویس", "ذخیرهٔ مرحله‌ای اطلاعات و جلوگیری از ارسال ناقص", "پیش‌نویس احراز هویت حفظ می‌شود؛ ارسال ناقص مرحله را تغییر نمی‌دهد.", "پاس شد"),
    ("E2E-09", "اعتبارسنجی", "ثبت داده و تأیید با نقش اعتبار", "اطلاعات برای تأییدکننده قابل مشاهده است؛ فقط نقش اعتبار سقف را تأیید می‌کند.", "پاس شد"),
    ("E2E-10", "پیش‌فاکتور", "الزام فایل معتبر و پشتیبانی PDF و تصویر", "بدون فایل یا با PDF جعلی ارسال رد می‌شود؛ PDF و PNG واقعی پذیرفته می‌شوند.", "پاس شد"),
    ("E2E-11", "پرداخت", "ذخیرهٔ تکه‌ای و تأیید توسط مالی", "ثبت اولیه توسط فروش و تأیید دریافت توسط مالی جداست؛ نقش نامرتبط رد می‌شود.", "پاس شد"),
    ("E2E-12", "رزرو", "جلوگیری از عبور تا ثبت رزرو کالا", "تا پرداخت تأیید و رزرو با تاریخ و محل ثبت نشود، مرحله جلو نمی‌رود.", "پاس شد"),
    ("E2E-13", "قرارداد و چک", "الزام هر دو فایل و تأیید مالی", "بدون هر دو مدرک ارسال نمی‌شود؛ مالی هر دو مورد را می‌بیند و تأیید می‌کند.", "پاس شد"),
    ("E2E-14", "تحویل", "تکمیل چک‌ها و ویدئوی رضایت", "با چک ناقص یا بدون ویدئو پرونده کامل نمی‌شود؛ تکمیل معتبر به COMPLETED می‌رسد.", "پاس شد"),
    ("E2E-15", "مدارک", "دانلود فایل با محتوای اصلی و ثبت رویداد", "فایل PDF دانلودشده با بایت‌های بارگذاری‌شده برابر و رویداد دانلود ثبت می‌شود.", "پاس شد"),
    ("E2E-16", "مدرک متفرقه", "عنوان‌گذاری، کنترل نقش و حذف نرم", "مالی اجازهٔ حذف ندارد؛ فروش حذف می‌کند؛ دانلود قطع و رویداد حذف ثبت می‌شود.", "پاس شد"),
    ("E2E-17", "تسویه", "ثبت مبلغ و تاریخ تسویهٔ فروشگاه", "مبلغ و تاریخ در پرونده ثبت و در جزئیات قابل مشاهده است.", "پاس شد"),
    ("E2E-18", "آرشیو", "آرشیو، بازیابی و حفظ تاریخچه", "پرونده در آرشیو پیدا می‌شود؛ سوپرادمین بازیابی می‌کند و رویدادها باقی می‌مانند.", "پاس شد"),
]

unit_rows = [
    ("UNIT-01", "workflow.ts", "ارقام فارسی/عربی، جداکنندهٔ هزارگان، مبلغ نامعتبر و تاریخ نامعتبر", "اعداد معتبر تبدیل؛ صفر، اعشار و تاریخ نامعتبر رد می‌شوند.", "پاس شد"),
    ("UNIT-02", "workflow.ts", "مجوز نقش مشخص و دسترسی سوپرادمین", "نقش مجاز عبور؛ نقش نامرتبط Forbidden می‌گیرد.", "پاس شد"),
    ("UNIT-03", "DriversService.saveDraft", "ادغام ذخیرهٔ ناقص با پیش‌نویس قبلی و ثبت audit", "مقادیر قبلی حفظ و فقط نام فیلدهای تغییرکرده لاگ می‌شود.", "پاس شد"),
    ("UNIT-04", "DriversService.saveDraft", "رد فیلد غیرمجاز پیش از تراکنش", "BadRequest برمی‌گردد و تراکنش شروع نمی‌شود.", "پاس شد"),
    ("UNIT-05", "DriversService.action", "تغییر مرحله با به‌روزرسانی شرطی و ثبت رویداد", "مرحله به APP_VERIFICATION می‌رود و رویداد دارای from/to stage است.", "پاس شد"),
    ("UNIT-06", "AuditQueryService", "محدودکردن تعداد رویدادها و ترتیب زمانی", "حد ۵۰۰ رعایت و مرتب‌سازی جدیدترین ابتدا درخواست می‌شود.", "پاس شد"),
    ("UNIT-07", "UsersService.update", "جلوگیری از غیرفعال‌کردن آخرین سوپرادمین", "درخواست با ۴۲۲ رد می‌شود و کاربر تغییر نمی‌کند.", "پاس شد"),
    ("UNIT-08", "UsersService.resetPassword", "ابطال نشست‌های قبلی و ثبت رویداد تغییر رمز", "نشست‌ها حذف و رویداد USER_PASSWORD_RESET ثبت می‌شود.", "پاس شد"),
    ("UNIT-09", "DriversService.settleStore", "ثبت مبلغ/تاریخ و رویداد تسویهٔ جدید", "مبلغ به BigInt و تاریخ به Date ذخیره؛ رویداد ثبت می‌شود.", "پاس شد"),
    ("UNIT-10", "DocumentsService.upload", "رد فایل PDF با پسوند درست و امضای محتوای جعلی", "UnprocessableEntity پیش از نوشتن فایل یا شروع تراکنش.", "پاس شد"),
    ("UNIT-11", "DocumentsService.remove", "حذف نرم مدرک و ثبت رویداد", "deletedAt ثبت می‌شود؛ رویداد DOCUMENT_DELETED می‌ماند.", "پاس شد"),
    ("UNIT-12", "AuthService.login", "محدودسازی تلاش ناموفق ورود", "پس از ۸ تلاش ناموفق، تلاش بعدی پاسخ ۴۲۹ می‌گیرد.", "پاس شد"),
]

api_rows = [
    ("GET", "/api/auth/setup-status", "عمومی", "وضعیت راه‌اندازی", "اسموک"),
    ("POST", "/api/auth/login", "عمومی", "ورود و کوکی نشست", "اسموک + واحد محدودسازی"),
    ("POST", "/api/auth/logout", "نشست فعال", "خروج و ابطال نشست", "اسموک پاک‌سازی"),
    ("GET", "/api/auth/me", "نشست فعال", "بازیابی کاربر جاری", "در آزمون دستی"),
    ("GET", "/api/drivers", "کاربر مجاز", "جست‌وجو، مرحله و آرشیو", "اسموک"),
    ("POST", "/api/drivers", "فروش/ادمین", "ایجاد پروندهٔ متقاضی", "اسموک"),
    ("GET", "/api/drivers/:id", "کاربر مجاز", "پرونده، پیش‌نویس، مدارک و تاریخچه", "اسموک"),
    ("PATCH", "/api/drivers/:id/draft", "نقش مجاز مرحله", "ذخیرهٔ جزئی و ادغام پیش‌نویس", "واحد + اسموک"),
    ("POST", "/api/drivers/:id/actions", "نقش مجاز اقدام", "اعتبارسنجی و گذار گردش", "واحد + اسموک"),
    ("POST", "/api/drivers/:id/archive", "فروش/ادمین", "آرشیو پرونده", "اسموک"),
    ("POST", "/api/drivers/:id/restore", "سوپرادمین", "بازیابی پرونده", "اسموک"),
    ("POST", "/api/drivers/:id/store-settlement", "مالی/سوپرادمین", "ثبت یا اصلاح مبلغ و تاریخ", "اسموک"),
    ("POST", "/api/drivers/:id/documents", "نقش مجاز مرحله", "بارگذاری با کنترل نوع و امضای فایل", "واحد + اسموک"),
    ("DELETE", "/api/drivers/:id/documents/:documentId", "فروش/ادمین", "حذف نرم و ثبت audit", "اسموک"),
    ("GET", "/api/drivers/:id/documents/:documentId/download", "کاربر مجاز", "دانلود فایل خصوصی", "اسموک"),
    ("GET/POST/PATCH", "/api/users/...", "سوپرادمین", "مدیریت کاربران، نقش و رمز", "بخشی اسموک؛ باقیمانده دستی"),
    ("GET", "/api/audit", "سوپرادمین", "گزارش رویدادهای سراسری", "واحد + اسموک تاریخچه"),
]

uat_rows = [
    ("UAT-01", "ورود و نقش‌ها", "با سوپرادمین، فروش، مالی و اعتبار وارد شو؛ منو و دسترسی هرکدام را مقایسه کن.", "هر نقش فقط منو و اقدام مجاز خودش را دارد؛ مسیر مستقیم API هم محدود است.", "بالا"),
    ("UAT-02", "ثبت متقاضی", "در گردش فروش «ثبت متقاضی» را بزن؛ محصول را خالی بگذار؛ نام و موبایل را ذخیره کن.", "پرونده ساخته می‌شود، مدال بسته می‌شود و در همان صفحه گردش فروش می‌مانی؛ محصول اختیاری است.", "بالا"),
    ("UAT-03", "اقدام مرحله", "از جدول اقدام را بزن و شکل/جایگاه پنجره را با طرح تأییدشده مقایسه کن.", "پنجرهٔ اقدام و دکمهٔ مشاهدهٔ پرونده در جای مورد انتظار دیده می‌شوند؛ اقدام، مرحلهٔ بعد را باز می‌کند.", "بالا"),
    ("UAT-04", "ذخیرهٔ مرحله‌ای", "در یک مرحله چند فیلد را پر کن؛ ذخیرهٔ موقت بزن؛ ببند و دوباره باز کن.", "مدال بسته می‌شود؛ مقادیر قبلی باقی است؛ مرحله جلو نرفته و لاگ ذخیره ثبت شده.", "بالا"),
    ("UAT-05", "اعداد فارسی", "در تعداد، سقف اعتبار، مبلغ و قیمت، رقم فارسی و جداکننده وارد کن و ذخیره کن.", "نمایش فارسی و جداشده است؛ مقدار پس از ذخیره و بازگشایی تغییر یا خالی نمی‌شود.", "بالا"),
    ("UAT-06", "تاریخ شمسی", "همهٔ فیلدهای تاریخ در مراحل، تسویه و تاریخچه را باز کن و یک تاریخ انتخاب کن.", "انتخاب‌گر و قالب تاریخ شمسی و فارسی است؛ تاریخ روز اشتباه نمی‌شود.", "بالا"),
    ("UAT-07", "احراز اپ", "شماره هوشمند ناوگان و دو تأیید لازم را وارد کن؛ ذخیره و سپس تأیید رفتن به اعتبار را امتحان کن.", "فیلدهای حذف‌شدهٔ شناسهٔ اپ و تاریخ ثبت‌نام نمایش داده نمی‌شوند؛ دادهٔ ناقص جلو نمی‌رود.", "بالا"),
    ("UAT-08", "اعتبارسنجی", "با فروش داده‌ها را ثبت و ارسال کن؛ با اعتبار پرونده را باز و رد و تأیید را بررسی کن.", "تعداد سفر، پرداخت، تاریخ بارنامه و رتبه برای تأییدکننده قابل مشاهده است؛ یادداشت رد اختیاری است.", "بالا"),
    ("UAT-09", "پیش‌فاکتور", "یک PDF و یک تصویر معتبر بارگذاری کن؛ سپس یک فایل با پسوند PDF و محتوای نامعتبر را امتحان کن.", "PDF/تصویر معتبر پذیرفته می‌شود؛ فایل جعلی رد می‌شود و پیام خطا قابل فهم است.", "بالا"),
    ("UAT-10", "پرداخت و رزرو", "پیش‌فاکتور را ثبت کن؛ مبلغ و تاریخ پرداخت را ذخیره کن؛ تأیید مالی و سپس رزرو را انجام بده.", "اطلاعات پرداخت در ذخیرهٔ موقت باقی است؛ تیک رزرو پس از تأیید پرداخت دیده می‌شود؛ بدون رزرو عبور نمی‌کند.", "بالا"),
    ("UAT-11", "قرارداد و چک", "هر دو تصویر را بارگذاری کن؛ فرم را ذخیره و باز کن؛ با مالی هر دو مدرک را بازبینی و تیک بزن.", "هر دو فایل و دادهٔ قبلی دیده می‌شوند؛ ذخیرهٔ یکی، دیگری را پاک نمی‌کند؛ تأیید ناقص مرحله را جلو نمی‌برد.", "بالا"),
    ("UAT-12", "تحویل و رضایت", "تیک‌های تحویل را مطابق طرح نهایی بزن؛ ویدئوی رضایت را بارگذاری و مرحله را تکمیل کن.", "تیک‌ها دقیقاً مطابق طرح تأییدشده‌اند؛ ویدئو قابل دانلود است و پرونده کامل می‌شود.", "بالا"),
    ("UAT-13", "مشاهدهٔ پرونده", "از جدول هر مرحله «مشاهده پرونده» را باز کن و بین اطلاعات، مدارک و تاریخچه حرکت کن.", "پرونده از هر مرحله در دسترس است و از مدال اقدام جدا می‌ماند.", "بالا"),
    ("UAT-14", "افزودن مدرک", "در پرونده افزودن مدرک متفرقه را بزن؛ عنوان و فایل را در مدال وارد و ثبت کن.", "عنوان و فایل از مدال ذخیره می‌شوند؛ فایل در دستهٔ درست و قابل دانلود نمایش داده می‌شود.", "بالا"),
    ("UAT-15", "حذف مدرک", "مدرک آزمایشی را حذف کن و در پنجرهٔ تأیید لغو و سپس تأیید را امتحان کن.", "مدال اختصاصی و شفاف است؛ لغو داده را نگه می‌دارد؛ تأیید دسترسی را می‌بندد و لاگ باقی می‌ماند.", "بالا"),
    ("UAT-16", "تاریخچهٔ پرونده", "یک پیش‌نویس، بارگذاری، تأیید، حذف و تغییر مرحله انجام بده؛ تاریخچه را بررسی کن.", "هر رویداد کاربر، زمان و نوع اقدام را دارد؛ متن فایل یا رمز در لاگ نیست.", "بالا"),
    ("UAT-17", "تسویهٔ فروشگاه", "مدال تسویه را باز کن؛ مبلغ و تاریخ را ثبت کن و بعد پرونده را دوباره باز کن.", "فقط مبلغ و تاریخ خواسته می‌شود؛ ساعت ندارد؛ داده و رویداد تسویه ثبت می‌شود.", "متوسط"),
    ("UAT-18", "رویدادهای سامانه", "صفحهٔ رویدادها را باز کن و یک اقدام تازه انجام بده؛ تازه‌سازی و خوانایی جدول را ببین.", "رویدادها بر اساس زمان مرتب‌اند؛ بررسی UX: فهرست فعلی بلند و بدون فیلتر/صفحه‌بندی است.", "متوسط"),
    ("UAT-19", "آرشیو", "پروندهٔ آزمایشی را آرشیو کن؛ در آرشیو جست‌وجو و با سوپرادمین بازیابی کن.", "پرونده از فهرست فعال خارج می‌شود؛ بازیابی تاریخچه را حفظ می‌کند.", "متوسط"),
    ("UAT-20", "مرورگر و دسترس‌پذیری", "در عرض 1366 و 1920، با Tab/Enter و زوم 125٪ از مدال‌ها و جدول استفاده کن.", "بدون بریدگی؛ فوکوس و دکمه‌ها قابل تشخیص؛ اسکرول مدال به فوتر ثابت لطمه نمی‌زند.", "متوسط"),
]


def style_sheet(ws, title, subtitle, headers, rows, widths, status_col=None):
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
    ws.cell(1, 1, title)
    ws.cell(1, 1).font = Font(name="Tahoma", size=16, bold=True, color=WHITE)
    ws.cell(1, 1).fill = PatternFill("solid", fgColor=NAVY)
    ws.cell(1, 1).alignment = Alignment(horizontal="right", vertical="center")
    ws.row_dimensions[1].height = 34
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(headers))
    ws.cell(2, 1, subtitle)
    ws.cell(2, 1).font = Font(name="Tahoma", size=10, color=MUTED)
    ws.cell(2, 1).alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
    ws.row_dimensions[2].height = 30

    header_row = 4
    for col, label in enumerate(headers, start=1):
        cell = ws.cell(header_row, col, label)
        cell.font = Font(name="Tahoma", size=10, bold=True, color=WHITE)
        cell.fill = PatternFill("solid", fgColor=TEAL)
        cell.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
    ws.row_dimensions[header_row].height = 30

    for row_num, values in enumerate(rows, start=header_row + 1):
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row_num, col, value)
            cell.font = Font(name="Tahoma", size=9, color=TEXT)
            cell.alignment = Alignment(horizontal="right", vertical="top", wrap_text=True)
            if row_num % 2:
                cell.fill = PatternFill("solid", fgColor=PALE_BLUE)
        ws.row_dimensions[row_num].height = 48 if len(headers) <= 6 else 54
    for col, width in enumerate(widths, start=1):
        ws.column_dimensions[chr(64 + col)].width = width
    ws.freeze_panes = "A5"
    ws.auto_filter.ref = f"A4:{chr(64 + len(headers))}{header_row + len(rows)}"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.orientation = "landscape"
    ws.print_title_rows = "1:4"

    if status_col:
        status_letter = chr(64 + status_col)
        status_range = f"{status_letter}5:{status_letter}{header_row + len(rows)}"
        ws.conditional_formatting.add(status_range, FormulaRule(formula=[f'{status_letter}5="پاس شد"'], fill=PatternFill("solid", fgColor=PALE_GREEN)))
        ws.conditional_formatting.add(status_range, FormulaRule(formula=[f'{status_letter}5="رد شد"'], fill=PatternFill("solid", fgColor=PALE_RED)))
        ws.conditional_formatting.add(status_range, FormulaRule(formula=[f'{status_letter}5="مسدود"'], fill=PatternFill("solid", fgColor=PALE_AMBER)))


def add_summary(wb):
    ws = wb.active
    ws.title = "خلاصه"
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False
    ws.merge_cells("A1:D1")
    ws["A1"] = "گزارش اسموک، تست واحد و پذیرش کاربر"
    ws["A1"].font = Font(name="Tahoma", size=17, bold=True, color=WHITE)
    ws["A1"].fill = PatternFill("solid", fgColor=NAVY)
    ws["A1"].alignment = Alignment(horizontal="right", vertical="center")
    ws.row_dimensions[1].height = 38
    ws.merge_cells("A2:D2")
    ws["A2"] = "سامانهٔ پرونده و گردش فروش صبابار | اجرای محلی: 2026-11-08 | داده‌ها آزمایشی و محلی هستند."
    ws["A2"].font = Font(name="Tahoma", size=10, color=MUTED)
    ws["A2"].alignment = Alignment(horizontal="right", vertical="center")
    ws.row_dimensions[2].height = 28

    headers = ["بخش", "نتیجه", "وضعیت", "دامنه و توضیح"]
    rows = [
        ("تست واحد API", "۱۲ از ۱۲", "پاس شد", "اعتبارسنجی ورودی، نقش‌ها، پیش‌نویس، گذار مرحله، مدیریت کاربر، audit، فایل، تسویه و ورود."),
        ("اسموک انتها‌به‌انتها", "۱۸ از ۱۸", "پاس شد", "API واقعی محلی، PostgreSQL محلی، نقش‌ها، کل فلو، مدارک، تسویه و آرشیو."),
        ("Build API", "Nest build", "پاس شد", "در جریان اجرای تست واحد ساخته شد."),
        ("Build رابط وب", "Vite + TypeScript", "پاس شد", "ساخت تولید رابط بدون خطای TypeScript."),
        ("تست تعاملی مرورگر", "۲۰ سناریو", "نیازمند بررسی دستی", "اسموک صفحه را سرو می‌کند؛ تعامل واقعی با مدال‌ها و کنترل‌های UI در برگهٔ چک‌لیست است."),
    ]
    for col, label in enumerate(headers, 1):
        c = ws.cell(4, col, label)
        c.font = Font(name="Tahoma", size=10, bold=True, color=WHITE)
        c.fill = PatternFill("solid", fgColor=TEAL)
        c.alignment = Alignment(horizontal="right", vertical="center")
    for ridx, row in enumerate(rows, 5):
        for cidx, value in enumerate(row, 1):
            c = ws.cell(ridx, cidx, value)
            c.font = Font(name="Tahoma", size=10, color=TEXT)
            c.alignment = Alignment(horizontal="right", vertical="top", wrap_text=True)
            c.fill = PatternFill("solid", fgColor=PALE_GREEN if row[2] == "پاس شد" else PALE_AMBER)
        ws.row_dimensions[ridx].height = 38
    for col, width in zip("ABCD", [26, 20, 27, 92]):
        ws.column_dimensions[col].width = width

    ws.merge_cells("A12:D12")
    ws["A12"] = "دربارهٔ فهرست رویدادها"
    ws["A12"].font = Font(name="Tahoma", size=12, bold=True, color=WHITE)
    ws["A12"].fill = PatternFill("solid", fgColor=NAVY)
    ws["A12"].alignment = Alignment(horizontal="right")
    ws.merge_cells("A13:D15")
    ws["A13"] = (
        "این صفحه دفتر ثبت سراسری سامانه است: تغییر پرونده، ذخیرهٔ پیش‌نویس، بارگذاری/حذف/دانلود مدرک، "
        "تأیید نقش‌ها و تغییر کاربرها را یکجا و بر اساس زمان نشان می‌دهد. برای ردیابی و حسابرسی مفید است، "
        "اما نمایش حداکثر ۵۰۰ رویداد در یک جدول پیوسته بدون فیلتر و صفحه‌بندی، پیدا کردن اتفاق موردنظر را دشوار می‌کند. "
        "پیشنهاد UX: جست‌وجوی راننده، بازهٔ تاریخ، نوع رویداد و کاربر + صفحه‌بندی؛ تاریخچهٔ هر راننده همچنان در خود پرونده بماند."
    )
    ws["A13"].font = Font(name="Tahoma", size=10, color=TEXT)
    ws["A13"].alignment = Alignment(horizontal="right", vertical="top", wrap_text=True)
    ws.row_dimensions[13].height = 34
    ws.row_dimensions[14].height = 30
    ws.row_dimensions[15].height = 24

    ws.merge_cells("A17:D18")
    ws["A17"] = (
        "محدودیت گزارش: اسموک در محیط loopback و دیتابیس محلی اجرا شده و رکوردهای تستی را بعد از اجرا آرشیو/غیرفعال می‌کند. "
        "این نتیجه، تأیید تست UI در مرورگر یا آمادگی پروداکشن محسوب نمی‌شود. سناریوهای کاربری را در برگهٔ «چک‌لیست دستی» اجرا و وضعیت را ثبت کنید."
    )
    ws["A17"].font = Font(name="Tahoma", size=10, color=MUTED, italic=True)
    ws["A17"].alignment = Alignment(horizontal="right", vertical="top", wrap_text=True)
    ws.sheet_view.zoomScale = 90


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    add_summary(wb)

    ws = wb.create_sheet("اسموک سرتاسری")
    style_sheet(ws, "نتایج اسموک انتها‌به‌انتها", "اجرای واقعی API و PostgreSQL محلی؛ هر ردیف نمایندهٔ یک گروه assertion در smoke-test.mjs است.",
                ["شناسه", "حوزه", "سناریو", "انتظار/نتیجهٔ بررسی‌شده", "وضعیت"], e2e_rows, [14, 22, 42, 82, 24], status_col=5)

    ws = wb.create_sheet("تست واحد API")
    style_sheet(ws, "تست واحد منطق و سرویس‌های API", "تست‌ها با Node.js داخلی و mock سبک Prisma اجرا می‌شوند؛ وابستگی تست جدید اضافه نشده است.",
                ["شناسه", "ماژول", "حالت آزمون", "انتظار", "وضعیت"], unit_rows, [14, 34, 62, 76, 24], status_col=5)

    ws = wb.create_sheet("ماتریس API")
    style_sheet(ws, "ماتریس endpointهای اصلی", "برای هر مسیر، نقش لازم و سطح پوشش فعلی مشخص شده؛ موارد دستی در چک‌لیست پذیرش هستند.",
                ["متد", "مسیر", "نقش", "کاربرد", "پوشش"], api_rows, [19, 48, 26, 50, 30])

    ws = wb.create_sheet("چک‌لیست دستی")
    style_sheet(ws, "چک‌لیست پذیرش کاربر در مرورگر", "با دادهٔ آزمایشی و بدون اطلاعات واقعی راننده اجرا کنید. ستون وضعیت قابل ویرایش است.",
                ["شناسه", "بخش", "مراحل اجرا", "معیار پذیرش", "اولویت", "وضعیت", "یادداشت/شواهد"],
                [(a, b, c, d, e, "بررسی نشده", "") for a, b, c, d, e in uat_rows],
                [14, 24, 76, 78, 16, 22, 46], status_col=6)
    ws.sheet_view.zoomScale = 75
    dv = DataValidation(type="list", formula1='"بررسی نشده,قبول,رد,مسدود"', allow_blank=False)
    ws.add_data_validation(dv)
    dv.add(f"F5:F{4 + len(uat_rows)}")
    ws.conditional_formatting.add(f"F5:F{4 + len(uat_rows)}", FormulaRule(formula=['F5="قبول"'], fill=PatternFill("solid", fgColor=PALE_GREEN)))
    ws.conditional_formatting.add(f"F5:F{4 + len(uat_rows)}", FormulaRule(formula=['F5="رد"'], fill=PatternFill("solid", fgColor=PALE_RED)))
    ws.conditional_formatting.add(f"F5:F{4 + len(uat_rows)}", FormulaRule(formula=['F5="مسدود"'], fill=PatternFill("solid", fgColor=PALE_AMBER)))

    for sheet in wb.worksheets:
        sheet.sheet_view.zoomScale = sheet.sheet_view.zoomScale or 85
        sheet.sheet_properties.pageSetUpPr.fitToPage = True
        sheet.page_margins.left = 0.25
        sheet.page_margins.right = 0.25
        sheet.page_margins.top = 0.5
        sheet.page_margins.bottom = 0.5
    wb.active = 0
    wb.save(OUTPUT)
    print(f"Created {OUTPUT}")
    print(f"E2E={len(e2e_rows)}, unit={len(unit_rows)}, manual-UAT={len(uat_rows)}, API-routes={len(api_rows)}")


if __name__ == "__main__":
    main()
