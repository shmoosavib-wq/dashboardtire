import { displayDate, displayDateTime, faNumber, formatMoney } from '../api';
import { stageList, type AuditEvent } from '../model';
import { categoryNames, actionNames } from './labels';

function HistoryTab({ events }: { events: AuditEvent[] }) {
  const renderEvent = (event: AuditEvent) => <article className="timeline-event" key={event.id}><span className="timeline-dot" /><div><b>{actionNames[event.eventType] || event.eventType}</b><p>{event.actor?.name || 'سامانه'}{formatDetails(event.details) ? ' · ' + formatDetails(event.details) : ''}</p><small>{displayDateTime(event.createdAt)}</small></div></article>;
  return <div className="tab-content"><div className="section-head"><div><div className="eyebrow">ردپای کامل پرونده</div><h3>تاریخچه فعالیت‌ها</h3><p>رویدادها به ترتیب زمان ثبت شده‌اند و امکان ویرایش دستی ندارند.</p></div><span className="count-chip">{faNumber(events.length)} رویداد</span></div>
    {!events.length ? <div className="empty-state compact">هنوز رویدادی ثبت نشده است.</div> : <>
      <div className="timeline">{events.slice(0, 5).map(renderEvent)}</div>
      {events.length > 5 && <details className="timeline-older"><summary>نمایش {faNumber(events.length - 5)} رویداد قدیمی‌تر</summary><div className="timeline">{events.slice(5).map(renderEvent)}</div></details>}
    </>}
  </div>;
}

function formatDetails(details: Record<string, unknown>) {
  if (details.note && typeof details.note === 'string') return details.note;
  if (Array.isArray(details.changedKeys)) {
    const stageName = stageList.find((stage) => stage.id === details.stage)?.title;
    return (stageName ? `مرحلهٔ ${stageName} · ` : '') + 'فیلدهای تغییرکرده: ' + (details.changedKeys as string[]).join('، ');
  }
  if (details.category && typeof details.category === 'string') return categoryNames[details.category] || details.category;
  if (details.settledAt && typeof details.settledAt === 'string') return 'تاریخ ' + displayDate(details.settledAt);
  if (details.number && details.amount) return 'قسط ' + faNumber(String(details.number)) + ' · ' + formatMoney(details.amount) + ' تومان' + (typeof details.paidAt === 'string' ? ' · ' + displayDate(details.paidAt) : '');
  if (details.count && details.totalAmount) return faNumber(String(details.count)) + ' قسط · مجموع ' + formatMoney(details.totalAmount) + ' تومان';
  return '';
}


export { HistoryTab };
