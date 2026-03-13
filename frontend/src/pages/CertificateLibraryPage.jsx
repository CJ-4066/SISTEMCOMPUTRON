import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import PaginationControls from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';

const PAGE_SIZE = 20;

const toLocalDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const toLocalDate = (value) => {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

export default function CertificateLibraryPage() {
  const { hasPermission } = useAuth();
  const canViewLibrary = hasPermission(PERMISSIONS.PAYMENTS_VIEW) || hasPermission(PERMISSIONS.PAYMENTS_MANAGE);

  const [items, setItems] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLibrary = useCallback(
    async ({ q = search, targetPage = page, pageSize = PAGE_SIZE } = {}) => {
      if (!canViewLibrary) return;

      setLoading(true);
      setError('');
      try {
        const response = await api.get('/certificates/library', {
          params: {
            q: q || undefined,
            page: targetPage,
            page_size: pageSize,
          },
        });

        const nextItems = response.data?.items || [];
        const meta = response.data?.meta || {};
        const nextTotal = Number(meta.total || nextItems.length);
        const totalPages = Math.max(1, Math.ceil(nextTotal / pageSize));

        if (targetPage > totalPages) {
          setPage(totalPages);
          return;
        }

        setItems(nextItems);
        setTotal(nextTotal);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'No se pudo cargar la biblioteca de certificados.');
      } finally {
        setLoading(false);
      }
    },
    [canViewLibrary, page, search],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!canViewLibrary) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Biblioteca de certificados</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este modulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Biblioteca de certificados</h1>
        <p className="text-sm text-primary-700">
          Historial de certificados emitidos con fecha, hora, usuario emisor y sede.
        </p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <article className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            className="app-input w-full lg:w-80"
            placeholder="Buscar por código, alumno o curso"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button
            type="button"
            onClick={clearFilters}
            disabled={loading || (!search && !searchInput)}
            className="rounded-lg border border-primary-200 px-3 py-2 text-sm text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Limpiar
          </button>
        </div>

        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-primary-600">
              <th className="pb-2 pr-3">Código</th>
              <th className="pb-2 pr-3">Alumno</th>
              <th className="pb-2 pr-3">Curso</th>
              <th className="pb-2 pr-3">Fecha de emisión</th>
              <th className="pb-2 pr-3">Registrado</th>
              <th className="pb-2 pr-3">Creado por</th>
              <th className="pb-2">Sede</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-primary-100 align-top">
                <td className="py-2 pr-3">{item.certificate_code || '-'}</td>
                <td className="py-2 pr-3">
                  <div>{item.student_name || '-'}</div>
                  <div className="text-xs text-primary-600">{item.student_document || '-'}</div>
                </td>
                <td className="py-2 pr-3">{item.course_name || '-'}</td>
                <td className="py-2 pr-3">{toLocalDate(item.issue_date)}</td>
                <td className="py-2 pr-3">{toLocalDateTime(item.created_at)}</td>
                <td className="py-2 pr-3">{item.created_by_name || '-'}</td>
                <td className="py-2">{item.campus_name || '-'}</td>
              </tr>
            ))}

            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-sm text-primary-600">
                  No se encontraron certificados emitidos.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          disabled={loading}
          label="certificados"
        />
      </article>
    </section>
  );
}
