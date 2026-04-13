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

      <div className="space-y-6">
        <article className="card">
          <h2 className="text-lg font-semibold text-primary-900">Catálogo de Cursos</h2>
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

        {!loading && filteredCatalogCourses.length === 0 ? (
           <div className="py-12 text-center text-sm font-medium text-primary-700 bg-white rounded-2xl border border-dashed border-primary-200">
             No hay cursos que coincidan con los filtros actuales.
           </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredCatalogCourses.map((course) => (
              <div 
                 key={course.id} 
                 className="flex flex-col rounded-2xl border border-primary-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg hover:border-primary-300"
              >
                <div className="mb-4">
                  <h3 className="font-bold text-primary-900 text-[17px] leading-snug line-clamp-2" title={course.name}>{course.name}</h3>
                  <p className="text-xs text-primary-600/80 mt-1.5 line-clamp-3 leading-relaxed" title={course.description || 'Sin descripción'}>{course.description || 'Sin descripción'}</p>
                </div>
                
                <div className="flex items-center justify-between gap-2 text-xs text-gray-600 mb-5 bg-primary-50/50 p-2.5 rounded-xl border border-primary-100/30">
                   <div className="flex flex-col flex-1 items-center">
                      <span className="font-bold text-primary-400 uppercase tracking-wider" style={{fontSize: '9px'}}>Duración</span>
                      <span className="font-semibold text-primary-900 mt-0.5">{course.duration_hours} <span className="text-[10px] text-primary-600">hrs</span></span>
                   </div>
                   <div className="w-[1px] h-8 bg-primary-200/50"></div>
                   <div className="flex flex-col flex-1 items-center">
                      <span className="font-bold text-primary-400 uppercase tracking-wider" style={{fontSize: '9px'}}>Nota Min.</span>
                      <span className="font-semibold text-primary-900 mt-0.5">{Number(course.passing_grade).toFixed(1)}</span>
                   </div>
                   <div className="w-[1px] h-8 bg-primary-200/50"></div>
                   <div className="flex flex-col flex-1 items-center">
                      <span className="font-bold text-primary-400 uppercase tracking-wider" style={{fontSize: '9px'}}>Ofertas</span>
                      <span className="font-semibold text-primary-900 mt-0.5">{course.offerings?.length || 0}</span>
                   </div>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100">
                  <span className="text-[10px] uppercase font-bold text-gray-400 mb-2.5 block tracking-wider">Disponibilidad de Sedes</span>
                  {course.offerings?.length ? (
                    <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
                      {course.offerings.map((offering) => (
                        <div key={offering.offering_id} className="rounded-xl bg-primary-50/80 px-3 py-2.5 border border-primary-100/50 transition-colors hover:bg-primary-100/50">
                          <div className="flex justify-between items-start mb-1 gap-2">
                             <p className="font-bold text-primary-900 text-xs truncate">
                               {offering.campus_name}
                             </p>
                             <span className="inline-flex bg-white shadow-sm border border-primary-100 text-primary-800 px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0">
                               {formatCurrency(offering.monthly_fee)}
                             </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                             <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">MOD. {modalityLabels[offering.modality] || offering.modality}</span>
                             <span className="text-[10px] text-primary-600/80 truncate font-medium" title={offering.schedule_info || '-'}>{offering.schedule_info || '-'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-2 inline-flex gap-2 items-center">
                       <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                       <span className="text-xs text-gray-500 font-medium italic">Sin ofertas registradas</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
