# سامانه پرونده و گردش فروش صبابار

نسخهٔ مستقل برای ثبت پروندهٔ راننده، مراحل فروش، مدارک، تأییدها و تاریخچه. این برنامه به API یا دیتابیس ERP و فروشگاه وابسته نیست.

## ساختار

- `web`: پنل React و TypeScript با Vite
- `api`: API ماژولار NestJS، Prisma و PostgreSQL
- فایل‌های بارگذاری‌شده خارج از پوشهٔ عمومی وب نگهداری می‌شوند و فقط از API احراز هویت‌شده قابل دریافت‌اند.

## اجرای محلی

پیش‌نیازها: Node.js 24، npm و PostgreSQL 16 یا Docker Desktop. این نسخه به ERP یا سرویس بیرونی وصل نمی‌شود.

### محیط آمادهٔ این رایانه

دیتابیس پروژه در پوشهٔ نادیده‌گرفته‌شدهٔ `.local-db` و فقط روی `127.0.0.1:5434` قرار دارد. تنظیم اتصال و توکن راه‌اندازی در `api/.env` نگهداری می‌شود و وارد Git نمی‌شود. برای بالا آوردن پنل:

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run dev:api
```

در پنجرهٔ دوم:

```powershell
npm run dev:web
```

پنل در `http://127.0.0.1:5174` باز می‌شود. حساب محلی `local-admin` آماده است؛ رمز را از متغیر `LOCAL_DEMO_PASSWORD` در `api/.env` بخوانید. دیتابیس یک پروندهٔ آزمایشی تکمیل‌شده هم دارد تا مدارک، تاریخچه و نتیجهٔ خرید را ببینید.

برای خاموش کردن دیتابیس محلی:

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' -D .local-db stop
```

### آماده‌سازی روی رایانهٔ دیگر با Docker

1. `.env.example` را به `.env` و `api/.env.example` را به `api/.env` کپی کنید. رمز PostgreSQL و یک `BOOTSTRAP_TOKEN` تصادفی با حداقل ۳۲ نویسه تعیین کنید.
2. از پوشهٔ پروژه اجرا کنید: `npm install`، سپس `npm run db:up`، `npm run db:generate` و `npm run db:migrate`.
3. `npm run dev:api` و `npm run dev:web` را در دو پنجره اجرا کنید. در اولین ورود، با `BOOTSTRAP_TOKEN` یک سوپرادمین بسازید و بعد از راه‌اندازی مقدار توکن را حذف کنید.

برای توقف دیتابیس Docker از `npm run db:down` استفاده کنید؛ داده در volume محلی باقی می‌ماند.

## نقش‌ها

- سوپرادمین: مشاهدهٔ همهٔ پرونده‌ها و مدیریت کاربران و نقش‌ها
- فروش و عملیات
- حقوقی و مالی
- تأیید اعتبار

هر کاربر می‌تواند چند نقش داشته باشد. حساب پیش‌فرض یا رمز ثابت در مخزن وجود ندارد.

## مرز نسخهٔ اول

فرایند شامل اعلام تمایل، احراز هویت، اعتبارسنجی، پیش‌فاکتور/پرداخت/رزرو، قرارداد/چک و تحویل/مستندات نهایی است. هر مرحله پیش‌نویس سروری دارد و ذخیرهٔ آن مرحله را جلو نمی‌برد. تغییر مرحله فقط با اقدام معتبر و مجاز انجام می‌شود و همراه با رویداد تاریخچه ثبت می‌شود.

قسط‌بندی و پیامک در این نسخه نیستند. تسویهٔ فروشگاه مستقل از پرداخت راننده ثبت می‌شود.

## میزبانی بعدی

برنامه برای استقرار کانتینری و PostgreSQL آماده‌سازی می‌شود. تنظیمات PaaS یا Liara هنوز انجام نشده است. مسیر ذخیره‌سازی محلی صرفاً برای توسعه است؛ پیش از استفادهٔ عملیاتی باید adapter فضای خصوصی S3، نسخهٔ پشتیبان دیتابیس/فایل و دامنهٔ HTTPS پیکربندی شود.
# Local workflow smoke test

With the local PostgreSQL, API, and web app running, execute:

```sh
npm run test:smoke
```

The script reads the local demo account from `api/.env` (or `SABABAR_TEST_USERNAME` and `SABABAR_TEST_PASSWORD`), creates role-scoped temporary users and a driver, exercises the end-to-end workflow, then disables the temporary users and archives the test driver. It refuses non-loopback API/UI origins and production mode.
