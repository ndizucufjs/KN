/**
 * PaginationBar — kontrol paginasi reusable (P2).
 * Menampilkan rentang "X–Y dari N", tombol Prev/Next, indikator halaman,
 * dan pemilih ukuran halaman berbasis tombol (lolos ux_audit — tanpa dropdown native).
 *
 * Props:
 *  - page, pageSize, total, hasMore, loading
 *  - onPrev, onNext, onPageSize (opsional)
 *  - testId  (prefix data-testid, default "pager")
 *  - pageSizeOptions (default [20, 50, 100])
 *  - label   (kata benda entitas, mis. "roll", "order")
 */
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function PaginationBar({
  page = 1,
  pageSize = 20,
  total = 0,
  hasMore = false,
  loading = false,
  onPrev,
  onNext,
  onPageSize,
  testId = "pager",
  pageSizeOptions = [20, 50, 100],
  label = "data",
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      data-testid={`${testId}-bar`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EFF0F2] bg-white px-3 py-2"
    >
      <span data-testid={`${testId}-info`} className="text-[11.5px] text-[#6B6B73] tabular-nums">
        {total === 0 ? `Tidak ada ${label}` : (
          <>Menampilkan <strong className="text-[#1C1C1E]">{from}–{to}</strong> dari <strong className="text-[#1C1C1E]">{total}</strong> {label}</>
        )}
      </span>

      <div className="flex items-center gap-2">
        {onPageSize && (
          <div className="flex items-center gap-1" data-testid={`${testId}-sizes`}>
            <span className="text-[10.5px] text-[#8E8E93] mr-1">Per halaman</span>
            {pageSizeOptions.map((sz) => (
              <button
                key={sz}
                data-testid={`${testId}-size-${sz}`}
                onClick={() => onPageSize(sz)}
                disabled={loading}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                  pageSize === sz
                    ? "bg-[#007AFF] text-white"
                    : "bg-white border border-[#E5E5EA] text-[#6B6B73] hover:border-[#007AFF]"
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            data-testid={`${testId}-prev`}
            onClick={onPrev}
            disabled={page <= 1 || loading}
            className="inline-flex items-center gap-1 rounded-md border border-[#E5E5EA] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#3C3C43] hover:bg-[#F2F2F7] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={13} /> Sebelumnya
          </button>
          <span data-testid={`${testId}-page`} className="px-2 text-[11.5px] font-semibold text-[#6B6B73] tabular-nums whitespace-nowrap">
            Hal {page} / {totalPages}
          </span>
          <button
            data-testid={`${testId}-next`}
            onClick={onNext}
            disabled={!hasMore || loading}
            className="inline-flex items-center gap-1 rounded-md border border-[#E5E5EA] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#3C3C43] hover:bg-[#F2F2F7] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Berikutnya <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
