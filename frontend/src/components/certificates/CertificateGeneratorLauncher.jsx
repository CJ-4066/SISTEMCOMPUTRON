import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';

const CERTIFICATE_DRAFT_STORAGE_PREFIX = 'computron:certificate-generator-draft:';
const MAX_PHOTO_SIDE = 1200;
const PHOTO_OUTPUT_QUALITY = 0.86;
const STUDENT_LOOKUP_LIMIT = 8;

const getTodayIsoDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const createCertificateDraftDefaults = () => ({
  campus_id: null,
  photo_data_url: '',
  photo_file_name: '',
  student_name: 'Nombre del alumno',
  student_document: '',
  certificate_code: 'CMP-2026-00125',
  course_name: 'Curso de ejemplo',
  hours_academic: '120',
  modality: 'Virtual',
  start_date: '2026-01-10',
  end_date: '2026-02-20',
  issue_date: '2026-02-20',
  city: 'Lima',
  organization: 'Instituto Computron',
});

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la foto seleccionada.'));
    reader.readAsDataURL(file);
  });

const loadImageFromDataUrl = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo procesar la foto seleccionada.'));
    image.src = dataUrl;
  });

const optimizePhotoDataUrl = async (file) => {
  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(rawDataUrl);
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(image.width || 1, image.height || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    return rawDataUrl;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', PHOTO_OUTPUT_QUALITY);
};

const cleanupOldDrafts = () => {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith(CERTIFICATE_DRAFT_STORAGE_PREFIX))
    .forEach((key) => {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || '{}');
        const savedAt = Number(parsed.saved_at_ts || 0);
        if (!savedAt || now - savedAt > 24 * 60 * 60 * 1000) {
          window.localStorage.removeItem(key);
        }
      } catch {
        window.localStorage.removeItem(key);
      }
    });
};

const buildGeneratorUrl = (draftId, { autoDownload = false } = {}) => {
  const params = new URLSearchParams({
    v: `${Date.now()}`,
    draft_id: draftId,
  });

  if (autoDownload) {
    params.set('download', '1');
  }

  return `/certificado-pdf.html?${params.toString()}`;
};

