import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';

const STATUS_OPTIONS = [
  { value: 'PRESENTE', label: 'ASISTIO' },
  { value: 'AUSENTE', label: 'AUSENTE' },
  { value: 'FALTO', label: 'FALTO' },
  { value: 'JUSTIFICADO', label: 'JUSTIFICADO' },
];

const STATUS_META = {
  PRESENTE: { label: 'Asistio', className: 'bg-primary-100 text-primary-800' },
  AUSENTE: { label: 'Ausente', className: 'bg-red-100 text-red-700' },
  FALTO: { label: 'Falto', className: 'bg-amber-100 text-amber-800' },
  JUSTIFICADO: { label: 'Justificado', className: 'bg-accent-100 text-accent-800' },
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const openInNewTab = (path) => {
  if (typeof window === 'undefined') return;
  window.open(path, '_blank', 'noopener,noreferrer');
};

const SearchIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const CloseIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export default function TeacherCoursesPage() {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [assignments, setAssignments] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [error, setError] = useState('');
  const [courseSearch, setCourseSearch] = useState('');

  const [attendanceDate, setAttendanceDate] = useState(todayIso());
  const [attendanceCampusFilter, setAttendanceCampusFilter] = useState('ALL');
  const [selectedAttendanceAssignmentId, setSelectedAttendanceAssignmentId] = useState('');
  const [attendanceStudents, setAttendanceStudents] = useState([]);
  const [attendanceStatusByEnrollment, setAttendanceStatusByEnrollment] = useState({});
  const [loadingAttendanceStudents, setLoadingAttendanceStudents] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState('');
  const [attendanceError, setAttendanceError] = useState('');
  const [attendanceSearchOpen, setAttendanceSearchOpen] = useState(false);
  const [attendanceStudentSearch, setAttendanceStudentSearch] = useState('');

  const canViewAssignments = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW);
  const canManageAttendance = hasPermission(PERMISSIONS.ACADEMIC_ATTENDANCE_MANAGE);
  const canManageAssignments = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_MANAGE);

  const canUseAttendanceTab = canViewAssignments && canManageAttendance;
  const initialTab =
    searchParams.get('tab') === 'attendance' && canUseAttendanceTab ? 'attendance' : 'courses';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (!canManageAssignments) return;

    if (attendanceCampusFilter === 'ALL') {
      setAttendanceCampusFilter('');
    }
  }, [attendanceCampusFilter, canManageAssignments]);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');

    if (requestedTab === 'attendance') {
      if (!canUseAttendanceTab) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('tab');
        setSearchParams(nextParams, { replace: true });
        setActiveTab('courses');
        return;
      }

      setActiveTab('attendance');
      return;
    }

    if (requestedTab) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('tab');
      setSearchParams(nextParams, { replace: true });
    }

    setActiveTab('courses');
  }, [canUseAttendanceTab, searchParams, setSearchParams]);

  const changeTab = (nextTab) => {
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'attendance') {
      nextParams.set('tab', 'attendance');
    } else {
      nextParams.delete('tab');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const loadAssignments = useCallback(async () => {
    if (!canViewAssignments) {
      setAssignments([]);
      return;
    }

    setLoadingCourses(true);
    setError('');
    try {
      const response = await api.get('/teachers/my-courses');
      const items = response.data.items || [];
      setAssignments(items);

      if (!items.length) {
        setSelectedCourseId(null);
        setSelectedAttendanceAssignmentId('');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar tus cursos asignados.');
    } finally {
      setLoadingCourses(false);
    }
  }, [canViewAssignments]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const courses = useMemo(() => {
    const map = new Map();

    for (const assignment of assignments) {
      const courseId = Number(assignment.course_id);
      if (!map.has(courseId)) {
        map.set(courseId, {
          id: courseId,
          name: assignment.course_name,
          assignments: [],
        });
      }
      map.get(courseId).assignments.push(assignment);
    }

    return Array.from(map.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }),
    );
  }, [assignments]);

  const filteredCourses = useMemo(() => {
    const searchTerm = courseSearch.trim().toLowerCase();

    return courses.filter((course) => {
      if (!searchTerm) return true;
      return String(course.name || '').toLowerCase().includes(searchTerm);
    });
  }, [courseSearch, courses]);

  const campusSummary = useMemo(() => {
    const grouped = new Map();

    for (const assignment of assignments) {
      const campusName = String(assignment.campus_name || 'Sin sede').trim() || 'Sin sede';
      if (!grouped.has(campusName)) {
        grouped.set(campusName, {
          campus_name: campusName,
          total_assignments: 0,
          total_students: 0,
          modalities: {},
        });
      }

      const current = grouped.get(campusName);
      current.total_assignments += 1;
      current.total_students += Number(assignment.active_students || 0);
      current.modalities[String(assignment.modality || 'PRESENCIAL')] = true;
    }

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        modalities_label: Object.keys(item.modalities).join(', ') || '-',
      }))
      .sort((a, b) =>
        String(a.campus_name || '').localeCompare(String(b.campus_name || ''), 'es', {
          sensitivity: 'base',
        }),
      );
  }, [assignments]);

  const dashboardSummary = useMemo(
    () => ({
      totalCourses: courses.length,
      totalAssignments: assignments.length,
      totalCampuses: campusSummary.length,
    }),
    [assignments.length, campusSummary.length, courses.length],
  );

  const selectedCourse = useMemo(
    () => courses.find((course) => Number(course.id) === Number(selectedCourseId)) || null,
    [courses, selectedCourseId],
  );

  const handleSelectCourse = (courseId) => {
    setSelectedCourseId(courseId);
    setError('');
  };

  const handleOpenAssignment = (assignmentId) => {
    openInNewTab(`/courses/salon/${assignmentId}`);
  };

  const attendanceCampusOptions = useMemo(() => {
    const campusMap = new Map();
    for (const assignment of assignments) {
      campusMap.set(String(assignment.campus_id), assignment.campus_name);
    }
    return Array.from(campusMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
  }, [assignments]);

  const attendanceAssignmentOptions = useMemo(() => {
    if (canManageAssignments && !attendanceCampusFilter) {
      return [];
    }

    return assignments
      .filter((assignment) => {
        if (canManageAssignments) {
          return String(assignment.campus_id) === String(attendanceCampusFilter);
        }

        if (attendanceCampusFilter !== 'ALL' && String(assignment.campus_id) !== String(attendanceCampusFilter)) {
          return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => {
        const byCampus = String(a.campus_name || '').localeCompare(String(b.campus_name || ''), 'es', {
          sensitivity: 'base',
        });
        if (byCampus !== 0) return byCampus;
        const byCourse = String(a.course_name || '').localeCompare(String(b.course_name || ''), 'es', {
          sensitivity: 'base',
        });
        if (byCourse !== 0) return byCourse;
        return String(a.period_name || '').localeCompare(String(b.period_name || ''), 'es', {
          sensitivity: 'base',
        });
      });
  }, [assignments, attendanceCampusFilter, canManageAssignments]);

  useEffect(() => {
    if (!attendanceAssignmentOptions.length) {
      setSelectedAttendanceAssignmentId('');
      return;
    }

    const exists = attendanceAssignmentOptions.some(
      (assignment) => String(assignment.assignment_id) === String(selectedAttendanceAssignmentId),
    );

    if (!exists) {
      setSelectedAttendanceAssignmentId(String(attendanceAssignmentOptions[0].assignment_id));
    }
  }, [attendanceAssignmentOptions, selectedAttendanceAssignmentId]);

  const selectedAttendanceAssignment = useMemo(
    () =>
      attendanceAssignmentOptions.find(
        (assignment) => String(assignment.assignment_id) === String(selectedAttendanceAssignmentId),
      ) || null,
    [attendanceAssignmentOptions, selectedAttendanceAssignmentId],
  );

  const loadAttendanceStudents = useCallback(async (assignmentId, date) => {
    if (!assignmentId) {
      setAttendanceStudents([]);
      setAttendanceStatusByEnrollment({});
      return;
    }

    setLoadingAttendanceStudents(true);
    setAttendanceError('');
    try {
      const response = await api.get(`/teachers/my-courses/${assignmentId}/students`, {
        params: { date },
      });

      const students = response.data?.item?.students || [];
      setAttendanceStudents(students);
      setAttendanceStatusByEnrollment(
        students.reduce((acc, student) => {
          acc[student.enrollment_id] = student.attendance_status || 'AUSENTE';
          return acc;
        }, {}),
      );
      setAttendanceStudentSearch('');
    } catch (requestError) {
      setAttendanceStudents([]);
      setAttendanceStatusByEnrollment({});
      setAttendanceError(requestError.response?.data?.message || 'No se pudo cargar la lista de asistencia.');
    } finally {
      setLoadingAttendanceStudents(false);
    }
  }, []);

  useEffect(() => {
    if (!canUseAttendanceTab || activeTab !== 'attendance') return;
    if (!selectedAttendanceAssignmentId) {
      setAttendanceStudents([]);
      setAttendanceStatusByEnrollment({});
      return;
    }

    loadAttendanceStudents(selectedAttendanceAssignmentId, attendanceDate);
  }, [
    activeTab,
    attendanceDate,
    canUseAttendanceTab,
    loadAttendanceStudents,
    selectedAttendanceAssignmentId,
  ]);

  const handleAttendanceStatusChange = (enrollmentId, status) => {
    setAttendanceStatusByEnrollment((prev) => ({
      ...prev,
      [enrollmentId]: status,
    }));
  };

  const applyAttendanceStatusToVisible = (status) => {
    if (!canManageAttendance || !attendanceStudents.length) return;

    const targetStudents = filteredAttendanceStudents.length
      ? filteredAttendanceStudents
      : attendanceStudents;

    setAttendanceStatusByEnrollment((prev) => {
      const next = { ...prev };
      for (const student of targetStudents) {
        next[student.enrollment_id] = status;
      }
      return next;
    });
    setAttendanceMessage('');
    setAttendanceError('');
  };

  const filteredAttendanceStudents = useMemo(() => {
    const term = attendanceStudentSearch.trim().toLowerCase();
    if (!term) return attendanceStudents;

    return attendanceStudents.filter((student) => {
      const fullName = `${student.last_name || ''} ${student.first_name || ''}`.trim().toLowerCase();
      const reverseName = `${student.first_name || ''} ${student.last_name || ''}`.trim().toLowerCase();
      const document = String(student.document_number || '').toLowerCase();
      return fullName.includes(term) || reverseName.includes(term) || document.includes(term);
    });
  }, [attendanceStudentSearch, attendanceStudents]);

  const attendanceSummary = useMemo(() => {
    const summary = {
      PRESENTE: 0,
      AUSENTE: 0,
      FALTO: 0,
      JUSTIFICADO: 0,
    };

    for (const student of attendanceStudents) {
      const status = attendanceStatusByEnrollment[student.enrollment_id] || 'AUSENTE';
      if (summary[status] !== undefined) summary[status] += 1;
    }

    return summary;
  }, [attendanceStatusByEnrollment, attendanceStudents]);

  const attendanceTotal = useMemo(
    () => Object.values(attendanceSummary).reduce((sum, value) => sum + value, 0),
    [attendanceSummary],
  );

  const saveAttendance = async () => {
    if (!canManageAttendance || !selectedAttendanceAssignmentId || !attendanceStudents.length) return;
    if (canManageAssignments && !attendanceCampusFilter) {
      setAttendanceError('Selecciona sede antes de guardar asistencia.');
      return;
    }

    setSavingAttendance(true);
    setAttendanceMessage('');
    setAttendanceError('');
    try {
      await api.post(`/teachers/my-courses/${selectedAttendanceAssignmentId}/attendance`, {
        attendance_date: attendanceDate,
        attendances: attendanceStudents.map((student) => ({
          enrollment_id: Number(student.enrollment_id),
          status: attendanceStatusByEnrollment[student.enrollment_id] || 'AUSENTE',
        })),
      });

      setAttendanceMessage('Asistencia guardada correctamente.');
      await loadAttendanceStudents(selectedAttendanceAssignmentId, attendanceDate);
    } catch (requestError) {
      setAttendanceError(requestError.response?.data?.message || 'No se pudo guardar la asistencia.');
    } finally {
      setSavingAttendance(false);
    }
  };

  if (!canViewAssignments) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Cursos y sedes</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este modulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">
          {activeTab === 'attendance' ? 'Asistencias' : 'Cursos y sedes'}
        </h1>
        <p className="text-sm text-primary-700">
          {activeTab === 'attendance'
            ? 'Registra asistencia diaria por sede y salón, valida la lista de alumnos y guarda cambios en un solo flujo.'
            : 'Revisa tus cursos y sedes vinculadas para abrir cada salón y consultar su detalle.'}
        </p>
      </div>

      <div className="page-tabs">
        <button
          type="button"
          onClick={() => changeTab('courses')}
          className={`page-tab ${activeTab === 'courses' ? 'page-tab-active' : ''}`}
        >
          Cursos y sedes
        </button>
        {canUseAttendanceTab ? (
          <button
            type="button"
            onClick={() => changeTab('attendance')}
            className={`page-tab ${activeTab === 'attendance' ? 'page-tab-active' : ''}`}
          >
            Asistencias
          </button>
        ) : null}
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {activeTab === 'courses' ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article className="module-card animate-rise">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Cursos asignados</p>
              <p className="module-stat-value">{dashboardSummary.totalCourses}</p>
              <p className="text-xs text-primary-700">Cursos bajo tu responsabilidad.</p>
            </article>
            <article className="module-card animate-rise" style={{ animationDelay: '60ms' }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Salones activos</p>
              <p className="module-stat-value">{dashboardSummary.totalAssignments}</p>
              <p className="text-xs text-primary-700">Listos para abrir en una pestana nueva.</p>
            </article>
            <article className="module-card animate-rise" style={{ animationDelay: '120ms' }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Sedes vinculadas</p>
              <p className="module-stat-value">{dashboardSummary.totalCampuses}</p>
              <p className="text-xs text-primary-700">Sedes donde tienes salones asignados.</p>
            </article>
          </div>

          <article className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-primary-900">1) Selecciona un curso</h2>
              <input
                className="app-input w-72"
                placeholder="Buscar curso..."
                value={courseSearch}
                onChange={(event) => setCourseSearch(event.target.value)}
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredCourses.map((course) => {
                const courseStudents = course.assignments.reduce(
                  (sum, assignment) => sum + Number(assignment.active_students || 0),
                  0,
                );
                const isSelected = Number(selectedCourseId) === Number(course.id);

                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => handleSelectCourse(course.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50 shadow-soft'
                        : 'border-primary-200 bg-white hover:border-primary-300 hover:bg-primary-50/40'
                    }`}
                  >
                    <p className="text-base font-semibold text-primary-900">{course.name}</p>
                    <p className="mt-1 text-xs text-primary-700">
                      {course.assignments.length} salon(es) | {courseStudents} alumno(s)
                    </p>
                  </button>
                );
              })}

              {!loadingCourses && filteredCourses.length === 0 ? (
                <p className="text-sm text-primary-700">No hay cursos que coincidan con los filtros.</p>
              ) : null}
            </div>
          </article>

          <article className="card overflow-x-auto">
            <h2 className="text-lg font-semibold text-primary-900">2) Sedes vinculadas</h2>
            <table className="mt-3 min-w-full text-sm">
              <thead>
                <tr className="text-left text-primary-600">
                  <th className="pb-2 pr-3">Sede</th>
                  <th className="pb-2 pr-3">Salones</th>
                  <th className="pb-2 pr-3">Alumnos activos</th>
                  <th className="pb-2">Modalidades</th>
                </tr>
              </thead>
              <tbody>
                {campusSummary.map((item) => (
                  <tr key={item.campus_name} className="border-t border-primary-100">
                    <td className="py-2 pr-3 font-medium">{item.campus_name}</td>
                    <td className="py-2 pr-3">{item.total_assignments}</td>
                    <td className="py-2 pr-3">{item.total_students}</td>
                    <td className="py-2">{item.modalities_label}</td>
                  </tr>
                ))}

                {!loadingCourses && campusSummary.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-sm text-primary-600">
                      No hay sedes disponibles para tus asignaciones actuales.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          {selectedCourse ? (
            <article className="card">
              <h2 className="text-lg font-semibold text-primary-900">3) Selecciona el salon</h2>
              <p className="mt-1 text-xs text-primary-700">Al hacer click se abrira el detalle del salon en una pestana nueva.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {selectedCourse.assignments.map((assignment) => (
                  <button
                    key={assignment.assignment_id}
                    type="button"
                    onClick={() => handleOpenAssignment(assignment.assignment_id)}
                    className="rounded-xl border border-primary-200 bg-white p-3 text-left transition hover:bg-primary-50"
                  >
                    <p className="text-sm font-semibold text-primary-900">
                      {assignment.campus_name} ({assignment.modality || 'PRESENCIAL'})
                    </p>
                    <p className="text-xs text-primary-700">
                      Salon/Horario: {assignment.classroom_info || 'Sin detalle registrado'}
                    </p>
                    <p className="text-xs text-primary-700">
                      Periodo: {assignment.period_name} | Alumnos activos: {assignment.active_students}
                    </p>
                    <span className="mt-2 inline-flex rounded-full bg-primary-100 px-2.5 py-1 text-[11px] font-semibold text-primary-800">
                      Abrir salon
                    </span>
                  </button>
                ))}
              </div>
            </article>
          ) : null}
        </>
      ) : null}

      {activeTab === 'attendance' && canUseAttendanceTab ? (
        <>
          {attendanceMessage ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{attendanceMessage}</p> : null}
          {attendanceError ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{attendanceError}</p> : null}

          <article className="card">
            <h2 className="text-lg font-semibold text-primary-900">Registro de asistencias</h2>
            <p className="mt-1 text-xs text-primary-700">
              {canManageAssignments
                ? 'Selecciona sede y salón, define la fecha y marca la asistencia de cada alumno.'
                : 'Selecciona salón, define la fecha y marca la asistencia de cada alumno.'}
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {canManageAssignments ? (
                <label className="space-y-1 text-sm text-primary-800">
                  <span className="font-medium">Sede</span>
                  <select
                    className="app-input"
                    value={attendanceCampusFilter}
                    onChange={(event) => {
                      setAttendanceCampusFilter(event.target.value);
                      setSelectedAttendanceAssignmentId('');
                      setAttendanceMessage('');
                      setAttendanceError('');
                    }}
                  >
                    <option value="">Seleccionar sede</option>
                    {attendanceCampusOptions.map((campus) => (
                      <option key={campus.id} value={campus.id}>
                        {campus.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Salón</span>
                <select
                  className="app-input"
                  value={selectedAttendanceAssignmentId}
                  onChange={(event) => {
                    setSelectedAttendanceAssignmentId(event.target.value);
                    setAttendanceMessage('');
                    setAttendanceError('');
                  }}
                >
                  {!attendanceAssignmentOptions.length ? <option value="">Sin salones disponibles</option> : null}
                  {attendanceAssignmentOptions.map((assignment) => (
                    <option key={assignment.assignment_id} value={assignment.assignment_id}>
                      {assignment.course_name} | {assignment.campus_name} | {assignment.period_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Fecha</span>
                <input
                  type="date"
                  className="app-input"
                  value={attendanceDate}
                  onChange={(event) => {
                    setAttendanceDate(event.target.value);
                    setAttendanceMessage('');
                    setAttendanceError('');
                  }}
                />
              </label>
            </div>

          </article>

          {selectedAttendanceAssignment ? (
            <article className="card">
              <h3 className="text-base font-semibold text-primary-900">Detalle del salón seleccionado</h3>
              <div className="mt-2 grid gap-2 text-sm text-primary-700 md:grid-cols-2">
                <p>
                  <strong className="text-primary-900">Curso:</strong> {selectedAttendanceAssignment.course_name}
                </p>
                <p>
                  <strong className="text-primary-900">Sede:</strong> {selectedAttendanceAssignment.campus_name}
                </p>
                <p>
                  <strong className="text-primary-900">Periodo:</strong> {selectedAttendanceAssignment.period_name}
                </p>
                <p>
                  <strong className="text-primary-900">Docente:</strong> {selectedAttendanceAssignment.teacher_name}
                </p>
              </div>
            </article>
          ) : null}

          <article className="card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-primary-900">Lista de alumnos</h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  {attendanceSearchOpen ? (
                    <div className="absolute right-0 top-0 z-10 flex items-center gap-1 rounded-full border border-primary-200 bg-white px-2 py-1 shadow-soft">
                      <SearchIcon className="h-4 w-4 text-primary-600" />
                      <input
                        className="w-36 bg-transparent text-xs text-primary-800 outline-none"
                        value={attendanceStudentSearch}
                        onChange={(event) => setAttendanceStudentSearch(event.target.value)}
                        placeholder="Buscar alumno"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAttendanceStudentSearch('');
                          setAttendanceSearchOpen(false);
                        }}
                        className="rounded-full p-1 text-primary-600 hover:bg-primary-100"
                        aria-label="Cerrar buscador"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAttendanceSearchOpen(true)}
                      className="rounded-full border border-primary-200 bg-white p-2 text-primary-700 hover:bg-primary-50"
                      aria-label="Buscar alumno"
                      title="Buscar alumno"
                    >
                      <SearchIcon />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => applyAttendanceStatusToVisible('PRESENTE')}
                  disabled={!canManageAttendance || savingAttendance || loadingAttendanceStudents || !attendanceStudents.length}
                  className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Visibles: Asistió
                </button>
                <button
                  type="button"
                  onClick={() => applyAttendanceStatusToVisible('AUSENTE')}
                  disabled={!canManageAttendance || savingAttendance || loadingAttendanceStudents || !attendanceStudents.length}
                  className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Visibles: Ausente
                </button>
                <button
                  type="button"
                  onClick={() => applyAttendanceStatusToVisible('JUSTIFICADO')}
                  disabled={!canManageAttendance || savingAttendance || loadingAttendanceStudents || !attendanceStudents.length}
                  className="rounded-lg border border-accent-300 bg-white px-3 py-2 text-xs font-semibold text-accent-800 hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Visibles: Justificado
                </button>

                <button
                  type="button"
                  onClick={saveAttendance}
                  disabled={
                    !selectedAttendanceAssignmentId ||
                    (canManageAssignments && !attendanceCampusFilter) ||
                    !attendanceStudents.length ||
                    loadingAttendanceStudents ||
                    savingAttendance
                  }
                  className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingAttendance ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>

            {loadingAttendanceStudents ? <p className="mt-2 text-sm text-primary-700">Cargando alumnos...</p> : null}

            {!loadingAttendanceStudents && attendanceStudents.length ? (
              <>
                <div className="mt-3 mb-4 flex flex-wrap gap-2">
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
                  <span className="rounded-full bg-primary-900 px-3 py-1 text-xs font-semibold text-white">
                    Total: {attendanceTotal}
                  </span>
                </div>

                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-primary-600">
                      <th className="pb-2 pr-3">Alumno</th>
                      <th className="pb-2 pr-3">Documento</th>
                      <th className="pb-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendanceStudents.map((student) => {
                      const currentStatus = attendanceStatusByEnrollment[student.enrollment_id] || 'AUSENTE';
                      const statusStyle = STATUS_META[currentStatus]?.className || 'bg-primary-100 text-primary-800';

                      return (
                        <tr key={student.enrollment_id} className="border-t border-primary-100">
                          <td className="py-2 pr-3 font-medium">
                            {student.last_name}, {student.first_name}
                          </td>
                          <td className="py-2 pr-3">{student.document_number}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <select
                                className="app-input min-w-44"
                                value={currentStatus}
                                onChange={(event) =>
                                  handleAttendanceStatusChange(student.enrollment_id, event.target.value)
                                }
                                disabled={savingAttendance}
                              >
                                {STATUS_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusStyle}`}>
                                {STATUS_META[currentStatus]?.label || currentStatus}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {attendanceStudents.length > 0 && filteredAttendanceStudents.length === 0 ? (
                  <p className="mt-3 text-sm text-primary-700">Sin coincidencias para la búsqueda actual.</p>
                ) : null}
              </>
            ) : null}

            {!loadingAttendanceStudents && !attendanceStudents.length ? (
              <p className="mt-3 text-sm text-primary-700">
                Selecciona sede y salón para visualizar la asistencia.
              </p>
            ) : null}
          </article>
        </>
      ) : null}
    </section>
  );
}
