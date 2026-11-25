import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, displayDate, displayDateTime, faNumber, formatMoney } from './api';
import { stageList, type Stage } from './model';
import LoadingIndicator from './LoadingIndicator';
import './dashboard.css';

type Granularity = 'daily' | 'monthly';
type Period = '30d' | '3m' | '6m' | '12m';
type Metric = 'salesCount' | 'salesAmount' | 'receivedAmount' | 'dueAmount';
type DashboardResponse = {
  period: Period;
  granularity: Granularity;
  generatedAt: string;
  hasFinancialAccess: boolean;
  activeCases: number;
  stageCounts: Record<Stage, number>;
  totals: {
    salesCount: number;
    salesAmount: string | null;
    receivedAmount: string | null;
    supplierPaidAmount: string | null;
    cashflowNet: string | null;
    nextDueAmount: string | null;
    overdueAmount: string | null;
    overdueCount: number | null;
    nextDueCount: number | null;
  };
  series: { key: string; labelKey: string; salesCount: number; salesAmount: string | null; receivedAmount: string | null; supplierPaidAmount: string | null; cashflowNet: string | null; dueAmount: string | null }[];
  dueItems: { id: string; driverId: string; driverName: string; number: number; amount: string; dueAt: string; overdue: boolean; dueSoon: boolean }[] | null;
  activity: { id: string; eventType: string; createdAt: string; driverId: string | null; driverName: string | null; actorName: string | null }[];
};

const moneyMetricNames: Record<Exclude<Metric, 'salesCount'>, string> = {
  salesAmount: 'ارزش فروش', receivedAmount: 'مبلغ وصول‌شده', dueAmount: 'اقساط سررسیدشده',
};
const periodLabels: Record<Period, string> = { '30d': '۳۰ روز اخیر', '3m': '۳ ماه اخیر', '6m': '۶ ماه اخیر', '12m': '۱۲ ماه اخیر' };
const eventTitles: Record<string, string> = {
  DRIVER_CREATED: 'پروندهٔ جدید ثبت شد',
  WORKFLOW_SUBMIT_PROFORMA: 'پیش‌فاکتور ثبت شد',
  WORKFLOW_REGISTER_INITIAL_PAYMENT: 'پرداخت اولیه ثبت شد',
  WORKFLOW_CONFIRM_INITIAL_PAYMENT: 'دریافت پرداخت اولیه تأیید شد',
  WORKFLOW_RESERVE_GOODS: 'رزرو کالا تأیید شد',
  WORKFLOW_SUBMIT_CONTRACT_CHEQUE: 'قرارداد و چک ثبت شد',
  WORKFLOW_APPROVE_CONTRACT_CHEQUE: 'قرارداد و چک تأیید شد',
  WORKFLOW_COMPLETE_DELIVERY: 'تحویل پرونده تکمیل شد',
  INSTALLMENT_PAYMENT_RECORDED: 'پرداخت قسط ثبت شد',
  INSTALLMENT_PAYMENT_UPDATED: 'تاریخ پرداخت قسط اصلاح شد',
  INSTALLMENT_PAYMENT_AMOUNT_UPDATED: 'مبلغ پرداخت‌شده و ماندهٔ اقساط اصلاح شد',
};

