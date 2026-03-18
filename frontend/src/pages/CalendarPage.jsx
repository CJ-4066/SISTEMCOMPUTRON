import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import StudentCalendarPage from './StudentCalendarPage';

const VIEW_MODES = ['month', 'week', 'day'];
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const STATUS_OPTIONS = [
  { value: 'PROGRAMADA', label: 'Programada' },
  { value: 'REPROGRAMADA', label: 'Reprogramada' },
  { value: 'CANCELADA', label: 'Cancelada' },
];
const STATUS_FILTER_OPTIONS = [
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'ALL', label: 'Todos' },
  { value: 'PROGRAMADA', label: 'Programadas' },
  { value: 'REPROGRAMADA', label: 'Reprogramadas' },
  { value: 'CANCELADA', label: 'Canceladas' },
];

const CALENDAR_START_MINUTES = 7 * 60;
const CALENDAR_END_MINUTES = 22 * 60;
const PIXELS_PER_MINUTE = 0.9;
const TIMELINE_TIME_COL_WIDTH = 60;
const TIMELINE_DAY_MIN_WIDTH = 120;

const pad = (value) => String(value).padStart(2, '0');

const toIsoDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const parseIsoDate = (isoDate) => new Date(`${isoDate}T00:00:00`);

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfWeek = (date) => addDays(startOfWeek(date), 6);

const startOfMonth = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfMonth = (date) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getBaseRangeByView = (viewMode, referenceDate) => {
  const cursor = new Date(referenceDate);

  if (viewMode === 'day') {
    const dayIso = toIsoDate(cursor);
    return { from: dayIso, to: dayIso };
  }

  if (viewMode === 'week') {
    return {
      from: toIsoDate(startOfWeek(cursor)),
      to: toIsoDate(endOfWeek(cursor)),
    };
  }

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  return {
    from: toIsoDate(startOfWeek(monthStart)),
    to: toIsoDate(endOfWeek(monthEnd)),
  };
};

const isPendingStatus = (status) => status === 'PROGRAMADA' || status === 'REPROGRAMADA';

const toMinutes = (timeValue) => {
  const [h, m] = String(timeValue || '00:00')
    .split(':')
    .map((part) => Number(part));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};

