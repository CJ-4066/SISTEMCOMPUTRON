import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import CourseResourcesPanel from '../components/CourseResourcesPanel';

const STATUS_META = {
  PRESENTE: { label: 'Asistio', className: 'bg-primary-100 text-primary-800' },
  AUSENTE: { label: 'Ausente', className: 'bg-red-100 text-red-700' },
  FALTO: { label: 'Falto', className: 'bg-amber-100 text-amber-800' },
  JUSTIFICADO: { label: 'Justificado', className: 'bg-accent-100 text-accent-800' },
  TARDE: { label: 'Tarde', className: 'bg-accent-100 text-accent-800' },
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const openInNewTab = (path) => {
  if (typeof window === 'undefined') return;
  window.open(path, '_blank', 'noopener,noreferrer');
};

export default function VirtualLibraryPage() {
  const { hasPermission } = useAuth();

  const canViewAssignments = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW);
  const canManageAssignments = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_MANAGE);
  const canUploadResources = canManageAssignments;

  const [assignments, setAssignments] = useState([]);
  const [campusFilter, setCampusFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(todayIso());
  const [attendanceStudents, setAttendanceStudents] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [error, setError] = useState('');
  const [attendanceError, setAttendanceError] = useState('');

  const loadAssignments = useCallback(async () => {
    if (!canViewAssignments) {
      setAssignments([]);
      return;
    }

    setLoadingAssignments(true);
    setError('');
    try {
      const response = await api.get('/teachers/my-courses');
      setAssignments(response.data?.items || []);
    } catch (requestError) {
      setAssignments([]);
      setError(requestError.response?.data?.message || 'No se pudieron cargar los salones disponibles.');
    } finally {
      setLoadingAssignments(false);
    }
  }, [canViewAssignments]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const campusOptions = useMemo(() => {
    const campusMap = new Map();
    for (const assignment of assignments) {
      campusMap.set(String(assignment.campus_id), assignment.campus_name);
    }
    return Array.from(campusMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
  }, [assignments]);

  const courseOptions = useMemo(() => {
    const courseMap = new Map();
    for (const assignment of assignments) {
      if (campusFilter && String(assignment.campus_id) !== String(campusFilter)) continue;
      courseMap.set(String(assignment.course_id), assignment.course_name);
    }
    return Array.from(courseMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
  }, [assignments, campusFilter]);

  const assignmentOptions = useMemo(
    () =>
      assignments
        .filter((assignment) => {
          if (campusFilter && String(assignment.campus_id) !== String(campusFilter)) return false;
          if (courseFilter && String(assignment.course_id) !== String(courseFilter)) return false;
          return true;
        })
        .slice()
        .sort((a, b) => {
          const byCourse = String(a.course_name || '').localeCompare(String(b.course_name || ''), 'es', {
            sensitivity: 'base',
          });
          if (byCourse !== 0) return byCourse;
          const byCampus = String(a.campus_name || '').localeCompare(String(b.campus_name || ''), 'es', {
            sensitivity: 'base',
          });
          if (byCampus !== 0) return byCampus;
          return String(b.start_date || '').localeCompare(String(a.start_date || ''));
        }),
    [assignments, campusFilter, courseFilter],
  );

  useEffect(() => {
    if (!courseOptions.some((course) => String(course.id) === String(courseFilter))) {
      setCourseFilter('');
    }
  }, [courseFilter, courseOptions]);

  useEffect(() => {
    if (!assignmentOptions.length) {
      setSelectedAssignmentId('');
      return;
    }

    const exists = assignmentOptions.some(
      (assignment) => String(assignment.assignment_id) === String(selectedAssignmentId),
    );
    if (!exists) {
      setSelectedAssignmentId(String(assignmentOptions[0].assignment_id));
    }
  }, [assignmentOptions, selectedAssignmentId]);

  const selectedAssignment = useMemo(
    () =>
      assignmentOptions.find(
        (assignment) => String(assignment.assignment_id) === String(selectedAssignmentId),
      ) || null,
    [assignmentOptions, selectedAssignmentId],
  );

  const loadAttendance = useCallback(async (assignmentId, date) => {
    if (!assignmentId) {
      setAttendanceStudents([]);
      return;
    }

    setLoadingAttendance(true);
    setAttendanceError('');
    try {
      const response = await api.get(`/teachers/my-courses/${assignmentId}/students`, {
        params: { date },
      });
      setAttendanceStudents(response.data?.item?.students || []);
    } catch (requestError) {
      setAttendanceStudents([]);
      setAttendanceError(requestError.response?.data?.message || 'No se pudo cargar la asistencia del salon.');
    } finally {
      setLoadingAttendance(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedAssignmentId) {
      setAttendanceStudents([]);
      return;
    }
    loadAttendance(selectedAssignmentId, attendanceDate);
  }, [attendanceDate, loadAttendance, selectedAssignmentId]);

  const attendanceSummary = useMemo(() => {
    const summary = {
      PRESENTE: 0,
      AUSENTE: 0,
      FALTO: 0,
      JUSTIFICADO: 0,
      TARDE: 0,
    };

    for (const student of attendanceStudents) {
      const status = String(student.attendance_status || 'AUSENTE').toUpperCase();
      if (summary[status] !== undefined) summary[status] += 1;
    }

    return summary;
  }, [attendanceStudents]);

  if (!canViewAssignments) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold text-primary-900">Biblioteca virtual</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este modulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Biblioteca virtual</h1>
        <p className="text-sm text-primary-700">
          Filtra por sede, curso y salon para revisar archivos del aula virtual y la asistencia del grupo.
        </p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <article className="card">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm text-primary-800">
            <span className="font-medium">Sede</span>
            <select
              className="app-input"
              value={campusFilter}
              onChange={(event) => {
                setCampusFilter(event.target.value);
                setSelectedAssignmentId('');
              }}
            >
              <option value="">Todas las sedes</option>
              {campusOptions.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-primary-800">
            <span className="font-medium">Curso</span>
            <select
              className="app-input"
              value={courseFilter}
              onChange={(event) => {
                setCourseFilter(event.target.value);
                setSelectedAssignmentId('');
              }}
            >
              <option value="">Todos los cursos</option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-primary-800">
            <span className="font-medium">Salon</span>
            <select
              className="app-input"
              value={selectedAssignmentId}
              onChange={(event) => setSelectedAssignmentId(event.target.value)}
            >
              {!assignmentOptions.length ? <option value="">Sin salones disponibles</option> : null}
              {assignmentOptions.map((assignment) => (
                <option key={assignment.assignment_id} value={assignment.assignment_id}>
                  {assignment.course_name} | {assignment.campus_name} | {assignment.period_name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-primary-800">
            <span className="font-medium">Fecha de asistencia</span>
            <input
              type="date"
              className="app-input"
              value={attendanceDate}
              onChange={(event) => setAttendanceDate(event.target.value)}
            />
          </label>
        </div>

        {loadingAssignments ? <p className="mt-3 text-sm text-primary-700">Cargando salones...</p> : null}
      </article>

      {selectedAssignment ? (
        <article className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary-900">{selectedAssignment.course_name}</h2>
              <p className="text-sm text-primary-700">
                {selectedAssignment.campus_name} | {selectedAssignment.period_name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openInNewTab(`/courses/salon/${selectedAssignment.assignment_id}`)}
              className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
            >
              Abrir aula virtual
            </button>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-primary-700 md:grid-cols-2 xl:grid-cols-3">
            <p>
              <strong className="text-primary-900">Docente:</strong> {selectedAssignment.teacher_name}
            </p>
            <p>
              <strong className="text-primary-900">Modalidad:</strong> {selectedAssignment.modality || 'PRESENCIAL'}
            </p>
            <p>
              <strong className="text-primary-900">Salon/Horario:</strong>{' '}
              {selectedAssignment.classroom_info || 'Sin detalle registrado'}
            </p>
            <p>
              <strong className="text-primary-900">Inicio:</strong> {formatDate(selectedAssignment.start_date)}
            </p>
            <p>
              <strong className="text-primary-900">Fin:</strong> {formatDate(selectedAssignment.end_date)}
            </p>
            <p>
              <strong className="text-primary-900">Alumnos activos:</strong> {selectedAssignment.active_students}
            </p>
          </div>
        </article>
      ) : null}

      {selectedAssignment ? (
        <CourseResourcesPanel
          assignmentId={selectedAssignment.assignment_id}
          canUpload={canUploadResources}
          canDelete={canUploadResources}
          title="Archivos del curso"
          description="Repositorio central del aula virtual para este curso y salon."
          emptyMessage="No hay archivos registrados para este curso/salon."
        />
      ) : null}

      {selectedAssignment ? (
        <article className="card overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-primary-900">Asistencia del salon</h2>
            {loadingAttendance ? (
              <span className="text-xs text-primary-700">Cargando...</span>
            ) : (
              <button
                type="button"
                onClick={() => loadAttendance(selectedAssignment.assignment_id, attendanceDate)}
                className="rounded-lg border border-primary-300 bg-white px-3 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-50"
              >
                Actualizar
              </button>
            )}
          </div>

          {attendanceError ? (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{attendanceError}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(attendanceSummary).map(([status, count]) => (
              <span
                key={status}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  STATUS_META[status]?.className || 'bg-primary-100 text-primary-800'
                }`}
              >
                {STATUS_META[status]?.label || status}: {count}
              </span>
            ))}
          </div>

          <table className="mt-4 min-w-full text-sm">
            <thead>
              <tr className="text-left text-primary-600">
                <th className="pb-2 pr-3">Alumno</th>
                <th className="pb-2 pr-3">Documento</th>
                <th className="pb-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {attendanceStudents.map((student) => {
                const badge =
                  STATUS_META[String(student.attendance_status || 'AUSENTE').toUpperCase()] || STATUS_META.AUSENTE;
                return (
                  <tr key={student.enrollment_id} className="border-t border-primary-100">
                    <td className="py-2 pr-3 font-medium">
                      {student.last_name}, {student.first_name}
                    </td>
                    <td className="py-2 pr-3">{student.document_number}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loadingAttendance && !attendanceStudents.length ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-sm text-primary-700">
                    No hay asistencias registradas para la fecha seleccionada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </article>
      ) : null}
    </section>
  );
}
