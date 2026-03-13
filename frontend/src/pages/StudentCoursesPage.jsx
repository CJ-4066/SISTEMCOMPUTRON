import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const openInNewTab = (path) => {
  if (typeof window === 'undefined') return;
  window.open(path, '_blank', 'noopener,noreferrer');
};

export default function StudentCoursesPage() {
  const [assignments, setAssignments] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [error, setError] = useState('');
  const [courseSearch, setCourseSearch] = useState('');

  const loadAssignments = useCallback(async () => {
    setLoadingCourses(true);
    setError('');
    try {
      const response = await api.get('/students/me/courses');
      const items = response.data.items || [];
      setAssignments(items);

      if (!items.length) {
        setSelectedCourseId(null);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar tus cursos matriculados.');
    } finally {
      setLoadingCourses(false);
    }
  }, []);

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

  const selectedCourse = useMemo(
    () => courses.find((course) => Number(course.id) === Number(selectedCourseId)) || null,
    [courses, selectedCourseId],
  );

  const stats = useMemo(
    () => ({
      totalCourses: courses.length,
      totalAssignments: assignments.length,
    }),
    [assignments.length, courses.length],
  );

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Mis cursos</h1>
        <p className="text-sm text-primary-700">
          Revisa tus cursos, horarios y abre el salón para ver asistencia y participar en el foro.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/my-grades"
          className="rounded-full border border-primary-300 bg-white px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-50"
        >
          Ver mis notas
        </Link>
        <Link
          to="/calendar"
          className="rounded-full border border-primary-300 bg-white px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-50"
        >
          Ver mi calendario
        </Link>
        <Link
          to="/payments"
          className="rounded-full border border-primary-300 bg-white px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-50"
        >
          Ver mis pagos
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
        <article className="module-card animate-rise">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Cursos matriculados</p>
          <p className="module-stat-value">{stats.totalCourses}</p>
          <p className="text-xs text-primary-700">Cursos activos en tu perfil.</p>
        </article>
        <article className="module-card animate-rise" style={{ animationDelay: '60ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Salones vinculados</p>
          <p className="module-stat-value">{stats.totalAssignments}</p>
          <p className="text-xs text-primary-700">Con horario y docente asignado.</p>
        </article>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

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
            const isSelected = Number(selectedCourseId) === Number(course.id);
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => setSelectedCourseId(course.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 shadow-soft'
                    : 'border-primary-200 bg-white hover:border-primary-300 hover:bg-primary-50/40'
                }`}
              >
                <p className="text-base font-semibold text-primary-900">{course.name}</p>
                <p className="mt-1 text-xs text-primary-700">{course.assignments.length} salón(es)</p>
              </button>
            );
          })}

          {!loadingCourses && filteredCourses.length === 0 ? (
            <p className="text-sm text-primary-700">No hay cursos que coincidan con la búsqueda.</p>
          ) : null}
        </div>
      </article>

      {selectedCourse ? (
        <article className="card">
          <h2 className="text-lg font-semibold text-primary-900">2) Selecciona el salón</h2>
          <p className="mt-1 text-xs text-primary-700">
            Al hacer click se abrirá el salón en una pestaña nueva para revisar foro y asistencia.
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {selectedCourse.assignments.map((assignment) => (
              <button
                key={`${assignment.enrollment_id}-${assignment.assignment_id || 'sin-asignacion'}`}
                type="button"
                disabled={!assignment.assignment_id}
                onClick={() => openInNewTab(`/courses/salon/${assignment.assignment_id}`)}
                className="rounded-xl border border-primary-200 bg-white p-3 text-left transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-primary-900">
                  {assignment.campus_name} ({assignment.modality || 'PRESENCIAL'})
                </p>
                <p className="text-xs text-primary-700">
                  Horario: {assignment.schedule_info || 'Sin horario registrado'}
                </p>
                <p className="text-xs text-primary-700">Periodo: {assignment.period_name}</p>
                <p className="text-xs text-primary-700">
                  Docente: {assignment.teacher_name || 'Por asignar'}
                </p>
                <span className="mt-2 inline-flex rounded-full bg-primary-100 px-2.5 py-1 text-[11px] font-semibold text-primary-800">
                  {assignment.assignment_id ? 'Abrir salón' : 'Salón pendiente'}
                </span>
              </button>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
