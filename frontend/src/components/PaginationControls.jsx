const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function PaginationControls({
  page = 1,
  totalPages = 1,
  total = 0,
  pageSize = 20,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  label = 'registros',
}) {
  const canGoPrev = !disabled && page > 1;
  const canGoNext = !disabled && page < totalPages;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-3 text-sm">
      <div className="flex flex-wrap items-center gap-3 text-primary-700">
        <span>
          Pagina {page} de {totalPages}
        </span>
        <span>
          {total} {label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <select
            className="app-input w-36"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            disabled={disabled}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} por pagina
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="button"
          className="rounded-lg border border-primary-200 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onPageChange?.(Math.max(1, page - 1))}
          disabled={!canGoPrev}
        >
          Anterior
        </button>

        <button
          type="button"
          className="rounded-lg border border-primary-200 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onPageChange?.(Math.min(totalPages, page + 1))}
          disabled={!canGoNext}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