const minutesToLabel = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad(h)}:${pad(m)}`;
};

const statusPillClass = (status) => {
  if (status === 'CANCELADA') return 'bg-red-100 text-red-700';
  if (status === 'REPROGRAMADA') return 'bg-amber-100 text-amber-800';
  return 'bg-primary-100 text-primary-800';
};

const eventBlockClass = (status) => {
  if (status === 'CANCELADA') return 'border-red-300 bg-red-50 text-red-700';
  if (status === 'REPROGRAMADA') return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-primary-300 bg-primary-50 text-primary-900';
};

const formatFullDate = (isoDate) =>
  parseIsoDate(isoDate).toLocaleDateString('es-PE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const formatShortDate = (isoDate) =>
  parseIsoDate(isoDate).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
  });

const emptyForm = {
  id: null,
  assignment_id: '',
  title: '',
  event_date: toIsoDate(new Date()),
  start_time: '08:00',
  end_time: '10:00',
  classroom: '',
  notes: '',
  status: 'PROGRAMADA',
};

function TeacherCalendarPage() {
  const { hasPermission, user } = useAuth();
  const canViewCalendar = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW);
  const canManageAssignments = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_MANAGE);

  const [viewMode, setViewMode] = useState('week');
  const [cursorDate, setCursorDate] = useState(toIsoDate(new Date()));
  const [events, setEvents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherFilter, setTeacherFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [assignmentFilter, setAssignmentFilter] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedTeacherId = useMemo(() => {
    if (!canManageAssignments || teacherFilter === 'ALL') return null;
    const parsed = Number(teacherFilter);
    return Number.isFinite(parsed) ? parsed : null;
  }, [canManageAssignments, teacherFilter]);

  const canEditCalendar = useMemo(() => {
    if (!canViewCalendar) return false;
    if (!canManageAssignments) return true;
    return selectedTeacherId !== null && Number(selectedTeacherId) === Number(user?.id);
  }, [canManageAssignments, canViewCalendar, selectedTeacherId, user?.id]);

  const baseRange = useMemo(() => getBaseRangeByView(viewMode, cursorDate), [viewMode, cursorDate]);

  const apiRange = useMemo(() => {
    if (viewMode === 'month') return baseRange;

    return {
      from: toIsoDate(addDays(parseIsoDate(baseRange.from), -7)),
      to: toIsoDate(addDays(parseIsoDate(baseRange.to), 21)),
    };
  }, [baseRange, viewMode]);

  const assignmentOptions = useMemo(
    () =>
      assignments.map((assignment) => ({
        id: assignment.assignment_id,
        label:
          canManageAssignments && teacherFilter === 'ALL'
            ? `${assignment.teacher_name || 'Docente'} - ${assignment.course_name} - ${assignment.campus_name} (${assignment.period_name})`
            : `${assignment.course_name} - ${assignment.campus_name} (${assignment.period_name})`,
        classroom: assignment.classroom_info || '',
      })),
    [assignments, canManageAssignments, teacherFilter],
  );

  const teacherOptions = useMemo(() => {
    const map = new Map();
    for (const item of teachers) {
      const teacherId = Number(item.teacher_user_id || 0);
      if (!teacherId || map.has(teacherId)) continue;
      map.set(teacherId, {
        id: teacherId,
        label: item.teacher_name || `Docente #${teacherId}`,
      });
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.label).localeCompare(String(b.label), 'es', { sensitivity: 'base' }),
    );
  }, [teachers]);

  const scheduleRows = useMemo(
    () =>
      assignments.filter((assignment) => {
        if (!assignment?.assignment_id) return false;
        return true;
      }),
    [assignments],
  );

  const formatEventTitle = useCallback(
    (event) => {
      if (!canManageAssignments || teacherFilter !== 'ALL') {
        return event.title;
      }
      return event.teacher_name ? `${event.teacher_name} · ${event.title}` : event.title;
    },
    [canManageAssignments, teacherFilter],
  );

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (assignmentFilter !== 'ALL' && String(event.assignment_id || '') !== String(assignmentFilter)) {
        return false;
      }

      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'PENDING') return isPendingStatus(event.status);
      return String(event.status) === statusFilter;
    });
  }, [assignmentFilter, events, statusFilter]);

  const eventsByDate = useMemo(() => {
    const grouped = {};
    for (const event of filteredEvents) {
      const key = String(event.event_date).slice(0, 10);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(event);
    }

    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    }
    return grouped;
  }, [filteredEvents]);

  const stats = useMemo(() => {
    const today = toIsoDate(new Date());

    return {
      total: filteredEvents.length,
      pending: filteredEvents.filter((event) => isPendingStatus(event.status)).length,
      pendingFuture: filteredEvents.filter(
        (event) => isPendingStatus(event.status) && String(event.event_date).slice(0, 10) >= today,
      ).length,
      canceled: filteredEvents.filter((event) => event.status === 'CANCELADA').length,
      reprogrammed: filteredEvents.filter((event) => event.status === 'REPROGRAMADA').length,
    };
  }, [filteredEvents]);

  const upcomingPendingEvents = useMemo(() => {
    const today = toIsoDate(new Date());

    return filteredEvents
      .filter(
        (event) =>
          isPendingStatus(event.status) && String(event.event_date).slice(0, 10) >= today,
      )
      .sort((a, b) => {
        const dateCompare = String(a.event_date).localeCompare(String(b.event_date));
        if (dateCompare !== 0) return dateCompare;
        return String(a.start_time).localeCompare(String(b.start_time));
      })
      .slice(0, 10);
  }, [filteredEvents]);

  const selectedDayEvents = useMemo(() => {
    return (eventsByDate[cursorDate] || []).slice().sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  }, [cursorDate, eventsByDate]);

  const monthDays = useMemo(() => {
    if (viewMode !== 'month') return [];

    const from = parseIsoDate(baseRange.from);
    const to = parseIsoDate(baseRange.to);
    const days = [];

    for (let current = new Date(from); current <= to; current = addDays(current, 1)) {
      days.push(toIsoDate(current));
    }

    return days;
  }, [baseRange, viewMode]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(parseIsoDate(cursorDate));
    const days = [];
    for (let i = 0; i < 7; i += 1) days.push(toIsoDate(addDays(start, i)));
    return days;
  }, [cursorDate]);

  const visibleDays = useMemo(() => {
    if (viewMode === 'week') return weekDays;
    return [cursorDate];
  }, [cursorDate, viewMode, weekDays]);

  const timelineHeight = (CALENDAR_END_MINUTES - CALENDAR_START_MINUTES) * PIXELS_PER_MINUTE;

  const timelineGridTemplate = useMemo(
    () => `${TIMELINE_TIME_COL_WIDTH}px repeat(${visibleDays.length}, minmax(${TIMELINE_DAY_MIN_WIDTH}px, 1fr))`,
    [visibleDays.length],
  );

  const hourMarks = useMemo(() => {
    const marks = [];
    for (let m = CALENDAR_START_MINUTES; m <= CALENDAR_END_MINUTES; m += 60) {
      marks.push(m);
    }
    return marks;
  }, []);

  const calendarRangeLabel = useMemo(() => {
    if (viewMode === 'day') return formatFullDate(cursorDate);
    if (viewMode === 'week') {
      return `${formatShortDate(weekDays[0])} - ${formatShortDate(weekDays[6])}`;
    }

    const baseDate = parseIsoDate(cursorDate);
    return baseDate.toLocaleDateString('es-PE', {
      month: 'long',
      year: 'numeric',
    });
  }, [cursorDate, viewMode, weekDays]);

  const getEventPosition = (event) => {
    const start = Math.max(toMinutes(event.start_time), CALENDAR_START_MINUTES);
    const end = Math.min(toMinutes(event.end_time), CALENDAR_END_MINUTES);
    const safeEnd = Math.max(end, start + 30);
    const top = (start - CALENDAR_START_MINUTES) * PIXELS_PER_MINUTE;
    const height = Math.max((safeEnd - start) * PIXELS_PER_MINUTE, 30);
    return { top: `${top}px`, height: `${height}px` };
  };

  const loadAssignments = useCallback(async () => {
    if (!canViewCalendar) return;

    try {
      const params = {};
      if (canManageAssignments && selectedTeacherId) {
        params.teacher_user_id = selectedTeacherId;
      }
      const response = await api.get('/teachers/my-courses', { params });
      setAssignments(response.data.items || []);
    } catch {
      setAssignments([]);
    }
  }, [canManageAssignments, canViewCalendar, selectedTeacherId]);

  const loadTeachers = useCallback(async () => {
    if (!canViewCalendar || !canManageAssignments) {
      setTeachers([]);
      return;
    }

    try {
      const response = await api.get('/teachers/assignments');
      setTeachers(response.data.items || []);
    } catch {
      setTeachers([]);
    }
  }, [canManageAssignments, canViewCalendar]);

  const loadEvents = useCallback(async () => {
    if (!canViewCalendar) {
      setEvents([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = { ...apiRange };
      if (canManageAssignments && selectedTeacherId) {
        params.teacher_user_id = selectedTeacherId;
      }
      const response = await api.get('/teachers/calendar', { params });
      setEvents(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar el calendario.');
    } finally {
      setLoading(false);
    }
  }, [apiRange, canManageAssignments, canViewCalendar, selectedTeacherId]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    setAssignmentFilter('ALL');
  }, [teacherFilter]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const moveCursor = (direction) => {
    const current = parseIsoDate(cursorDate);
    if (viewMode === 'month') {
      setCursorDate(toIsoDate(addMonths(current, direction)));
      return;
    }
    if (viewMode === 'week') {
      setCursorDate(toIsoDate(addDays(current, direction * 7)));
      return;
    }
    setCursorDate(toIsoDate(addDays(current, direction)));
  };

  const openCreateForm = (date = cursorDate) => {
    if (!canEditCalendar) return;
    if (!assignmentOptions.length) {
      setShowForm(false);
      setMessage('');
      setError('No tienes cursos/salones activos en la sede seleccionada para crear clases.');
      return;
    }

    const defaultAssignment = assignmentOptions[0];
    setForm({
      ...emptyForm,
      assignment_id: String(defaultAssignment.id),
      title: defaultAssignment.label,
      classroom: defaultAssignment.classroom || '',
      event_date: date,
    });
    setShowForm(true);
    setMessage('');
    setError('');
  };

  const openEditForm = (event) => {
    if (!canEditCalendar) return;
    setForm({
      id: event.id,
      assignment_id: event.assignment_id ? String(event.assignment_id) : '',
      title: event.title || '',
      event_date: String(event.event_date).slice(0, 10),
      start_time: event.start_time || '08:00',
      end_time: event.end_time || '10:00',
      classroom: event.classroom || '',
      notes: event.notes || '',
      status: event.status || 'PROGRAMADA',
    });
    setShowForm(true);
    setMessage('');
    setError('');
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (!canEditCalendar) return;

    setSaving(true);
    setMessage('');
    setError('');

    try {
      if (!form.assignment_id) {
        setError('Selecciona un curso/salón para vincular la clase a una sede.');
        setSaving(false);
        return;
      }

      const selectedAssignment = assignmentOptions.find((item) => String(item.id) === String(form.assignment_id));
      const payload = {
        assignment_id: Number(form.assignment_id),
        title: form.title.trim(),
        event_date: form.event_date,
        start_time: form.start_time,
        end_time: form.end_time,
        classroom: form.classroom || selectedAssignment?.classroom || null,
        notes: form.notes || null,
        status: form.status,
      };

      if (form.id) {
        await api.put(`/teachers/calendar/${form.id}`, payload);
        setMessage('Clase actualizada.');
      } else {
        await api.post('/teachers/calendar', payload);
        setMessage('Clase creada.');
      }

      setShowForm(false);
      setForm(emptyForm);
      await loadEvents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo guardar la clase.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!canEditCalendar) return;
    if (!form.id) return;
    const confirmed = window.confirm('Se eliminará esta clase del calendario. ¿Deseas continuar?');
    if (!confirmed) return;

    setSaving(true);
    setMessage('');
    setError('');

    try {
      await api.delete(`/teachers/calendar/${form.id}`);
      setShowForm(false);
      setForm(emptyForm);
      setMessage('Clase eliminada.');
      await loadEvents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo eliminar la clase.');
    } finally {
      setSaving(false);
    }
  };

  if (!canViewCalendar) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Calendario</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este módulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Calendario docente</h1>
        <p className="text-sm text-primary-700">
          Consulta clases y horarios programados por docente, con agenda detallada por hora.
        </p>
      </div>

      {canManageAssignments ? (
        <p className="rounded-xl bg-primary-50 px-3 py-2 text-sm text-primary-800">
          Modo supervisión: puedes filtrar por docente para ver sus clases y horarios programados.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <article className="module-card animate-rise xl:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Pendientes</p>
          <p className="module-stat-value">{stats.pendingFuture}</p>
          <p className="text-xs text-primary-700">Clases próximas sin cerrar.</p>
        </article>
        <article className="module-card animate-rise xl:col-span-1" style={{ animationDelay: '50ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">En rango</p>
          <p className="module-stat-value">{stats.total}</p>
          <p className="text-xs text-primary-700">Eventos visibles con filtros.</p>
        </article>
        <article className="module-card animate-rise xl:col-span-1" style={{ animationDelay: '100ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Reprogramadas</p>
          <p className="module-stat-value">{stats.reprogrammed}</p>
          <p className="text-xs text-primary-700">Clases con cambio de agenda.</p>
        </article>
        <article className="module-card animate-rise xl:col-span-1" style={{ animationDelay: '150ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Canceladas</p>
          <p className="module-stat-value">{stats.canceled}</p>
          <p className="text-xs text-primary-700">Eventos inactivos registrados.</p>
        </article>
        <article className="module-card animate-rise xl:col-span-1" style={{ animationDelay: '200ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Día seleccionado</p>
          <p className="module-stat-value">{selectedDayEvents.length}</p>
          <p className="text-xs text-primary-700">Clases en {formatShortDate(cursorDate)}.</p>
        </article>
      </div>

      <article className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => moveCursor(-1)}
              className="rounded-lg border border-primary-300 px-3 py-1 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setCursorDate(toIsoDate(new Date()))}
              className="rounded-lg border border-primary-300 px-3 py-1 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => moveCursor(1)}
              className="rounded-lg border border-primary-300 px-3 py-1 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            >
              Siguiente
            </button>
          </div>

          <p className="rounded-lg bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-800">
            {calendarRangeLabel}
          </p>

          <div className="flex flex-wrap gap-2">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                  viewMode === mode
                    ? 'bg-primary-700 text-white'
                    : 'border border-primary-300 bg-white text-primary-800 hover:bg-primary-50'
                }`}
              >
                {mode === 'month' ? 'Mes' : mode === 'week' ? 'Semana' : 'Día'}
              </button>
            ))}
          </div>
        </div>

        <div className={`grid gap-3 md:grid-cols-2 ${canManageAssignments ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
          {canManageAssignments ? (
            <select
              className="app-input"
              value={teacherFilter}
              onChange={(event) => setTeacherFilter(event.target.value)}
            >
              <option value="ALL">Todos los docentes</option>
              {teacherOptions.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  Docente: {teacher.label}
                </option>
              ))}
            </select>
          ) : null}

          <select
            className="app-input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Estado: {option.label}
              </option>
            ))}
          </select>

          <select
            className="app-input"
            value={assignmentFilter}
            onChange={(event) => setAssignmentFilter(event.target.value)}
          >
            <option value="ALL">Todos los cursos/salones</option>
            {assignmentOptions.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignment.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadEvents}
            className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
          >
            Actualizar calendario
          </button>
        </div>
      </article>

      {message ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-primary-700">Cargando calendario...</p> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {viewMode === 'month' ? (
            <article className="card max-w-full overflow-x-auto">
              <div className="min-w-[42rem] space-y-3 sm:min-w-0">
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase text-primary-600">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label}>{label}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {monthDays.map((date) => {
                    const isCurrentDay = date === toIsoDate(new Date());
                    const isCursorDay = date === cursorDate;
                    const dayEvents = eventsByDate[date] || [];

                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => {
                          setCursorDate(date);
                          openCreateForm(date);
                        }}
                        className={`min-h-[110px] rounded-xl border p-2 text-left transition sm:min-h-[130px] ${
                          isCursorDay
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-primary-100 bg-white hover:bg-primary-50'
                        }`}
                      >
                        <p className={`text-xs font-semibold ${isCurrentDay ? 'text-accent-700' : 'text-primary-700'}`}>
                          {date.slice(8, 10)}
                        </p>
                        <div className="mt-2 space-y-1">
                          {dayEvents.slice(0, 4).map((event) => (
                            <div
                              key={event.id}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                openEditForm(event);
                              }}
                              className={`cursor-pointer rounded px-2 py-1 text-[11px] font-medium ${statusPillClass(event.status)}`}
                            >
                              {event.start_time} {formatEventTitle(event)}
                            </div>
                          ))}
                          {dayEvents.length > 4 ? (
                            <p className="px-1 text-[11px] font-semibold text-primary-700">+ {dayEvents.length - 4} más</p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </article>
          ) : null}

          {viewMode !== 'month' ? (
            <article className="card max-w-full overflow-x-auto">
              <div className="w-max min-w-full">
                <div
                  className="grid border-b border-primary-100"
                  style={{ gridTemplateColumns: timelineGridTemplate }}
                >
                  <div className="p-2 text-xs font-semibold uppercase text-primary-600">Hora</div>
                  {visibleDays.map((date, index) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => {
                        setCursorDate(date);
                        if (viewMode === 'week') {
                          setViewMode('day');
                        }
                      }}
                      className={`border-l border-primary-100 p-2 text-left transition hover:bg-primary-50 ${
                        date === cursorDate ? 'bg-primary-50' : ''
                      }`}
                    >
                      <p className="text-sm font-semibold text-primary-900">
                        {viewMode === 'day' ? 'Agenda del día' : WEEKDAY_LABELS[index]}
                      </p>
                      <p className="text-xs text-primary-700">{formatFullDate(date)}</p>
                    </button>
                  ))}
                </div>

                <div
                  className="grid"
                  style={{ gridTemplateColumns: timelineGridTemplate }}
                >
                  <div className="relative border-r border-primary-100" style={{ height: `${timelineHeight}px` }}>
                    {hourMarks.map((minutes) => {
                      const top = (minutes - CALENDAR_START_MINUTES) * PIXELS_PER_MINUTE;
                      return (
                        <div
                          key={`label-${minutes}`}
                          className="absolute left-0 right-0 -translate-y-1/2 px-1 text-[11px] text-primary-600"
                          style={{ top: `${top}px` }}
                        >
                          {minutesToLabel(minutes)}
                        </div>
                      );
                    })}
                  </div>

                  {visibleDays.map((date) => (
                    <div
                      key={date}
                      className="relative border-l border-primary-100"
                      style={{ height: `${timelineHeight}px` }}
                      onDoubleClick={() => openCreateForm(date)}
                    >
                      {hourMarks.map((minutes) => {
                        const top = (minutes - CALENDAR_START_MINUTES) * PIXELS_PER_MINUTE;
                        return (
                          <div
                            key={`line-${date}-${minutes}`}
                            className="absolute left-0 right-0 border-t border-dashed border-primary-100"
                            style={{ top: `${top}px` }}
                          />
                        );
                      })}

                      {(eventsByDate[date] || []).map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => openEditForm(event)}
                          className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] shadow-sm transition hover:shadow ${eventBlockClass(event.status)}`}
                          style={getEventPosition(event)}
                        >
                          <p className="font-semibold leading-tight">{formatEventTitle(event)}</p>
                          <p className="leading-tight">{event.start_time} - {event.end_time}</p>
                          <p className="truncate leading-tight opacity-80">{event.classroom || 'Sin salón'}</p>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ) : null}
        </div>

        <aside className="space-y-4">
          <article className="card space-y-3">
            <h2 className="text-lg font-semibold text-primary-900">Clases pendientes</h2>
            <p className="text-xs text-primary-700">Próximas sesiones programadas o reprogramadas.</p>
            <div className="space-y-2">
              {upcomingPendingEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => openEditForm(event)}
                  className="w-full rounded-xl border border-primary-200 bg-white p-2 text-left hover:bg-primary-50"
                >
                  <p className="text-xs font-semibold text-primary-900">{formatEventTitle(event)}</p>
                  <p className="text-[11px] text-primary-700">
                    {formatShortDate(String(event.event_date).slice(0, 10))} | {event.start_time} - {event.end_time}
                  </p>
                  <p className="text-[11px] text-primary-600">{event.classroom || 'Sin salón'}</p>
                </button>
              ))}
              {!upcomingPendingEvents.length ? (
                <p className="text-xs text-primary-700">No hay clases pendientes próximas con los filtros actuales.</p>
              ) : null}
            </div>
          </article>

          <article className="card space-y-3">
            <h2 className="text-lg font-semibold text-primary-900">Día seleccionado</h2>
            <p className="text-xs text-primary-700">{formatFullDate(cursorDate)}</p>
            <div className="space-y-2">
              {selectedDayEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => openEditForm(event)}
                  className={`w-full rounded-lg px-2 py-2 text-left text-xs font-medium ${statusPillClass(event.status)}`}
                >
                  <p className="font-semibold">{event.start_time} - {event.end_time}</p>
                  <p>{formatEventTitle(event)}</p>
                  <p className="opacity-80">{event.classroom || 'Sin salón'}</p>
                </button>
              ))}
              {!selectedDayEvents.length ? (
                <p className="text-xs text-primary-700">Sin clases para este día.</p>
              ) : null}
            </div>
            {canEditCalendar ? (
              <button
                type="button"
                onClick={() => openCreateForm(cursorDate)}
                className="w-full rounded-lg border border-primary-300 bg-white px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-50"
              >
                + Agregar clase este día
              </button>
            ) : null}
          </article>

          <article className="card space-y-3">
            <h2 className="text-lg font-semibold text-primary-900">Horarios programados</h2>
            <p className="text-xs text-primary-700">
              {canManageAssignments && teacherFilter === 'ALL'
                ? 'Resumen de cursos/salones con horario por docente.'
                : 'Cursos/salones del docente seleccionado y su horario base.'}
            </p>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {scheduleRows.map((assignment) => (
                <div key={assignment.assignment_id} className="rounded-xl border border-primary-100 bg-white p-2">
                  <p className="text-xs font-semibold text-primary-900">
                    {canManageAssignments && teacherFilter === 'ALL' && assignment.teacher_name
                      ? `${assignment.teacher_name} · ${assignment.course_name}`
                      : assignment.course_name}
                  </p>
                  <p className="text-[11px] text-primary-700">
                    {assignment.campus_name} | {assignment.period_name}
                  </p>
                  <p className="text-[11px] text-primary-600">
                    Horario: {assignment.classroom_info || 'Sin horario programado'}
                  </p>
                </div>
              ))}
              {!scheduleRows.length ? (
                <p className="text-xs text-primary-700">No hay horarios de docentes disponibles para este filtro.</p>
              ) : null}
            </div>
          </article>
        </aside>
      </div>

      {showForm && canEditCalendar ? (
        <article className="card space-y-3">
          <h2 className="text-lg font-semibold text-primary-900">
            {form.id ? 'Editar clase del calendario' : 'Nueva clase del calendario'}
          </h2>
          <form onSubmit={submitForm} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <select
                className="app-input"
                value={form.assignment_id}
                required
                onChange={(event) => {
                  const selected = assignmentOptions.find((item) => String(item.id) === event.target.value);
                  setForm((prev) => ({
                    ...prev,
                    assignment_id: event.target.value,
                    title: selected ? selected.label : prev.title,
                    classroom: selected ? selected.classroom : prev.classroom,
                  }));
                }}
              >
                <option value="">Selecciona curso/salón</option>
                {assignmentOptions.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.label}
                  </option>
                ))}
              </select>

              <input
                className="app-input lg:col-span-2"
                placeholder="Título"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />

              <input
                type="date"
                className="app-input"
                value={form.event_date}
                onChange={(event) => setForm((prev) => ({ ...prev, event_date: event.target.value }))}
                required
              />
              <input
                type="time"
                className="app-input"
                value={form.start_time}
                onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))}
                required
              />
              <input
                type="time"
                className="app-input"
                value={form.end_time}
                onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))}
                required
              />

              <input
                className="app-input"
                placeholder="Salón / Aula"
                value={form.classroom}
                onChange={(event) => setForm((prev) => ({ ...prev, classroom: event.target.value }))}
              />
              <select
                className="app-input"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <input
                className="app-input"
                placeholder="Notas"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              {form.id ? (
                <button
                  type="button"
                  onClick={deleteEvent}
                  disabled={saving}
                  className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Eliminar
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                }}
                className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </article>
      ) : null}
    </section>
  );
}

export default function CalendarPage() {
  const { user } = useAuth();
  const isAlumnoProfile = (user?.roles || []).length === 1 && (user?.roles || []).includes('ALUMNO');

  if (isAlumnoProfile) {
    return <StudentCalendarPage />;
  }

  return <TeacherCalendarPage />;
}
