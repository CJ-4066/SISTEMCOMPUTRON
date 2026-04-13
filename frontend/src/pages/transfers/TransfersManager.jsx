import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import { parseDocumentValue } from '../../utils/document';

const formatTransferTimestamp = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-PE');
};

const normalizeSearchText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const buildTransferStudentSearchText = (student) => {
  const parsedDocument = parseDocumentValue(student?.document_number);
  const guardians = Array.isArray(student?.guardians) ? student.guardians : [];

  return normalizeSearchText(
    [
      student?.first_name,
      student?.last_name,
      parsedDocument.document_type,
      parsedDocument.document_number,
      student?.email,
      student?.phone,
      student?.address,
      student?.birth_date,
      student?.assigned_campus_name,
      student?.assigned_course_name,
      student?.assigned_period_name,
      student?.assigned_enrollment_status,
      ...guardians.flatMap((guardian) => [
        guardian?.name,
        guardian?.email,
        guardian?.phone,
        guardian?.relationship,
      ]),
    ]
      .filter(Boolean)
      .join(' '),
  );
};

const createTransferFormDefaults = () => ({
  student_id: '',
  source_enrollment_id: '',
  target_campus_id: '',
  allow_without_target_offering: false,
  request_notes: '',
});

export default function TransfersManager({ title = 'Traslados de Alumnos', showHeader = true }) {
  const { user, hasPermission } = useAuth();
  const [transferRequests, setTransferRequests] = useState([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferCampusFilter, setTransferCampusFilter] = useState('');
  const [transferStudentSearch, setTransferStudentSearch] = useState('');
  const [transferStudentResults, setTransferStudentResults] = useState([]);
  const [transferStudentLoading, setTransferStudentLoading] = useState(false);
  const [transferContext, setTransferContext] = useState(null);
  const [transferForm, setTransferForm] = useState(createTransferFormDefaults);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [loadingTransferOptions, setLoadingTransferOptions] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [reviewingTransferId, setReviewingTransferId] = useState(null);
  const [transferMessage, setTransferMessage] = useState('');
  const [transferError, setTransferError] = useState('');
  const [campuses, setCampuses] = useState([]);
  const transferSearchRequestIdRef = useRef(0);

  const userRoles = user?.roles || [];
  const isAdminProfile = userRoles.includes('ADMIN');
  const canViewStudents = hasPermission(PERMISSIONS.STUDENTS_VIEW);
  const canManageEnrollments = hasPermission(PERMISSIONS.ENROLLMENTS_MANAGE);
  const canViewCampuses = hasPermission(PERMISSIONS.CAMPUSES_VIEW);
  const canManageCampuses = hasPermission(PERMISSIONS.CAMPUSES_MANAGE);
  const canReadCampuses = canViewCampuses || canManageCampuses;
  const canViewTransfers = canViewStudents;
  const canManageTransfers = canViewStudents && canManageEnrollments;
  const canManageTransferRequestsAcrossCampuses = isAdminProfile && canManageTransfers;
  const canSelectTransferCampus = Boolean(isAdminProfile && canViewTransfers && canReadCampuses);

  const loadCampuses = useCallback(async () => {
    if (!canReadCampuses) return;
    try {
      const response = await api.get('/campuses', {
        ...(canSelectTransferCampus ? { _skipCampusScope: true } : {}),
      });
      setCampuses(response.data?.items || []);
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || 'No se pudieron cargar las sedes.');
    }
  }, [canReadCampuses, canSelectTransferCampus]);

  const loadTransfers = useCallback(async () => {
    if (!canViewTransfers) return;
    setTransferLoading(true);
    try {
      const response = await api.get('/students/transfers', {
        params: {
          campus_id: canSelectTransferCampus && transferCampusFilter ? Number(transferCampusFilter) : undefined,
        },
        ...(canSelectTransferCampus ? { _skipCampusScope: true } : {}),
      });
      setTransferRequests(response.data.items || []);
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || 'No se pudieron cargar las solicitudes de traslado.');
    } finally {
      setTransferLoading(false);
    }
  }, [canSelectTransferCampus, canViewTransfers, transferCampusFilter]);

  const loadTransferStudentResults = useCallback(
    async (search = '') => {
      if (!canManageTransfers) return;
      setTransferStudentLoading(true);
      const requestId = transferSearchRequestIdRef.current + 1;
      transferSearchRequestIdRef.current = requestId;

      try {
        const response = await api.get('/students', {
          params: {
            q: search || undefined,
            campus_id: canSelectTransferCampus && transferCampusFilter ? Number(transferCampusFilter) : undefined,
            page: 1,
            page_size: 20,
          },
          ...(canSelectTransferCampus ? { _skipCampusScope: true } : {}),
        });
        if (transferSearchRequestIdRef.current !== requestId) return;

        setTransferStudentResults(
          (response.data?.items || []).filter((student) => student.assigned_enrollment_status === 'ACTIVE'),
        );
      } catch (requestError) {
        if (transferSearchRequestIdRef.current !== requestId) return;
        setTransferError(requestError.response?.data?.message || 'No se pudieron cargar alumnos para traslado.');
      } finally {
        if (transferSearchRequestIdRef.current === requestId) {
          setTransferStudentLoading(false);
        }
      }
    },
    [canManageTransfers, canSelectTransferCampus, transferCampusFilter],
  );

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    if (campuses.length === 0 && canReadCampuses) {
      loadCampuses();
    }
  }, [campuses.length, canReadCampuses, loadCampuses]);

  useEffect(() => {
    const normalizedSearch = transferStudentSearch.trim();
    if (!normalizedSearch) {
      transferSearchRequestIdRef.current += 1;
      setTransferStudentLoading(false);
      setTransferStudentResults([]);
      return undefined;
    }

    const debounce = setTimeout(() => {
      loadTransferStudentResults(normalizedSearch);
    }, 250);

    return () => clearTimeout(debounce);
  }, [loadTransferStudentResults, transferStudentSearch]);

  const filteredTransferStudentResults = useMemo(() => {
    const normalizedSearch = normalizeSearchText(transferStudentSearch);
    if (!normalizedSearch) return transferStudentResults;

    return transferStudentResults.filter((student) =>
      buildTransferStudentSearchText(student).includes(normalizedSearch),
    );
  }, [transferStudentResults, transferStudentSearch]);

  const selectedTransferOption = useMemo(() => {
    if (!transferContext?.options?.length) return null;

    return (
      transferContext.options.find(
        (option) => String(option.enrollment_id) === String(transferForm.source_enrollment_id),
      ) || transferContext.options[0]
    );
  }, [transferContext, transferForm.source_enrollment_id]);

  const selectedTransferTargetCampuses = useMemo(() => {
    if (!selectedTransferOption) return [];

    return transferForm.allow_without_target_offering
      ? selectedTransferOption.all_target_campuses || []
      : selectedTransferOption.target_campuses || [];
  }, [selectedTransferOption, transferForm.allow_without_target_offering]);

  const selectedTransferAvailableCampusIds = useMemo(
    () => new Set((selectedTransferOption?.target_campuses || []).map((campus) => String(campus.campus_id))),
    [selectedTransferOption],
  );

  useEffect(() => {
    if (!transferContext?.options?.length) return;

    const fallbackOption = selectedTransferOption || transferContext.options[0];
    if (!fallbackOption) return;

    const targetExists = selectedTransferTargetCampuses.some(
      (campus) => String(campus.campus_id) === String(transferForm.target_campus_id),
    );
    const nextTargetCampusId = targetExists
      ? String(transferForm.target_campus_id || '')
      : String(selectedTransferTargetCampuses[0]?.campus_id || '');

    if (
      String(transferForm.source_enrollment_id || '') === String(fallbackOption.enrollment_id) &&
      String(transferForm.target_campus_id || '') === nextTargetCampusId
    ) {
      return;
    }

    setTransferForm((prev) => ({
      ...prev,
      source_enrollment_id: String(fallbackOption.enrollment_id),
      target_campus_id: nextTargetCampusId,
    }));
  }, [
    selectedTransferOption,
    selectedTransferTargetCampuses,
    transferContext,
    transferForm.source_enrollment_id,
    transferForm.target_campus_id,
  ]);

  const closeTransferForm = () => {
    setTransferContext(null);
    setTransferForm(createTransferFormDefaults());
    setShowTransferForm(false);
    setLoadingTransferOptions(false);
  };

  const selectTransferStudent = async (student) => {
    if (!canManageTransfers) return;

    setTransferError('');
    setTransferMessage('');
    setTransferContext(null);
    setShowTransferForm(false);

    try {
      const response = await api.get(`/students/${student.id}/transfer-options`, {
        params: {
          campus_id: canSelectTransferCampus && transferCampusFilter ? Number(transferCampusFilter) : undefined,
        },
        ...(canSelectTransferCampus ? { _skipCampusScope: true } : {}),
      });
      const detail = response.data?.item || {};
      const options = detail.options || [];
      if (!options.length) {
        setTransferError('El alumno no tiene una matrícula activa disponible para traslado en la sede filtrada.');
        return;
      }
      const preferredOption = options.find((option) => (option.target_campuses || []).length > 0) || options[0];
      const hasAnyTargets = options.some((option) => (option.target_campuses || []).length > 0);

      setTransferStudentSearch(`${detail.student?.first_name || student.first_name || ''} ${detail.student?.last_name || student.last_name || ''}`.trim());
      setTransferContext({
        student: detail.student,
        options,
      });
      setTransferForm({
        student_id: String(detail.student?.id || student.id),
        source_enrollment_id: String(preferredOption.enrollment_id),
        target_campus_id: String(preferredOption.target_campuses?.[0]?.campus_id || ''),
        allow_without_target_offering: false,
        request_notes: '',
      });
      setShowTransferForm(true);
      if (!hasAnyTargets) {
        setTransferError(
          'La matrícula cargó correctamente, pero no existe otra sede activa disponible para ese curso y periodo. Si necesitas moverlo igual, marca la opción "No es necesario que haya un curso".',
        );
      }
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || 'No se pudo preparar la solicitud de traslado.');
    } finally {
      // Done
    }
  };

  const submitTransferRequest = async (event) => {
    event.preventDefault();
    if (!canManageTransfers || !transferContext) return;

    setTransferError('');
    setTransferMessage('');
    setSubmittingTransfer(true);

    try {
      const payload = {
        student_id: Number(transferForm.student_id),
        source_enrollment_id: Number(transferForm.source_enrollment_id),
        target_campus_id: Number(transferForm.target_campus_id),
        allow_without_target_offering: Boolean(transferForm.allow_without_target_offering),
        request_notes: transferForm.request_notes.trim() || undefined,
      };

      await api.post('/students/transfers', payload);
      setTransferMessage('Solicitud de traslado registrada correctamente.');
      closeTransferForm();
      setTransferStudentSearch('');
      await loadTransfers();
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || 'No se pudo registrar la solicitud de traslado.');
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const resolveTransferRequest = async (item, decision) => {
    if (!canManageTransfers) return;

    const actionText = decision === 'APPROVE' ? 'aprobar' : 'rechazar';
    const notesPrompt = window.prompt(`Ingresa notas de revisión para ${actionText} el traslado (opcional):`, '');
    if (notesPrompt === null) return;

    setReviewingTransferId(item.id);
    setTransferError('');
    setTransferMessage('');

    try {
      const endpoint = decision === 'APPROVE' ? 'approve' : 'reject';
      await api.post(`/students/transfers/${item.id}/${endpoint}`, {
        review_notes: notesPrompt.trim() || undefined,
      });
      setTransferMessage(`Solicitud de traslado #${item.id} procesada correctamente.`);
      await loadTransfers();
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || `No se pudo ${actionText} la solicitud.`);
    } finally {
      setReviewingTransferId(null);
    }
  };

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-primary-900">{title}</h2>
        </div>
      )}

      {transferMessage ? (
        <div className="rounded-xl bg-primary-100 px-4 py-3 text-sm text-primary-800">
          {transferMessage}
        </div>
      ) : null}

      {transferError ? (
        <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-700">
          {transferError}
        </div>
      ) : null}

      {canManageTransfers ? (
        <div className="panel-soft space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {canSelectTransferCampus ? (
              <label className="space-y-1">
                <span className="text-xs font-semibold text-primary-700">Filtrar por sede</span>
                <select
                  className="app-input"
                  value={transferCampusFilter}
                  onChange={(event) => setTransferCampusFilter(event.target.value)}
                >
                  <option value="">Todas las sedes</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
                <span className="block text-[11px] text-primary-600">
                  Este filtro aplica al buscador de alumnos y al listado de solicitudes.
                </span>
              </label>
            ) : null}

            <label className="space-y-1">
              <span className="text-xs font-semibold text-primary-700">Buscador de alumno</span>
              <input
                className="app-input"
                type="search"
                autoComplete="off"
                placeholder="Buscar por nombre, documento, telefono, correo, sede, curso o apoderado"
                value={transferStudentSearch}
                onChange={(event) => setTransferStudentSearch(event.target.value)}
              />
            </label>
          </div>

          {transferStudentLoading ? (
            <p className="text-sm text-primary-700">Buscando alumnos...</p>
          ) : null}

          {!transferStudentLoading && transferStudentSearch.trim() ? (
            <p className="text-xs font-medium text-primary-700">
              {filteredTransferStudentResults.length} alumno
              {filteredTransferStudentResults.length === 1 ? '' : 's'} encontrado
              {filteredTransferStudentResults.length === 1 ? '' : 's'} para ese criterio.
            </p>
          ) : null}

          {!transferStudentLoading && filteredTransferStudentResults.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {filteredTransferStudentResults.map((student) => {
                const parsedDocument = parseDocumentValue(student.document_number);
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => selectTransferStudent(student)}
                    className="rounded-xl border border-primary-200 bg-white px-3 py-3 text-left hover:border-accent-300 hover:bg-accent-50"
                  >
                    <p className="font-semibold text-primary-900">
                      {student.first_name} {student.last_name}
                    </p>
                    <p className="text-xs text-primary-600">
                      {parsedDocument.document_type}: {parsedDocument.document_number || '-'}
                    </p>
                    <p className="mt-2 text-xs text-primary-700">
                      Sede asignada: {student.assigned_campus_name || 'Sin sede'}
                    </p>
                    <p className="text-xs text-primary-600">
                      {student.assigned_course_name || 'Sin curso'} |{' '}
                      {student.assigned_enrollment_status === 'ACTIVE'
                        ? 'Matricula activa'
                        : student.assigned_enrollment_status
                          ? `Matricula ${String(student.assigned_enrollment_status).toLowerCase()}`
                          : 'Sin matricula'}
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-accent-700">
                      {student.assigned_enrollment_status === 'ACTIVE' ? 'Preparar traslado' : 'Revisar alumno'}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!transferStudentLoading && filteredTransferStudentResults.length === 0 ? (
            <p className="text-sm text-primary-700">
              {transferStudentSearch.trim()
                ? 'No se encontraron alumnos con ese criterio de busqueda.'
                : 'Escribe cualquier dato del alumno para filtrar y seleccionar a quien vas a trasladar.'}
            </p>
          ) : null}
        </div>
      ) : null}

      {showTransferForm && transferContext ? (
        <form onSubmit={submitTransferRequest} className="panel-soft space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-primary-900">
                Solicitar traslado: {transferContext.student?.first_name} {transferContext.student?.last_name}
              </h3>
              <p className="text-sm text-primary-700">
                Selecciona la matrícula de origen y la sede que deberá aceptar el traslado.
              </p>
            </div>
            <button
              type="button"
              onClick={closeTransferForm}
              className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            >
              Cerrar
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-primary-700">Matricula / curso actual</span>
              <select
                className="app-input"
                value={transferForm.source_enrollment_id}
                onChange={(event) =>
                  setTransferForm((prev) => ({ ...prev, source_enrollment_id: event.target.value }))
                }
                required
              >
                {transferContext.options.map((option) => (
                  <option key={option.enrollment_id} value={option.enrollment_id}>
                    {option.course_name} - {option.period_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold text-primary-700">Sede asignada</span>
              <input
                className="app-input"
                value={selectedTransferOption?.source_campus_name || ''}
                placeholder="Se completa al seleccionar el alumno"
                readOnly
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold text-primary-700">Sede destino</span>
              <select
                className="app-input"
                value={transferForm.target_campus_id}
                onChange={(event) =>
                  setTransferForm((prev) => ({ ...prev, target_campus_id: event.target.value }))
                }
                required={Boolean(selectedTransferTargetCampuses.length)}
                disabled={!selectedTransferOption || !selectedTransferTargetCampuses.length}
              >
                <option value="">
                  {selectedTransferTargetCampuses.length
                    ? 'Seleccione sede destino'
                    : 'No hay sedes destino disponibles'}
                </option>
                {selectedTransferTargetCampuses.map((campus) => (
                  <option key={campus.campus_id} value={campus.campus_id}>
                    {campus.campus_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-primary-200 bg-white px-3 py-3 text-sm text-primary-800">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={transferForm.allow_without_target_offering}
              onChange={(event) =>
                setTransferForm((prev) => ({
                  ...prev,
                  allow_without_target_offering: event.target.checked,
                }))
              }
            />
            <span>
              <span className="block font-semibold text-primary-900">No es necesario que haya un curso</span>
              <span className="block text-xs text-primary-700">
                Si lo marcas, el traslado podrá enviarse aunque la sede destino no tenga una oferta activa del mismo
                curso. En ese caso el alumno cambia de sede, pero no se crea matrícula nueva hasta registrar un curso
                después.
              </span>
            </span>
          </label>

          {selectedTransferOption ? (
            <div className="space-y-2 rounded-xl border border-primary-200 bg-white px-3 py-3">
              <div>
                <p className="text-sm font-semibold text-primary-900">
                  Validación de sedes para el curso de origen
                </p>
                <p className="text-xs text-primary-700">
                  Aquí solo se muestran las sedes donde el mismo curso del alumno sí está habilitado.
                </p>
              </div>

              {selectedTransferOption.course_enabled_campuses?.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedTransferOption.course_enabled_campuses.map((campus) => {
                    const campusId = String(campus.campus_id);
                    const isAvailableForTransfer = selectedTransferAvailableCampusIds.has(campusId);
                    const statusText = isAvailableForTransfer
                      ? 'Curso habilitado y disponible para traslado'
                      : 'Curso habilitado, pero esta sede no está disponible para esta solicitud';

                    return (
                      <label
                        key={campus.campus_id}
                        className="flex items-start gap-3 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-900"
                      >
                        <input type="checkbox" className="mt-1 h-4 w-4" checked readOnly />
                        <span>
                          <span className="block font-medium">{campus.campus_name}</span>
                          <span className="block text-xs text-primary-700">{statusText}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-red-700">
                  No hay sedes con este curso habilitado fuera de la sede de origen.
                </p>
              )}
            </div>
          ) : null}

          {selectedTransferOption ? (
            <div className="space-y-1">
              <p className="text-sm text-primary-700">
                Origen actual: {selectedTransferOption.source_campus_name} | Curso: {selectedTransferOption.course_name}
                {' '}| Periodo: {selectedTransferOption.period_name}
              </p>
              {!(selectedTransferOption.target_campuses || []).length && !transferForm.allow_without_target_offering ? (
                <p className="text-sm text-red-700">
                  No aparece un cambio de sede para esta matrícula porque no existe otra sede activa habilitada para
                  ese mismo curso y periodo. Marca la opción para permitir traslado sin curso.
                </p>
              ) : null}
            </div>
          ) : null}

          <textarea
            className="app-input min-h-[110px]"
            placeholder="Motivo u observaciones del traslado (opcional)"
            value={transferForm.request_notes}
            onChange={(event) => setTransferForm((prev) => ({ ...prev, request_notes: event.target.value }))}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submittingTransfer || !selectedTransferTargetCampuses.length}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submittingTransfer ? 'Registrando...' : 'Registrar solicitud'}
            </button>
            <button
              type="button"
              onClick={closeTransferForm}
              className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        showHeader && (
          <p className="rounded-xl border border-dashed border-primary-300 bg-white p-3 text-sm text-primary-700">
            Usa el buscador arriba para encontrar un alumno y preparar un nuevo traslado.
          </p>
        )
      )}

      <article className="card overflow-x-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-primary-900">Solicitudes de Traslado</h3>
          {transferLoading && <span className="text-xs text-primary-500">Actualizando...</span>}
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-primary-600">
              <th className="pb-2 pr-3">Solicitud</th>
              <th className="pb-2 pr-3">Alumno</th>
              <th className="pb-2 pr-3">Curso / periodo</th>
              <th className="pb-2 pr-3">Origen</th>
              <th className="pb-2 pr-3">Destino</th>
              <th className="pb-2 pr-3">Estado</th>
              <th className="pb-2 pr-3">Notas</th>
              <th className="pb-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {transferRequests.map((item) => {
              const canReviewRequest =
                canManageTransfers &&
                item.status === 'PENDING' &&
                (item.can_review || canManageTransferRequestsAcrossCampuses);
              const statusClassName =
                item.status === 'APPROVED'
                  ? 'bg-primary-100 text-primary-800'
                  : item.status === 'REJECTED'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-accent-100 text-accent-800';
              const directionLabel =
                item.direction === 'INCOMING'
                  ? 'Recibir'
                  : item.direction === 'OUTGOING'
                    ? 'Enviada'
                    : 'General';

              return (
                <tr key={item.id} className="border-t border-primary-100 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-primary-900">#{item.id}</p>
                    <p className="text-xs text-primary-600">{formatTransferTimestamp(item.created_at)}</p>
                    <p className="text-xs text-primary-600">{item.requested_by_name || 'Sin usuario origen'}</p>
                    <span className="mt-1 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-primary-700">
                      {directionLabel}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-primary-900">{item.student_name}</p>
                    <p className="text-xs text-primary-600">{item.student_document || '-'}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-primary-900">{item.course_name}</p>
                    <p className="text-xs text-primary-600">{item.period_name}</p>
                  </td>
                  <td className="py-2 pr-3">{item.source_campus_name}</td>
                  <td className="py-2 pr-3">{item.target_campus_name}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClassName}`}>
                      {item.status}
                    </span>
                    {item.reviewed_by_name ? (
                      <p className="mt-1 text-xs text-primary-600">
                        {item.reviewed_by_name} | {formatTransferTimestamp(item.decided_at)}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 max-w-[200px]">
                    <p className="truncate" title={item.request_notes}>{item.request_notes || 'Sin observaciones.'}</p>
                    {item.review_notes ? (
                      <p className="mt-1 text-xs text-primary-600 truncate" title={item.review_notes}>Rev: {item.review_notes}</p>
                    ) : null}
                  </td>
                  <td className="py-2">
                    {canReviewRequest ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={reviewingTransferId === item.id}
                          onClick={() => resolveTransferRequest(item, 'APPROVE')}
                          className="rounded-lg border border-primary-300 bg-white px-2 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          APROBAR
                        </button>
                        <button
                          type="button"
                          disabled={reviewingTransferId === item.id}
                          onClick={() => resolveTransferRequest(item, 'REJECT')}
                          className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          RECHAZAR
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-primary-500">Sin acciones</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {!transferLoading && transferRequests.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-4 text-center text-sm text-primary-600">
                  {canSelectTransferCampus && transferCampusFilter
                    ? 'No hay solicitudes de traslado para la sede seleccionada.'
                    : 'No hay solicitudes de traslado registradas.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </div>
  );
}
