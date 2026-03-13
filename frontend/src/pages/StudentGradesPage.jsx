import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const formatScore = (value) => Number(value || 0).toFixed(2);
const buildCourseKey = (grade) => {
  const course = String(grade.course_name || '').trim();
  const campus = String(grade.campus_name || '').trim();
  if (!course && !campus) return '';
  return `${course}||${campus}`;
};

const formatDateLabel = (value) => {
  if (!value) return '-';
  const base = String(value).slice(0, 10);
  const date = new Date(`${base}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function StudentGradesPage() {
  const [grades, setGrades] = useState([]);
  const [selectedCourseKey, setSelectedCourseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const courses = useMemo(() => {
    const map = new Map();
    for (const item of grades) {
      const key = buildCourseKey(item);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: item.campus_name ? `${item.course_name} - ${item.campus_name}` : item.course_name,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => String(a.label).localeCompare(String(b.label), 'es'));
  }, [grades]);

  const loadGrades = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/students/me/grades');
      setGrades(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar tus notas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGrades();
  }, [loadGrades]);

  useEffect(() => {
    if (!courses.length) {
      setSelectedCourseKey('');
      return;
    }

    const exists = courses.some((course) => course.key === selectedCourseKey);
    if (!exists) {
      setSelectedCourseKey(courses[0].key);
    }
  }, [courses, selectedCourseKey]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.key === selectedCourseKey) || null,
    [courses, selectedCourseKey],
  );

  const filteredGrades = useMemo(() => {
    if (!selectedCourseKey) return [];
    return grades.filter((grade) => buildCourseKey(grade) === selectedCourseKey);
  }, [grades, selectedCourseKey]);

  const stats = useMemo(() => {
    if (!filteredGrades.length) {
      return {
        count: 0,
        simpleAverage: 0,
        weightedAverage: 0,
      };
    }

    const count = filteredGrades.length;
    const sum = filteredGrades.reduce((acc, grade) => acc + Number(grade.score || 0), 0);
    const simpleAverage = sum / count;

    const weighted = filteredGrades.reduce(
      (acc, grade) => {
        const weight = Number(grade.weight || 0);
        acc.score += Number(grade.score || 0) * weight;
        acc.weight += weight;
        return acc;
      },
      { score: 0, weight: 0 },
    );

    const weightedAverage = weighted.weight > 0 ? weighted.score / weighted.weight : simpleAverage;

    return {
      count,
      simpleAverage,
      weightedAverage,
    };
  }, [filteredGrades]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Mis notas</h1>
        <p className="text-sm text-primary-700">Consulta tus evaluaciones registradas y promedios.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article className="module-card animate-rise">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Notas registradas</p>
          <p className="module-stat-value">{stats.count}</p>
          <p className="text-xs text-primary-700">Del curso seleccionado.</p>
        </article>
        <article className="module-card animate-rise" style={{ animationDelay: '60ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Promedio simple</p>
          <p className="module-stat-value">{formatScore(stats.simpleAverage)}</p>
          <p className="text-xs text-primary-700">Escala 0 a 20.</p>
        </article>
        <article className="module-card animate-rise" style={{ animationDelay: '120ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Promedio ponderado</p>
          <p className="module-stat-value">{formatScore(stats.weightedAverage)}</p>
          <p className="text-xs text-primary-700">Considera pesos de evaluación.</p>
        </article>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-primary-700">Cargando notas...</p> : null}

      <article className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-primary-900">Historial de mis notas</h2>
          <select
            className="app-input w-64"
            value={selectedCourseKey}
            onChange={(event) => setSelectedCourseKey(event.target.value)}
            disabled={!courses.length}
          >
            <option value="" disabled>
              Selecciona un curso
            </option>
            {courses.map((course) => (
              <option key={course.key} value={course.key}>
                {course.label}
              </option>
            ))}
          </select>
        </div>

        {selectedCourse ? (
          <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800">
            Mostrando notas de: {selectedCourse.label}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-primary-600">
                <th className="pb-2 pr-3">Fecha</th>
                <th className="pb-2 pr-3">Evaluación</th>
                <th className="pb-2 pr-3">Peso</th>
                <th className="pb-2">Nota</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrades.map((grade) => (
                <tr key={grade.id} className="border-t border-primary-100">
                  <td className="py-2 pr-3">{formatDateLabel(grade.assessment_date)}</td>
                  <td className="py-2 pr-3">{grade.assessment_title}</td>
                  <td className="py-2 pr-3">{formatScore(grade.weight)}%</td>
                  <td className="py-2 font-semibold">{formatScore(grade.score)}</td>
                </tr>
              ))}

              {!loading && !filteredGrades.length ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-sm text-primary-700">
                    {courses.length
                      ? 'No hay notas registradas para el curso seleccionado.'
                      : 'No tienes cursos con notas registradas.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