const formatStudentName = (student) =>
  [student?.first_name, student?.last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

const parseComparableDate = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const pickPreferredEnrollment = (enrollments = []) =>
  [...enrollments].sort((left, right) => {
    const leftRank = left?.status === 'ACTIVE' ? 0 : 1;
    const rightRank = right?.status === 'ACTIVE' ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;

    const dateDifference =
      parseComparableDate(right?.period_end_date || right?.enrollment_date) -
      parseComparableDate(left?.period_end_date || left?.enrollment_date);
    if (dateDifference !== 0) return dateDifference;

    return Number(right?.id || 0) - Number(left?.id || 0);
  })[0] || null;

const buildCertificateCode = ({ issueDate, studentId, enrollmentId }) => {
  const year = String(issueDate || getTodayIsoDate()).slice(0, 4) || `${new Date().getFullYear()}`;
  const serialSource = Number(enrollmentId || studentId || 0);
  const serial = serialSource > 0 ? String(serialSource).padStart(5, '0') : '00001';
  return `CMP-${year}-${serial}`;
};

const resolveCourseStartDate = (enrollment) => enrollment?.course_start_date || enrollment?.period_start_date || '';

const resolveCourseEndDate = (enrollment) => enrollment?.course_end_date || enrollment?.period_end_date || '';

export default function CertificateGeneratorLauncher() {
  const { hasPermission } = useAuth();
  const canSearchStudents = hasPermission(PERMISSIONS.STUDENTS_VIEW);

  const [draft, setDraft] = useState(createCertificateDraftDefaults);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingStudentDetail, setLoadingStudentDetail] = useState(false);
  const [error, setError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');

  const selectedStudent = useMemo(
    () => studentResults.find((student) => String(student.id) === String(selectedStudentId)) || null,
    [selectedStudentId, studentResults],
  );

  const updateDraftField = (field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const loadStudentOptions = useCallback(
    async (search = '') => {
      if (!canSearchStudents) {
        setStudentResults([]);
        return;
      }

      setLoadingStudents(true);
      setLookupError('');
      try {
        const response = await api.get('/students', {
          params: {
            q: search || undefined,
            page: 1,
            page_size: STUDENT_LOOKUP_LIMIT,
          },
        });
        setStudentResults(response.data?.items || []);
      } catch (requestError) {
        setStudentResults([]);
        setLookupError(requestError.response?.data?.message || 'No se pudieron cargar alumnos.');
      } finally {
        setLoadingStudents(false);
      }
    },
    [canSearchStudents],
  );

  useEffect(() => {
    if (!canSearchStudents) return undefined;

    const debounce = window.setTimeout(() => {
      loadStudentOptions(studentSearch.trim());
    }, 250);

    return () => window.clearTimeout(debounce);
  }, [canSearchStudents, loadStudentOptions, studentSearch]);

  const handleStudentAutofill = async (student) => {
    if (!student?.id) return;

    setSelectedStudentId(String(student.id));
    setLoadingStudentDetail(true);
    setLookupError('');
    setLookupMessage('');
    setError('');

    try {
      const response = await api.get(`/students/${student.id}`);
      const item = response.data?.item;
      const preferredEnrollment = pickPreferredEnrollment(item?.enrollments || []);
      const courseStartDate = resolveCourseStartDate(preferredEnrollment);
      const courseEndDate = resolveCourseEndDate(preferredEnrollment);
      const issueDate = courseEndDate || getTodayIsoDate();
      const studentName = formatStudentName(item) || 'Nombre del alumno';
      const hasEnrollmentData = Boolean(preferredEnrollment);

      setDraft((current) => ({
        ...current,
        campus_id: preferredEnrollment?.campus_id || item?.assigned_campus_id || null,
        student_name: studentName,
        student_document: item?.document_number || '',
        certificate_code: buildCertificateCode({
          issueDate,
          studentId: item?.id,
          enrollmentId: preferredEnrollment?.id,
        }),
        course_name: preferredEnrollment?.course_name || '',
        hours_academic: preferredEnrollment?.duration_hours ? String(preferredEnrollment.duration_hours) : '',
        modality: preferredEnrollment?.modality || '',
        start_date: courseStartDate,
        end_date: courseEndDate,
        issue_date: issueDate,
        city: preferredEnrollment?.campus_city || item?.assigned_campus_city || current.city || '',
        organization: current.organization || 'Instituto Computron',
      }));

      setLookupMessage(
        hasEnrollmentData
          ? `Se cargaron los datos de ${studentName}, incluida la fecha de inicio y culminación del curso, desde su matrícula ${
              preferredEnrollment?.status === 'ACTIVE' ? 'activa' : 'más reciente'
            }.`
          : `Se cargaron nombre y documento de ${studentName}. Completa manualmente curso, horas y fechas porque no tiene matrícula disponible.`,
      );
    } catch (requestError) {
      setLookupError(requestError.response?.data?.message || 'No se pudo cargar el detalle del alumno.');
    } finally {
      setLoadingStudentDetail(false);
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0] || null;
    setError('');

    if (!file) {
      setDraft((current) => ({
        ...current,
        photo_data_url: '',
        photo_file_name: '',
      }));
      return;
    }

    setProcessingPhoto(true);
    try {
      const optimizedPhotoDataUrl = await optimizePhotoDataUrl(file);
      setDraft((current) => ({
        ...current,
        photo_data_url: optimizedPhotoDataUrl,
        photo_file_name: file.name,
      }));
    } catch (photoError) {
      setError(photoError.message || 'No se pudo preparar la foto del alumno.');
    } finally {
      setProcessingPhoto(false);
    }
  };

  const persistDraft = () => {
    if (typeof window === 'undefined') {
      throw new Error('El generador solo está disponible en el navegador.');
    }

    cleanupOldDrafts();
    const draftId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const storageKey = `${CERTIFICATE_DRAFT_STORAGE_PREFIX}${draftId}`;

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...draft,
        saved_at_ts: Date.now(),
      }),
    );

    return draftId;
  };

  const openGenerator = ({ autoDownload = false } = {}) => {
    setError('');

    try {
      const draftId = persistDraft();
      const generatorUrl = buildGeneratorUrl(draftId, { autoDownload });
      const openedWindow = window.open('about:blank', '_blank');

      if (!openedWindow) {
        throw new Error('El navegador bloqueó la nueva pestaña del generador.');
      }

      openedWindow.opener = null;
      openedWindow.location.replace(generatorUrl);
      openedWindow.focus?.();
    } catch (openError) {
      setError(openError.message || 'No se pudo abrir el generador de certificados.');
    }
  };

  const clearDraft = () => {
    setError('');
    setLookupError('');
    setLookupMessage('');
    setSelectedStudentId('');
    setStudentSearch('');
    setDraft(createCertificateDraftDefaults());
  };

  return (
    <article className="card space-y-4">
      {canSearchStudents ? (
        <section className="panel-soft space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-primary-900">Seleccionar alumno</h3>
              <p className="text-sm text-primary-700">
                Busca por nombre o documento. Al seleccionar un alumno, el sistema autocompleta el certificado con su
                matrícula activa o, si no existe, con la más reciente.
              </p>
              <p className="mt-1 text-xs text-primary-600">
                La foto no se autocompleta porque actualmente no se guarda en la ficha del alumno.
              </p>
            </div>

            {selectedStudent ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedStudentId('');
                  setLookupMessage('');
                  setLookupError('');
                }}
                className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Quitar selección
              </button>
            ) : null}
          </div>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-primary-700">Alumno</span>
            <input
              className="app-input"
              placeholder="Buscar alumno por nombre o documento"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
            />
          </label>

          {loadingStudents ? <p className="text-sm text-primary-700">Buscando alumnos...</p> : null}

          {!loadingStudents && studentResults.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {studentResults.map((student) => {
                const isSelected = String(student.id) === String(selectedStudentId);
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => handleStudentAutofill(student)}
                    disabled={loadingStudentDetail}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      isSelected
                        ? 'border-accent-400 bg-accent-50'
                        : 'border-primary-200 bg-white hover:border-accent-300 hover:bg-accent-50'
                    } ${loadingStudentDetail ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    <p className="font-semibold text-primary-900">{formatStudentName(student) || `Alumno #${student.id}`}</p>
                    <p className="text-xs text-primary-600">{student.document_number || 'Sin documento'}</p>
                    <p className="mt-2 text-xs text-primary-700">
                      Curso: {student.assigned_course_name || 'Sin curso asignado'}
                    </p>
                    <p className="text-xs text-primary-600">
                      Sede: {student.assigned_campus_name || 'Sin sede asignada'}
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-accent-700">
                      {isSelected ? 'Alumno seleccionado' : 'Usar para certificado'}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!loadingStudents && studentResults.length === 0 ? (
            <p className="text-sm text-primary-700">
              {studentSearch.trim()
                ? 'No se encontraron alumnos para ese criterio.'
                : 'Escribe un nombre o documento para elegir al alumno y precargar el certificado.'}
            </p>
          ) : null}

          {loadingStudentDetail ? <p className="text-sm text-primary-700">Cargando datos del alumno...</p> : null}
        </section>
      ) : (
        <section className="panel-soft">
          <p className="text-sm text-primary-700">
            Tu usuario no puede consultar alumnos desde este módulo. Puedes completar el certificado manualmente.
          </p>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Foto del alumno</span>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="app-input file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-700"
            />
            <span className="text-xs text-primary-600">
              {processingPhoto ? 'Procesando foto...' : draft.photo_file_name || 'Sin archivos seleccionados'}
            </span>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Nombre del alumno</span>
            <input
              type="text"
              className="app-input"
              value={draft.student_name}
              onChange={(event) => updateDraftField('student_name', event.target.value)}
              placeholder="Nombre del alumno"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Documento</span>
            <input
              type="text"
              className="app-input"
              value={draft.student_document}
              onChange={(event) => updateDraftField('student_document', event.target.value)}
              placeholder="DNI o codigo"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Codigo certificado</span>
            <input
              type="text"
              className="app-input"
              value={draft.certificate_code}
              onChange={(event) => updateDraftField('certificate_code', event.target.value)}
              placeholder="CMP-2026-00125"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Curso</span>
            <input
              type="text"
              className="app-input"
              value={draft.course_name}
              onChange={(event) => updateDraftField('course_name', event.target.value)}
              placeholder="Curso de ejemplo"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Horas academicas</span>
            <input
              type="number"
              min="1"
              className="app-input"
              value={draft.hours_academic}
              onChange={(event) => updateDraftField('hours_academic', event.target.value)}
              placeholder="120"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Modalidad</span>
            <select
              className="app-input"
              value={draft.modality}
              onChange={(event) => updateDraftField('modality', event.target.value)}
            >
              <option value="">Selecciona modalidad</option>
              <option value="Virtual">Virtual</option>
              <option value="Presencial">Presencial</option>
              <option value="Hibrido">Hibrido</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Fecha inicio del curso</span>
            <input
              type="date"
              className="app-input"
              value={draft.start_date}
              onChange={(event) => updateDraftField('start_date', event.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Fecha culminación del curso</span>
            <input
              type="date"
              className="app-input"
              value={draft.end_date}
              onChange={(event) => updateDraftField('end_date', event.target.value)}
            />
            <span className="text-xs text-primary-600">
              Al seleccionar un alumno, esta fecha se llena automáticamente con la culminación del curso.
            </span>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Fecha emision</span>
            <input
              type="date"
              className="app-input"
              value={draft.issue_date}
              onChange={(event) => updateDraftField('issue_date', event.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Ciudad</span>
            <input
              type="text"
              className="app-input"
              value={draft.city}
              onChange={(event) => updateDraftField('city', event.target.value)}
              placeholder="Lima"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-primary-900">Institucion emisora</span>
            <input
              type="text"
              className="app-input"
              value={draft.organization}
              onChange={(event) => updateDraftField('organization', event.target.value)}
              placeholder="Instituto Computron"
            />
          </label>
        </div>

        <aside className="panel-soft flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-primary-900">Acciones</h3>
            <p className="text-sm text-primary-700">
              Configura aquí los datos del certificado. Cuando abras el generador, todo se cargará automáticamente.
            </p>
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => openGenerator()}
              disabled={processingPhoto || loadingStudentDetail}
              className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Abrir generador
            </button>
            <button
              type="button"
              onClick={() => openGenerator({ autoDownload: true })}
              disabled={processingPhoto || loadingStudentDetail}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Descargar PDF
            </button>
            <button
              type="button"
              onClick={clearDraft}
              className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            >
              Limpiar campos
            </button>
          </div>
        </aside>
      </div>

      {lookupMessage ? <p className="rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800">{lookupMessage}</p> : null}
      {lookupError ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{lookupError}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    </article>
  );
}
