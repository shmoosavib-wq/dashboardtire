import { faNumber } from './api';

export const PAGE_SIZES = [10, 20, 50] as const;

export default function TablePagination({
  page, pageSize, total, disabled = false, itemLabel,
  onPageChange, onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return <nav className="table-pagination" aria-label="صفحه‌بندی جدول">
    <span>نمایش {faNumber(start)} تا {faNumber(end)} از {faNumber(total)} {itemLabel}</span>
    <div>
      <label>تعداد در صفحه
        <select aria-label="تعداد ردیف در صفحه" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{faNumber(size)}</option>)}
        </select>
      </label>
      <button type="button" className="btn" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>قبلی</button>
      <span>صفحه {faNumber(page)} از {faNumber(totalPages)}</span>
      <button type="button" className="btn" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>بعدی</button>
    </div>
  </nav>;
}
