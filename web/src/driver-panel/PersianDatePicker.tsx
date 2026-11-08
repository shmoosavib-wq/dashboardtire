import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { asciiDigits, faDigits, faNumber, fromPersianDate, toPersianDate } from '../api';

const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function jalaliParts(value: string) {
  const match = /^(\d{3,4})\/(\d{2})\/(\d{2})$/.exec(asciiDigits(value));
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

function currentJalaliMonth() {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  return { year: Number(parts.find((part) => part.type === 'year')?.value), month: Number(parts.find((part) => part.type === 'month')?.value) };
}

function daysInMonth(year: number, month: number) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return fromPersianDate(`${year}/12/30`) ? 30 : 29;
}

export default function PersianDatePicker({ value, onChange, disabled = false }: { value: string; onChange: (isoDate: string) => void; disabled?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const initial = jalaliParts(toPersianDate(value) || value);
  const [view, setView] = useState(() => initial || currentJalaliMonth());

  useEffect(() => {
    if (initial) setView(initial);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 286;
      const height = 326;
      setPosition({
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: rect.bottom + height + 8 > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6,
      });
    };
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function moveMonth(delta: number) {
    const cursor = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
    setView({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
  }

  const firstDate = fromPersianDate(`${view.year}/${String(view.month).padStart(2, '0')}/01`);
  const weekday = firstDate ? new Date(`${firstDate}T12:00:00Z`).getUTCDay() : 6;
  const offset = (weekday + 1) % 7;
  const totalDays = daysInMonth(view.year, view.month);
  const today = jalaliParts(toPersianDate(new Date().toISOString().slice(0, 10)));
  const cells = Array.from({ length: offset + totalDays }, (_, index) => index < offset ? null : index - offset + 1);

  return <>
    <div className="persian-date-control">
      <input value={value ? faDigits(toPersianDate(value) || value) : ''} readOnly disabled={disabled} placeholder="انتخاب تاریخ شمسی" aria-label="تاریخ شمسی" />
      <button ref={trigger} type="button" className="date-picker-trigger" disabled={disabled} aria-label="بازکردن تقویم شمسی" aria-expanded={open} onClick={() => setOpen((state) => !state)}>▦</button>
    </div>
    {open && createPortal(<div ref={popup} className="persian-calendar" role="dialog" aria-label="تقویم شمسی" style={{ top: position.top, left: position.left }}>
      <div className="persian-calendar-head"><button type="button" aria-label="ماه قبل" onClick={() => moveMonth(-1)}>›</button><strong>{monthNames[view.month - 1]} {faNumber(view.year)}</strong><button type="button" aria-label="ماه بعد" onClick={() => moveMonth(1)}>‹</button></div>
      <div className="persian-calendar-grid">{weekDays.map((day) => <span className="persian-weekday" key={day}>{day}</span>)}{cells.map((day, index) => day === null ? <span key={`empty-${index}`} /> : <button key={day} type="button" className={today?.year === view.year && today.month === view.month && today.day === day ? 'today' : ''} onClick={() => { const iso = fromPersianDate(`${view.year}/${String(view.month).padStart(2, '0')}/${String(day).padStart(2, '0')}`); if (iso) onChange(iso); setOpen(false); }}>{faDigits(String(day))}</button>)}</div>
    </div>, document.body)}
  </>;
}
