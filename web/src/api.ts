export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch('/api' + path, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) {
    let message = 'درخواست انجام نشد.';
    try {
      const body = await response.json();
      message = Array.isArray(body.message) ? body.message.join(' ') : body.message || message;
    } catch { /* Keep the safe generic message for non-JSON failures. */ }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const jsonBody = (value: unknown) => JSON.stringify(value);

export function faNumber(value: number | bigint | string, options?: Intl.NumberFormatOptions) {
  const normalized = typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : value;
  return new Intl.NumberFormat('fa-IR-u-nu-arabext', options).format(normalized as number | bigint);
}

export function faDigits(value: string) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return value.replace(/[۰-۹٠-٩]/g, (char) => {
    const index = fa.indexOf(char);
    return fa[index >= 0 ? index : ar.indexOf(char)];
  }).replace(/\d/g, (char) => fa[Number(char)]);
}

export function asciiDigits(value: string) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return value.replace(/[۰-۹٠-٩]/g, (char) => {
    const faIndex = fa.indexOf(char);
    return String(faIndex >= 0 ? faIndex : ar.indexOf(char));
  });
}

export function normalizeIntegerInput(value: string) {
  return asciiDigits(value).replace(/[^\d]/g, '');
}

export function displayDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export function displayDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatMoney(value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  const normalized = asciiDigits(String(value)).replace(/[٬،,\s]/g, '');
  if (/^-?\d+$/.test(normalized)) {
    try { return faNumber(BigInt(normalized)); } catch { return faDigits(String(value)); }
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? faNumber(number) : faDigits(String(value));
}

export function toPersianDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return part('year') + '/' + part('month').padStart(2, '0') + '/' + part('day').padStart(2, '0');
}

export function fromPersianDate(input: string) {
  const match = /^(\d{3,4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/.exec(asciiDigits(input).trim());
  if (!match) return '';
  const jy = Number(match[1]), jm = Number(match[2]), jd = Number(match[3]);
  if (jm < 1 || jm > 12 || jd < 1 || jd > (jm <= 6 ? 31 : jm <= 11 ? 30 : 30)) return '';
  const target = jy * 12 + jm - 1;
  const formatter = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  const dayMs = 86400000;
  let low = Math.floor(Date.UTC(jy + 621, 0, 1) / dayMs);
  let high = Math.floor(Date.UTC(jy + 622, 11, 31) / dayMs);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const parts = formatter.formatToParts(new Date(mid * dayMs + 43200000));
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    const m = Number(parts.find((p) => p.type === 'month')?.value);
    if (y * 12 + m - 1 < target) low = mid + 1; else high = mid;
  }
  const firstParts = formatter.formatToParts(new Date(low * dayMs + 43200000));
  const firstYear = Number(firstParts.find((p) => p.type === 'year')?.value);
  const firstMonth = Number(firstParts.find((p) => p.type === 'month')?.value);
  if (firstYear !== jy || firstMonth !== jm) return '';
  const result = new Date((low + jd - 1) * dayMs + 43200000);
  const check = formatter.formatToParts(result);
  if (Number(check.find((p) => p.type === 'year')?.value) !== jy || Number(check.find((p) => p.type === 'month')?.value) !== jm || Number(check.find((p) => p.type === 'day')?.value) !== jd) return '';
  return result.toISOString().slice(0, 10);
}
