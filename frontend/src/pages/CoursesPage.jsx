import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import TeacherCoursesPage from './TeacherCoursesPage';
import StudentCoursesPage from './StudentCoursesPage';

const modalityLabels = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  HIBRIDO: 'Hibrido',
};

const formatCurrency = (value) => `S/ ${Number(value || 0).toFixed(2)}`;

const minFee = (offerings = []) => {
  if (!offerings.length) return 0;
  return Math.min(...offerings.map((offering) => Number(offering.monthly_fee || 0)));
};

export default function CoursesPage() {
  const { user, hasPermission } = useAuth();
  const [courses, setCourses] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCampusFilter, setCatalogCampusFilter] = useState('ALL');
  const [catalogModalityFilter, setCatalogModalityFilter] = useState('ALL');
  const [catalogSort, setCatalogSort] = useState('NAME_ASC');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canViewCourses = hasPermission(PERMISSIONS.COURSES_VIEW);

  const isAdminProfile = (user?.roles || []).includes('ADMIN');
  const isDocenteProfile = (user?.roles || []).length === 1 && (user?.roles || []).includes('DOCENTE');
  const isAlumnoProfile = (user?.roles || []).length === 1 && (user?.roles || []).includes('ALUMNO');
  const canUseAdminAttendanceView =
    isAdminProfile &&
    hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW) &&
    hasPermission(PERMISSIONS.ACADEMIC_ATTENDANCE_MANAGE);

  const loadCourses = useCallback(async () => {
    if (!canViewCourses) {
      setCourses([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.get('/courses');
      setCourses(response.data?.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar los cursos.');
    } finally {
      setLoading(false);
    }
  }, [canViewCourses]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const allOfferings = useMemo(() => {
    const rows = [];
    for (const course of courses) {
      for (const offering of course.offerings || []) {
        rows.push(offering);
      }
    }
    return rows;
  }, [courses]);

  const catalogCampusOptions = useMemo(() => {
    const map = new Map();
    for (const offering of allOfferings) {
      map.set(String(offering.campus_id), offering.campus_name);
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
  }, [allOfferings]);

  const filteredCatalogCourses = useMemo(() => {
    const searchTerm = catalogSearch.trim().toLowerCase();
    const requireOfferingFilter = catalogCampusFilter !== 'ALL' || catalogModalityFilter !== 'ALL';

    const rows = [];
    for (const course of courses) {
      const originalOfferings = course.offerings || [];
      const offeringsByFilter = originalOfferings.filter((offering) => {
        if (catalogCampusFilter !== 'ALL' && String(offering.campus_id) !== String(catalogCampusFilter)) {
          return false;
        }
        if (
          catalogModalityFilter !== 'ALL' &&
          String(offering.modality || 'PRESENCIAL') !== catalogModalityFilter
        ) {
          return false;
        }
        return true;
      });

      const searchableText = [
        course.name,
        course.description,
        ...originalOfferings.map((offering) => `${offering.campus_name} ${offering.modality || ''}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (searchTerm && !searchableText.includes(searchTerm)) continue;
      if (requireOfferingFilter && offeringsByFilter.length === 0) continue;

      rows.push({
        ...course,
        offerings: requireOfferingFilter ? offeringsByFilter : originalOfferings,
      });
    }

    rows.sort((a, b) => {
      if (catalogSort === 'NAME_DESC') {
        return String(b.name || '').localeCompare(String(a.name || ''), 'es', { sensitivity: 'base' });
      }

      if (catalogSort === 'OFFERINGS_DESC') {
        return (b.offerings?.length || 0) - (a.offerings?.length || 0);
      }

      if (catalogSort === 'FEE_ASC') {
        return minFee(a.offerings) - minFee(b.offerings);
      }

      return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
    });

    return rows;
  }, [catalogCampusFilter, catalogModalityFilter, catalogSearch, catalogSort, courses]);

  if (isDocenteProfile || canUseAdminAttendanceView) {
    return <TeacherCoursesPage />;
  }

  if (isAlumnoProfile) {
    return <StudentCoursesPage />;
  }

  if (!canViewCourses) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Cursos y sedes</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para visualizar la informacion de cursos.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Cursos y sedes</h1>
          <p className="text-sm text-primary-700">Consulta integrada de cursos disponibles.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
            {courses.length} cursos
          </span>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="space-y-4">
        <article className="card">
          <h2 className="text-lg font-semibold text-primary-900">Catalogo de cursos</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              className="app-input lg:col-span-2"
              placeholder="Buscar por curso, descripcion o sede..."
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
            />

            <select
              className="app-input"
              value={catalogCampusFilter}
              onChange={(event) => setCatalogCampusFilter(event.target.value)}
            >
              <option value="ALL">Todas las sedes</option>
              {catalogCampusOptions.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>

            <select
              className="app-input"
              value={catalogModalityFilter}
              onChange={(event) => setCatalogModalityFilter(event.target.value)}
            >
              <option value="ALL">Todas las modalidades</option>
              <option value="PRESENCIAL">Presencial</option>
              <option value="VIRTUAL">Virtual</option>
              <option value="HIBRIDO">Hibrido</option>
            </select>

            <select
              className="app-input"
              value={catalogSort}
              onChange={(event) => setCatalogSort(event.target.value)}
            >
              <option value="NAME_ASC">Orden: nombre A-Z</option>
              <option value="NAME_DESC">Orden: nombre Z-A</option>
              <option value="OFFERINGS_DESC">Mas ofertas primero</option>
              <option value="FEE_ASC">Cuota mas baja primero</option>
            </select>
          </div>

          <p className="mt-3 text-xs text-primary-700">
            Mostrando <strong>{filteredCatalogCourses.length}</strong> cursos de un total de{' '}
            <strong>{courses.length}</strong>.
          </p>
        </article>

        <article className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-primary-600">
                <th className="pb-2 pr-3">Curso</th>
                <th className="pb-2 pr-3">Duracion</th>
                <th className="pb-2 pr-3">Nota minima</th>
                <th className="pb-2">Ofertas</th>
              </tr>
            </thead>
            <tbody>
              {filteredCatalogCourses.map((course) => (
                <tr key={course.id} className="border-t border-primary-100 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-medium">{course.name}</p>
                    <p className="text-xs text-primary-600">{course.description || 'Sin descripcion'}</p>
                  </td>
                  <td className="py-2 pr-3">{course.duration_hours} horas</td>
                  <td className="py-2 pr-3">{Number(course.passing_grade).toFixed(2)}</td>
                  <td className="py-2">
                    {course.offerings?.length ? (
                      <ul className="space-y-1">
                        {course.offerings.map((offering) => (
                          <li key={offering.offering_id} className="rounded-lg bg-primary-50 px-2 py-1">
                            <p>
                              {offering.campus_name} ({modalityLabels[offering.modality] || offering.modality}) -{' '}
                              {formatCurrency(offering.monthly_fee)}
                            </p>
                            <p className="text-xs text-primary-600">Horario: {offering.schedule_info || '-'}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      'Sin ofertas registradas'
                    )}
                  </td>
                </tr>
              ))}
              {!loading && filteredCatalogCourses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-primary-700">
                    No hay cursos que coincidan con los filtros actuales.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </article>
      </div>
    </section>
  );
}
