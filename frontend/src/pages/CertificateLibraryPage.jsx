import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, QrCode, RotateCcw, Search } from 'lucide-react';
import api from '../services/api';
import PaginationControls from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { normalizeDateOnly } from '../utils/age';

const PAGE_SIZE = 20;

const toLocalDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-PE', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
};

const toLocalDate = (value) => {
  const normalizedDate = normalizeDateOnly(value);
  if (!normalizedDate) return '-';
  const date = new Date(`${normalizedDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-PE');
};

const buildCertificateUrl = (item, { download = false } = {}) => {
  if (!item) return '#';

  const params = new URLSearchParams({
    v: String(Date.now()),
    source: 'library',
    nombre: item.student_name,
    documento: item.student_document,
    curso: item.course_name,
    horas: item.hours_academic,
    modalidad: item.modality,
    inicio: normalizeDateOnly(item.start_date),
    fin: normalizeDateOnly(item.end_date),
    emision: normalizeDateOnly(item.issue_date),
    ciudad: item.city,
    institucion: item.organization,
    codigo: item.certificate_code,
    token: item.validation_token || '',
  });

  if (download) {
    params.set('download', '1');
  }

  Array.from(params.keys()).forEach((key) => {
    if (params.get(key) === 'null' || params.get(key) === 'undefined' || params.get(key) === '') {
      params.delete(key);
    }
  });

  return `/certificado-pdf.html?${params.toString()}`;
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

  const openInNewTab = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleOpen = (item) => {
    openInNewTab(buildCertificateUrl(item));
  };

  const handleDownload = (item) => {
    openInNewTab(buildCertificateUrl(item, { download: true }));
  };

  const handleVerification = (item) => {
    if (!item?.validation_token) return;
    openInNewTab(`/verificar/${encodeURIComponent(item.validation_token)}`);
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-700">Registro institucional</p>
          <h1 className="text-2xl font-semibold text-primary-900">Certificados emitidos</h1>
          <p className="text-sm text-primary-700">
            Consulta cuándo se emitió cada certificado, quién lo registró y vuelve a abrirlo o descargarlo.
          </p>
        </div>
        <div className="rounded-2xl border border-primary-200 bg-white px-4 py-3 text-right">
          <p className="text-2xl font-semibold text-primary-900">{total}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">certificados registrados</p>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <article className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100 bg-primary-50/60 p-4">
          <div className="relative w-full lg:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-500" />
            <input
              className="app-input w-full pl-9"
              placeholder="Buscar por código, alumno, documento o curso"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={clearFilters}
            disabled={loading || (!search && !searchInput)}
            className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" />
            Limpiar filtros
          </button>
        </div>

        <div className="overflow-x-auto p-4">
          <table className="min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-primary-200 text-left text-xs font-semibold uppercase tracking-wide text-primary-600">
                <th className="pb-3 pr-4">Código</th>
                <th className="pb-3 pr-4">Alumno</th>
                <th className="pb-3 pr-4">Curso</th>
                <th className="pb-3 pr-4">Fecha de emisión</th>
                <th className="pb-3 pr-4">Registrado</th>
                <th className="pb-3 pr-4">Emitido por</th>
                <th className="pb-3 pr-4">Sede</th>
                <th className="pb-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-primary-100 align-top last:border-0">
                  <td className="py-3 pr-4 font-semibold text-primary-900">{item.certificate_code || '-'}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-primary-900">{item.student_name || '-'}</div>
                    <div className="text-xs text-primary-600">{item.student_document || 'Sin documento'}</div>
                  </td>
                  <td className="max-w-52 py-3 pr-4 text-primary-800">{item.course_name || '-'}</td>
                  <td className="py-3 pr-4">{toLocalDate(item.issue_date)}</td>
                  <td className="py-3 pr-4">{toLocalDateTime(item.created_at)}</td>
                  <td className="py-3 pr-4">{item.created_by_name || '-'}</td>
                  <td className="py-3 pr-4">{item.campus_name || 'Acceso global'}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpen(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Descargar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerification(item)}
                        disabled={!item.validation_token}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-accent-300 bg-accent-50 px-2.5 py-1.5 text-xs font-semibold text-accent-800 transition hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        Validar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-primary-600">
                    Cargando certificados emitidos...
                  </td>
                </tr>
              ) : null}

              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center">
                    <p className="font-semibold text-primary-800">Todavía no hay certificados emitidos</p>
                    <p className="mt-1 text-sm text-primary-600">
                      Los certificados aparecerán aquí al generar su QR verificable o descargar el PDF.
                    </p>
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
        </div>
      </article>
    </section>
  );
}