function localizeKey(key: string, mode: Granularity, full = false) {
  const date = new Date(`${key}${key.length === 7 ? '-01' : ''}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', mode === 'monthly'
    ? { month: full ? 'long' : 'short', year: full ? 'numeric' : undefined, timeZone: 'Asia/Tehran' }
    : { day: 'numeric', ...(full ? { month: 'short', year: 'numeric' } : {}), timeZone: 'Asia/Tehran' }).format(date);
}

function amount(value: string | null | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  return Number(value);
}

function signedAmount(value: string | null | undefined): number {
  if (!value || !/^-?\d+$/.test(value)) return 0;
  return Number(value);
}

function shortMoney(value: number) {
  if (!value) return '۰';
  const units: [number, string][] = [[1_000_000_000, 'میلیارد'], [1_000_000, 'میلیون'], [1_000, 'هزار']];
  const [divisor, suffix] = units.find(([size]) => value >= size) || [1, ''];
  const result = divisor === 1 ? faNumber(Math.round(value)) : faNumber(Number((value / divisor).toFixed(value / divisor < 10 ? 1 : 0)));
  return suffix ? `${result} ${suffix}` : result;
}

function bucketBounds(key: string, granularity: Granularity) {
  const [year, month, day] = key.split('-').map(Number);
  const start = Date.UTC(year, month - 1, granularity === 'daily' ? day : 1);
  const end = granularity === 'daily' ? start + 86_400_000 : Date.UTC(year, month, 1);
  return [start, end] as const;
}

function Chart({ data, metric, granularity, onSelect }: {
  data: DashboardResponse['series']; metric: Metric; granularity: Granularity; onSelect: (index: number | null) => void;
}) {
  const width = 1000;
  const height = 250;
  const left = 64;
  const right = 28;
  const top = 18;
  const bottom = 30;
  const values = data.map((item) => metric === 'salesCount' ? item.salesCount : amount(item[metric]));
  const max = Math.max(1, ...values);
  const plotWidth = width - left - right;
  const firstStart = data.length ? bucketBounds(data[0].labelKey, granularity)[0] : 0;
  const lastEnd = data.length ? bucketBounds(data[data.length - 1].labelKey, granularity)[1] : 1;
  const timeToX = (time: number) => width - right - ((time - firstStart) / (lastEnd - firstStart || 1)) * plotWidth;
  const points = data.map((item, index) => {
    const value = values[index];
    const barHeight = (height - top - bottom) * value / max;
    const [start, end] = bucketBounds(item.labelKey, granularity);
    return { ...item, value, x: timeToX((start + end) / 2), slotWidth: timeToX(start) - timeToX(end), y: height - bottom - barHeight, barHeight };
  });
  const maxBarWidth = data.length <= 3 ? 78 : data.length <= 6 ? 58 : data.length <= 12 ? 42 : 30;
  const tickIndexes = Array.from(new Set([0, Math.floor((data.length - 1) / 3), Math.floor((data.length - 1) * 2 / 3), data.length - 1]));

  return <div className="dash-chart-wrap">
    <svg className="dash-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`نمودار ${metric === 'salesCount' ? 'جفت لاستیک فروخته‌شده' : moneyMetricNames[metric]} در بازهٔ انتخاب‌شده`} preserveAspectRatio="none">
      {[0, 1, 2, 3].map((lineIndex) => {
        const lineY = top + (height - top - bottom) * lineIndex / 3;
        const value = Math.round(max * (3 - lineIndex) / 3);
        return <g key={lineIndex}><line x1={left} x2={width - right} y1={lineY} y2={lineY} className="dash-grid-line" /><text x={left - 12} y={lineY + 4} textAnchor="end" className="dash-axis-label">{metric === 'salesCount' ? faNumber(value) : shortMoney(value)}</text></g>;
      })}
      <defs><linearGradient id="dash-bar-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#13c3ac" /><stop offset="100%" stopColor="#078b84" /></linearGradient></defs>
      {points.map((point, index) => {
        const barWidth = Math.min(maxBarWidth, point.slotWidth * 0.58);
        return <rect key={point.key} x={point.x - barWidth / 2} y={point.y} width={barWidth} height={point.barHeight}
        rx={Math.min(7, barWidth / 2)} className={`dash-chart-bar ${metric} ${index === data.length - 1 ? 'current' : ''}`}
        style={{ animationDelay: `${Math.min(index, 30) * 8 + 100}ms` }} tabIndex={0} role="button"
        aria-label={`${localizeKey(point.labelKey, granularity, true)}، ${metric === 'salesCount' ? faNumber(point.value) + ' جفت' : shortMoney(point.value) + ' تومان'}`}
        onMouseEnter={() => onSelect(index)} onMouseLeave={() => onSelect(null)} onFocus={() => onSelect(index)} onBlur={() => onSelect(null)} onClick={() => onSelect(index)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index); } }}>
        <title>{localizeKey(point.labelKey, granularity, true)} · {metric === 'salesCount' ? `${faNumber(point.value)} جفت` : `${formatMoney(String(point.value))} تومان`}</title>
      </rect>;
      })}
      {tickIndexes.map((index) => <text key={index} x={points[index]?.x ?? 0} y={height - 7} textAnchor="middle" className="dash-axis-label">{localizeKey(data[index]?.labelKey || '', granularity, true)}</text>)}
    </svg>
  </div>;
}

function CashflowChart({ data, granularity }: { data: DashboardResponse['series']; granularity: Granularity }) {
  const width = 1000;
  const height = 230;
  const left = 62;
  const right = 24;
  const top = 18;
  const bottom = 30;
  const max = Math.max(1, ...data.flatMap((item) => [amount(item.receivedAmount), amount(item.supplierPaidAmount), Math.abs(signedAmount(item.cashflowNet))]));
  const plotWidth = width - left - right;
  const firstStart = data.length ? bucketBounds(data[0].labelKey, granularity)[0] : 0;
  const lastEnd = data.length ? bucketBounds(data[data.length - 1].labelKey, granularity)[1] : 1;
  const timeToX = (time: number) => width - right - ((time - firstStart) / (lastEnd - firstStart || 1)) * plotWidth;
  const points = data.map((item) => {
    const [start, end] = bucketBounds(item.labelKey, granularity);
    return { ...item, x: timeToX((start + end) / 2), slotWidth: timeToX(start) - timeToX(end) };
  });
  const maxBarWidth = data.length <= 3 ? 82 : data.length <= 6 ? 58 : data.length <= 12 ? 42 : 30;
  const tickIndexes = Array.from(new Set([0, Math.floor((data.length - 1) / 3), Math.floor((data.length - 1) * 2 / 3), data.length - 1]));
  const plotHeight = height - top - bottom;
  const zeroY = top + plotHeight / 2;
  return <div className="dash-cashflow-chart-wrap">
    <svg className="dash-chart dash-cashflow-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="نمودار جریان نقدی شامل وصولی، پرداخت به تأمین‌کننده و خالص نقدینگی" preserveAspectRatio="none">
      {[-1, -.5, 0, .5, 1].map((ratio) => {
        const lineY = zeroY - plotHeight / 2 * ratio;
        return <g key={ratio}><line x1={left} x2={width - right} y1={lineY} y2={lineY} className="dash-grid-line" /><text x={left - 10} y={lineY + 4} textAnchor="end" className="dash-axis-label">{shortMoney(Math.round(max * ratio))}</text></g>;
      })}
      <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} className="dash-cashflow-zero" />
      {points.map((point, index) => {
        const received = amount(point.receivedAmount);
        const paid = amount(point.supplierPaidAmount);
        const net = signedAmount(point.cashflowNet);
        const groupWidth = Math.min(maxBarWidth, point.slotWidth * 0.72);
        const barWidth = Math.max(4, groupWidth / 3 - 2);
        const receivedHeight = plotHeight / 2 * received / max;
        const paidHeight = plotHeight / 2 * paid / max;
        const netHeight = plotHeight / 2 * Math.abs(net) / max;
        return <g key={point.key} className="dash-cashflow-group" style={{ animationDelay: `${Math.min(index, 30) * 8 + 100}ms` }}>
          <rect className="dash-cashflow-bar received" x={point.x - groupWidth / 2} y={zeroY - receivedHeight} width={barWidth} height={receivedHeight} rx="4"><title>{localizeKey(point.labelKey, granularity, true)} · وصولی {formatMoney(point.receivedAmount || '0')} تومان</title></rect>
          <rect className="dash-cashflow-bar paid" x={point.x - barWidth / 2} y={zeroY - paidHeight} width={barWidth} height={paidHeight} rx="4"><title>{localizeKey(point.labelKey, granularity, true)} · پرداخت تأمین‌کننده {formatMoney(point.supplierPaidAmount || '0')} تومان</title></rect>
          <rect className={`dash-cashflow-bar net ${net < 0 ? 'negative' : ''}`} x={point.x + groupWidth / 2 - barWidth} y={net >= 0 ? zeroY - netHeight : zeroY} width={barWidth} height={netHeight} rx="4"><title>{localizeKey(point.labelKey, granularity, true)} · خالص نقدینگی {net < 0 ? '−' : ''}{formatMoney(String(Math.abs(net)))} تومان</title></rect>
        </g>;
      })}
      {tickIndexes.map((index) => <text key={index} x={points[index]?.x ?? 0} y={height - 7} textAnchor="middle" className="dash-axis-label">{localizeKey(data[index]?.labelKey || '', granularity, true)}</text>)}
    </svg>
  </div>;
}

export default function DashboardPage({ onOpenStage, onOpenInstallments }: {
  onOpenStage: (stage: Stage | '') => void;
  onOpenInstallments: () => void;
}) {
  const [period, setPeriod] = useState<Period>('30d');
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [metric, setMetric] = useState<Metric>('salesCount');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [openKpiTip, setOpenKpiTip] = useState<string | null>(null);

  useEffect(() => {
    if (!openKpiTip) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('.dash-kpi-info, .dash-kpi-popover')) setOpenKpiTip(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenKpiTip(null); };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openKpiTip]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<DashboardResponse>(`/dashboard/summary?period=${period}&granularity=${granularity}`);
      setData(result);
      if (!result.hasFinancialAccess) setMetric('salesCount');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'دریافت اطلاعات داشبورد انجام نشد.');
    } finally { setLoading(false); }
  }, [period, granularity]);

  useEffect(() => { void load(); }, [load]);
  const activeMetric: Metric = data?.hasFinancialAccess ? metric : 'salesCount';
  const selected = selectedPoint === null ? null : data?.series[selectedPoint] || null;
  const chartTotal = useMemo(() => data?.series.reduce((sum, item) => sum + (activeMetric === 'salesCount' ? item.salesCount : amount(item[activeMetric])), 0) || 0, [data, activeMetric]);
  const overdueItems = data?.dueItems?.filter((item) => item.overdue) || [];
  const upcomingItems = data?.dueItems?.filter((item) => !item.overdue) || [];
  const latestUpdate = data?.generatedAt ? displayDateTime(data.generatedAt) : '—';
  const cashflowReceived = useMemo(() => data?.series.reduce((sum, item) => sum + amount(item.receivedAmount), 0) || 0, [data]);
  const cashflowSupplierPaid = useMemo(() => data?.series.reduce((sum, item) => sum + amount(item.supplierPaidAmount), 0) || 0, [data]);
  const cashflowNet = cashflowReceived - cashflowSupplierPaid;

  const kpiExplanations: Record<string, string> = {
    cases: 'شمار همهٔ پرونده‌های فروش که هنوز به آرشیو منتقل نشده‌اند؛ پرونده‌های تکمیل‌شده هم تا زمان آرشیو در این عدد می‌مانند. این شاخص لحظه‌ای است و به بازهٔ گزارش وابسته نیست.',
    sales: 'مجموع تعداد جفت لاستیک در پرونده‌هایی که پیش‌پرداخت اولیه‌شان تأیید شده و تاریخ پرداخت یا تأییدشان داخل بازهٔ انتخاب‌شده است؛ فروش بر اساس جفت شمرده می‌شود، نه تعداد پرونده.',
    gross: 'برای فروش‌های همین بازه، قیمت واحد هر قلم کالا را در تعدادش ضرب می‌کند و جمع می‌زند. قیمت اصلاح‌شدهٔ کالا لحاظ می‌شود. این رقم ارزش فروش کالاست، نه مبلغ وصول‌شده یا سود خالص.',
    received: 'جمع پیش‌پرداخت‌های تأییدشده و قسط‌هایی است که تاریخ پرداخت واقعی‌شان در این بازه در سامانه ثبت شده؛ مبلغ اقساطی که فقط سررسید شده‌اند، وصول‌شده محسوب نمی‌شود.',
    overdue: 'جمع مبلغ قسط‌هایی که هنوز پرداختشان ثبت نشده و تاریخ سررسیدشان قبل از امروز است. مبلغ و تعداد قسط‌ها وضعیت لحظه‌ای‌اند و به بازهٔ گزارش وابسته نیستند.',
  };
  kpiExplanations.supplierPaid = 'جمع پرداخت‌های واقعی ثبت‌شده به تأمین‌کنندگان در بازهٔ انتخاب‌شده؛ بدهی ثبت‌شده‌ای که هنوز پرداخت نشده در این عدد وارد نمی‌شود.';
  const kpis = [
    { label: 'پرونده‌های فعال', value: data ? faNumber(data.activeCases) : '—', helper: 'وضعیت همین لحظه', kind: 'cases', glyph: '▣' },
    { label: 'جفت لاستیک فروخته‌شده', value: data ? faNumber(data.totals.salesCount) : '—', helper: periodLabels[period], kind: 'sales', glyph: '↗' },
    ...(data?.hasFinancialAccess ? [
      { label: 'ارزش فروش', value: data.totals.salesAmount === null ? '—' : formatMoney(data.totals.salesAmount), helper: `تومان · ${periodLabels[period]}`, kind: 'gross', glyph: '◉' },
      { label: 'مبلغ وصول‌شده', value: data.totals.receivedAmount === null ? '—' : formatMoney(data.totals.receivedAmount), helper: `تومان · ${periodLabels[period]}`, kind: 'received', glyph: '✓' },
      { label: 'اقساط معوق', value: data.totals.overdueAmount === null ? '—' : formatMoney(data.totals.overdueAmount), helper: `تومان · وضعیت امروز · ${faNumber(data.totals.overdueCount || 0)} قسط`, kind: 'overdue', glyph: '!' },
    ] : []),
    ...(data?.hasFinancialAccess ? [{ label: 'تسویه با تأمین‌کننده', value: data.totals.supplierPaidAmount === null ? '—' : formatMoney(data.totals.supplierPaidAmount), helper: `تومان · ${periodLabels[period]}`, kind: 'supplierPaid', glyph: '↔' }] : []),
  ];

  return <div className="page-stack dashboard-page">
    <header className="dash-heading">
      <div><div className="eyebrow">نمای کلی عملکرد</div><h1>داشبورد فروش</h1><p>روند فروش، وصول و پرونده‌های در جریان را یک‌جا ببینید.</p></div>
      <div className="dash-refresh"><span className="dash-live-dot" />{loading ? 'در حال به‌روزرسانی…' : `آخرین به‌روزرسانی · ${latestUpdate}`}<button type="button" className="dash-refresh-button" onClick={() => void load()} disabled={loading} aria-label="به‌روزرسانی داشبورد" title="به‌روزرسانی">↻</button></div>
    </header>

    {error && <div className="alert error dash-error" role="alert">{error}<button className="text-button" onClick={() => void load()}>تلاش دوباره</button></div>}

    <div className="dash-kpi-toolbar">
      <span>بازهٔ گزارش</span>
      <div className="dash-segment" role="group" aria-label="انتخاب بازهٔ گزارش">
        {([['30d', '۳۰ روز'], ['3m', '۳ ماه'], ['6m', '۶ ماه'], ['12m', '۱۲ ماه']] as [Period, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? 'active' : ''} onClick={() => { setSelectedPoint(null); setPeriod(value); }}>{label}</button>)}
      </div>
      <small>فروش و وصول در این بازه‌اند؛ پرونده‌های فعال و اقساط معوق، وضعیت فعلی‌اند.</small>
    </div>

    <section className="dash-kpis" aria-label="شاخص‌های کلیدی">
      {kpis.map((item, index) => <article key={item.kind} className={`dash-kpi ${item.kind}`} style={{ animationDelay: `${index * 55}ms` }}>
        <div className="dash-kpi-top"><div className="dash-kpi-label"><span>{item.label}</span><button type="button" className="dash-kpi-info" aria-label={`مبنای محاسبهٔ ${item.label}`} aria-expanded={openKpiTip === item.kind} aria-describedby={openKpiTip === item.kind ? `dash-kpi-tip-${item.kind}` : undefined} onClick={() => setOpenKpiTip((current) => current === item.kind ? null : item.kind)}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.25" /><path d="M10 9v4.2" /><circle cx="10" cy="6.3" r=".65" className="dash-kpi-info-dot" /></svg></button></div><i aria-hidden="true">{item.glyph}</i></div>
        {openKpiTip === item.kind && <div id={`dash-kpi-tip-${item.kind}`} className="dash-kpi-popover" role="tooltip"><b>مبنای محاسبه</b><span>{kpiExplanations[item.kind]}</span></div>}
        <strong>{loading ? <span className="dash-skeleton" /> : item.value}</strong>
        <small>{item.helper}</small>
      </article>)}
    </section>

    <section className="dash-section dash-stage-section">
      <div className="dash-section-head"><div><h2>وضعیت گردش فروش</h2><p>برای دیدن پرونده‌های هر مرحله، یک مرحله را انتخاب کنید.</p></div><button type="button" className="dash-text-link" onClick={() => onOpenStage('')}>همهٔ پرونده‌ها <span>←</span></button></div>
      <div className="dash-stage-grid">
        {[...stageList, { id: 'COMPLETED' as Stage, title: 'تکمیل‌شده', compact: 'تکمیل‌شده' }].map((stage, index) => <button key={stage.id} type="button" className="dash-stage" style={{ animationDelay: `${120 + index * 35}ms` }} onClick={() => onOpenStage(stage.id)}>
          <span className="dash-stage-order">{faNumber(index + 1, { minimumIntegerDigits: 2 })}</span><span className="dash-stage-name">{stage.compact}</span><strong>{loading ? '—' : faNumber(data?.stageCounts[stage.id] || 0)}</strong><span className="dash-stage-arrow" aria-hidden="true">↗</span>
        </button>)}
      </div>
    </section>

    <section className="dash-section dash-chart-section">
      <div className="dash-section-head dash-chart-head"><div><h2>روند فروش و وصول</h2><p>بازهٔ {periodLabels[period]} · گروه‌بندی {granularity === 'daily' ? 'روزانه' : 'ماهانه'}</p></div>
        <div className="dash-segment dash-chart-granularity" role="group" aria-label="گروه‌بندی زمانی نمودار">
          {([['daily', 'روزانه'], ['monthly', 'ماهانه']] as [Granularity, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={granularity === value} className={granularity === value ? 'active' : ''} onClick={() => { setSelectedPoint(null); setGranularity(value); }}>{label}</button>)}
        </div>
      </div>
      <div className="dash-metric-row" role="tablist" aria-label="شاخص نمودار">
        <button type="button" role="tab" aria-selected={activeMetric === 'salesCount'} className={activeMetric === 'salesCount' ? 'active' : ''} onClick={() => { setSelectedPoint(null); setMetric('salesCount'); }}><i className="sales-dot" />جفت لاستیک فروخته‌شده</button>
        {data?.hasFinancialAccess && (Object.entries(moneyMetricNames) as [Exclude<Metric, 'salesCount'>, string][]).map(([value, label]) => <button type="button" role="tab" aria-selected={activeMetric === value} className={activeMetric === value ? 'active' : ''} key={value} onClick={() => { setSelectedPoint(null); setMetric(value); }}><i className={`metric-dot ${value}`} />{label}</button>)}
      </div>
      {!data && loading ? <div className="dash-chart-loading"><LoadingIndicator label="در حال دریافت روندها…" compact /></div>
        : <>
          <div className="dash-chart-summary"><div><small>{selected ? localizeKey(selected.labelKey, granularity, true) : moneyMetricNames[activeMetric as Exclude<Metric, 'salesCount'>] || 'جفت لاستیک فروخته‌شده'}</small><strong>{selected
            ? activeMetric === 'salesCount' ? `${faNumber(selected.salesCount)} جفت` : `${formatMoney(selected[activeMetric])} تومان`
            : activeMetric === 'salesCount' ? `${faNumber(chartTotal)} جفت` : `${formatMoney(chartTotal)} تومان`}</strong></div><span>{selected ? 'مقدار در این نقطه' : 'جمع بازهٔ نمودار'}</span></div>
          <Chart key={`${period}-${granularity}-${activeMetric}`} data={data?.series || []} metric={activeMetric} granularity={granularity} onSelect={setSelectedPoint} />
          {!data?.hasFinancialAccess && <p className="dash-access-note">مبالغ فروش و وصول برای نقش حقوقی و مالی و مدیر سامانه نمایش داده می‌شوند.</p>}
        </>}
    </section>

    {data?.hasFinancialAccess && <section className="dash-section dash-cashflow-section">
      <div className="dash-section-head dash-chart-head"><div><h2>جریان نقدی</h2><p>مقایسهٔ وصولی واقعی با پرداخت به تأمین‌کنندگان در بازهٔ {periodLabels[period]}</p></div><div className="dash-cashflow-legend" aria-label="راهنمای نمودار"><span className="received"><i />وصولی</span><span className="paid"><i />پرداخت تأمین‌کننده</span><span className="net"><i />خالص نقدینگی</span></div></div>
      <div className="dash-cashflow-summary"><div><small>وصولی واقعی</small><strong>{formatMoney(String(cashflowReceived))} تومان</strong></div><div><small>پرداخت به تأمین‌کننده</small><strong>{formatMoney(String(cashflowSupplierPaid))} تومان</strong></div><div className={cashflowNet >= 0 ? 'positive' : 'negative'}><small>خالص نقدینگی</small><strong>{cashflowNet < 0 ? '−' : ''}{formatMoney(String(Math.abs(cashflowNet)))} تومان</strong></div></div>
      <CashflowChart data={data.series} granularity={granularity} />
    </section>}

    <div className="dash-lower-grid">
      {data?.hasFinancialAccess && <section className="dash-section dash-due-section">
        <div className="dash-section-head"><div><h2>پیگیری اقساط</h2><p>سررسیدهای گذشته و ۳۰ روز آینده</p></div><button type="button" className="dash-text-link" onClick={onOpenInstallments}>مدیریت اقساط <span>←</span></button></div>
        <div className="dash-due-summary"><div className="dash-due-total"><span className="dash-alert-mark">!</span><div><small>مبلغ معوق</small><strong>{data.totals.overdueAmount === null ? '—' : `${formatMoney(data.totals.overdueAmount)} تومان`}</strong></div></div><div className="dash-upcoming-total"><small>سررسید ۳۰ روز آینده</small><strong>{data.totals.nextDueAmount === null ? '—' : `${formatMoney(data.totals.nextDueAmount)} تومان`}</strong><span>{faNumber(data.totals.nextDueCount || 0)} قسط</span></div></div>
        <div className="dash-due-list">
          {loading ? <div className="dash-inline-loading"><LoadingIndicator label="در حال دریافت سررسیدها…" compact /></div>
            : data.dueItems?.length ? data.dueItems.map((item, index) => <div className={`dash-due-row${item.overdue ? ' overdue' : item.dueSoon ? ' due-soon' : ''}`} key={item.id} style={{ animationDelay: `${index * 45}ms` }}>
              <span className="dash-due-indicator" aria-hidden="true">{item.overdue ? '!' : item.dueSoon ? '!' : '◷'}</span><div className="dash-due-person"><strong>{item.driverName}</strong><small>قسط {faNumber(item.number)} · سررسید {displayDate(item.dueAt)}</small></div><strong className="dash-due-amount">{formatMoney(item.amount)} <small>تومان</small></strong><span className="dash-due-status">{item.overdue ? 'معوق' : item.dueSoon ? 'نزدیک سررسید' : 'در انتظار'}</span>
            </div>) : <div className="dash-empty">در ۳۰ روز آینده قسط پرداخت‌نشده‌ای ثبت نشده است.</div>}
        </div>
      </section>}

      <section className="dash-section dash-activity-section">
        <div className="dash-section-head"><div><h2>فعالیت‌های اخیر</h2><p>آخرین تغییرها در پرونده‌های فروش</p></div></div>
        <div className="dash-activity-list">
          {loading ? <div className="dash-inline-loading"><LoadingIndicator label="در حال دریافت فعالیت‌ها…" compact /></div>
            : data?.activity.length ? data.activity.map((item, index) => <article key={item.id} className="dash-activity-row" style={{ animationDelay: `${index * 50}ms` }}>
              <span className="dash-activity-icon" aria-hidden="true">{item.eventType.includes('PAYMENT') ? '✓' : item.eventType === 'DRIVER_CREATED' ? '+' : '↗'}</span><div><strong>{eventTitles[item.eventType] || 'پرونده به‌روزرسانی شد'}</strong><small>{item.driverName || 'پرونده'}{item.actorName ? ` · ${item.actorName}` : ''}</small></div><time>{displayDateTime(item.createdAt)}</time>
            </article>) : <div className="dash-empty">هنوز فعالیتی برای نمایش ثبت نشده است.</div>}
        </div>
      </section>
    </div>
    <footer className="dash-footnote">ارزش فروش از قیمت ثبت‌شدهٔ کالا و وصولی از پیش‌پرداخت تأییدشده و اقساط ثبت‌شده محاسبه می‌شود؛ این ارقام سود خالص نیستند.</footer>
  </div>;
}
