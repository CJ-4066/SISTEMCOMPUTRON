import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const VIEW_MODES = ['month', 'week', 'day'];
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const CALENDAR_START_MINUTES = 7 * 60;
const CALENDAR_END_MINUTES = 22 * 60;
const PIXELS_PER_MINUTE = 0.9;
const WEEK_TIME_COL_WIDTH = 60;
const WEEK_DAY_MIN_WIDTH = 120;

const pad = (value) => String(value).padStart(2, '0');

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

export default function StudentCalendarPage() {
  const [viewMode, setViewMode] = useState('week');
  const [cursorDate, setCursorDate] = useState(toIsoDate(new Date()));
  const [events, setEvents] = useState([]);
  const [assignmentFilter, setAssignmentFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const baseRange = useMemo(() => getBaseRangeByView(viewMode, cursorDate), [viewMode, cursorDate]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/students/me/calendar', {
        params: {
          from: baseRange.from,
          to: baseRange.to,
        },
      });
      setEvents(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar tu calendario.');
    } finally {
      setLoading(false);
    }
  }, [baseRange.from, baseRange.to]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const assignmentOptions = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      const key = String(event.assignment_id || '');
      if (!key) continue;
      if (map.has(key)) continue;
      map.set(key, {
        id: event.assignment_id,
        label: `${event.course_name} - ${event.campus_name}`,
      });
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.label || '').localeCompare(String(b.label || ''), 'es', { sensitivity: 'base' }),
    );
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (assignmentFilter === 'ALL') return true;
      return String(event.assignment_id || '') === String(assignmentFilter);
    });
  }, [assignmentFilter, events]);

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

  const weekDays = useMemo(() => {
    const start = startOfWeek(parseIsoDate(cursorDate));
    const days = [];
    for (let i = 0; i < 7; i += 1) days.push(toIsoDate(addDays(start, i)));
    return days;
  }, [cursorDate]);

  const monthDays = useMemo(() => {
    if (viewMode !== 'month') return [];
    const from = parseIsoDate(baseRange.from);
    const to = parseIsoDate(baseRange.to);
    const days = [];
    for (let current = new Date(from); current <= to; current = addDays(current, 1)) {
      days.push(toIsoDate(current));
    }
    return days;
  }, [baseRange.from, baseRange.to, viewMode]);

  const selectedDayEvents = useMemo(
    () => (eventsByDate[cursorDate] || []).slice().sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
    [cursorDate, eventsByDate],
  );

  const visibleEvents = useMemo(() => {
    if (viewMode !== 'week') {
      return selectedDayEvents;
    }

    const weekStart = weekDays[0];
    const weekEnd = weekDays[6];
    return filteredEvents
      .filter((event) => {
        const eventDate = String(event.event_date).slice(0, 10);
        return eventDate >= weekStart && eventDate <= weekEnd;
      })
      .sort((a, b) => {
        const byDate = String(a.event_date).localeCompare(String(b.event_date));
        if (byDate !== 0) return byDate;
        return String(a.start_time).localeCompare(String(b.start_time));
      });
  }, [filteredEvents, selectedDayEvents, viewMode, weekDays]);

  const timelineHeight = (CALENDAR_END_MINUTES - CALENDAR_START_MINUTES) * PIXELS_PER_MINUTE;

  const hourMarks = useMemo(() => {
    const marks = [];
    for (let m = CALENDAR_START_MINUTES; m <= CALENDAR_END_MINUTES; m += 60) {
      marks.push(m);
    }
    return marks;
  }, []);

  const getEventPosition = (event) => {
    const start = Math.max(toMinutes(event.start_time), CALENDAR_START_MINUTES);
    const end = Math.min(toMinutes(event.end_time), CALENDAR_END_MINUTES);
    const safeEnd = end > start ? end : start + 30;
    const top = (start - CALENDAR_START_MINUTES) * PIXELS_PER_MINUTE;
    const height = Math.max((safeEnd - start) * PIXELS_PER_MINUTE, 30);
    return { top: `${top}px`, height: `${height}px` };
  };

  const weekGridTemplate = useMemo(
    () => `${WEEK_TIME_COL_WIDTH}px repeat(${weekDays.length}, minmax(${WEEK_DAY_MIN_WIDTH}px, 1fr))`,
    [weekDays.length],
  );

  const upcoming = useMemo(() => {
    const today = toIsoDate(new Date());
    return filteredEvents
      .filter((event) => String(event.event_date).slice(0, 10) >= today && event.status !== 'CANCELADA')
      .sort((a, b) => {
        const byDate = String(a.event_date).localeCompare(String(b.event_date));
        if (byDate !== 0) return byDate;
        return String(a.start_time).localeCompare(String(b.start_time));
      })
      .slice(0, 12);
  }, [filteredEvents]);

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

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Mi calendario</h1>
        <p className="text-sm text-primary-700">Agenda de clases programadas por tus docentes.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article className="module-card animate-rise">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Eventos en rango</p>
          <p className="module-stat-value">{filteredEvents.length}</p>
          <p className="text-xs text-primary-700">Con el filtro actual.</p>
        </article>
        <article className="module-card animate-rise" style={{ animationDelay: '60ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Próximas clases</p>
          <p className="module-stat-value">{upcoming.length}</p>
          <p className="text-xs text-primary-700">No canceladas.</p>
        </article>
        <article className="module-card animate-rise" style={{ animationDelay: '120ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
            {viewMode === 'week' ? 'Semana visible' : 'Día seleccionado'}
          </p>
          <p className="module-stat-value">{visibleEvents.length}</p>
          <p className="text-xs text-primary-700">
            {viewMode === 'week'
              ? `${formatShortDate(weekDays[0])} - ${formatShortDate(weekDays[6])}`
              : formatShortDate(cursorDate)}
          </p>
        </article>
      </div>

      <article className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
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

          <p className="rounded-lg bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-800">{calendarRangeLabel}</p>

          <div className="flex gap-2">
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

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <select
            className="app-input"
            value={assignmentFilter}
            onChange={(event) => setAssignmentFilter(event.target.value)}
          >
            <option value="ALL">Todos mis cursos</option>
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

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-primary-700">Cargando calendario...</p> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div>
          {viewMode === 'month' ? (
            <article className="card space-y-3">
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase text-primary-600">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label}>{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((date) => {
                  const isCursorDay = date === cursorDate;
                  const dayEvents = eventsByDate[date] || [];

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setCursorDate(date)}
                      className={`min-h-[130px] rounded-xl border p-2 text-left transition ${
                        isCursorDay
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-primary-100 bg-white hover:bg-primary-50'
                      }`}
                    >
                      <p className="text-xs font-semibold text-primary-700">{date.slice(8, 10)}</p>
                      <div className="mt-2 space-y-1">
                        {dayEvents.slice(0, 4).map((event) => (
                          <div key={event.id} className={`rounded px-2 py-1 text-[11px] font-medium ${statusPillClass(event.status)}`}>
                            {event.start_time} {event.course_name}
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
            </article>
          ) : viewMode === 'week' ? (
            <article className="card max-w-full overflow-x-auto">
              <div className="w-max min-w-full">
                <div
                  className="grid border-b border-primary-100"
                  style={{ gridTemplateColumns: weekGridTemplate }}
                >
                  <div className="p-2 text-[11px] font-semibold uppercase text-primary-600">Hora</div>
                  {weekDays.map((date, index) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setCursorDate(date)}
                      className={`border-l border-primary-100 p-2 text-left transition hover:bg-primary-50 ${
                        date === cursorDate ? 'bg-primary-50' : ''
                      }`}
                      title={formatFullDate(date)}
                    >
                      <p className="text-xs font-semibold text-primary-900">{WEEKDAY_LABELS[index]}</p>
                      <p className="text-[11px] text-primary-700">{formatShortDate(date)}</p>
                    </button>
                  ))}
                </div>

                <div
                  className="grid"
                  style={{ gridTemplateColumns: weekGridTemplate }}
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

                  {weekDays.map((date) => (
                    <div key={date} className="relative border-l border-primary-100" style={{ height: `${timelineHeight}px` }}>
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
                        <div
                          key={event.id}
                          className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-[10px] shadow-sm sm:text-[11px] ${eventBlockClass(event.status)}`}
                          style={getEventPosition(event)}
                        >
                          <p className="font-semibold leading-tight">{event.course_name}</p>
                          <p className="leading-tight">
                            {event.start_time} - {event.end_time}
                          </p>
                          <p className="truncate leading-tight opacity-80">{event.classroom || 'Sin salón'}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ) : (
            <article className="card overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-primary-600">
                    <th className="pb-2 pr-3">Fecha</th>
                    <th className="pb-2 pr-3">Hora</th>
                    <th className="pb-2 pr-3">Curso</th>
                    <th className="pb-2 pr-3">Sede</th>
                    <th className="pb-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((event) => (
                    <tr key={event.id} className="border-t border-primary-100">
                      <td className="py-2 pr-3">{formatFullDate(String(event.event_date).slice(0, 10))}</td>
                      <td className="py-2 pr-3">
                        {event.start_time} - {event.end_time}
                      </td>
                      <td className="py-2 pr-3">{event.course_name}</td>
                      <td className="py-2 pr-3">{event.campus_name}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusPillClass(event.status)}`}>
                          {event.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {!loading && !visibleEvents.length ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-sm text-primary-700">
                        No tienes clases programadas para este día.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </article>
          )}
        </div>

        <aside className="space-y-4">
          <article className="card space-y-3">
            <h2 className="text-lg font-semibold text-primary-900">Próximas clases</h2>
            <div className="space-y-2">
              {upcoming.map((event) => (
                <div key={event.id} className="rounded-xl border border-primary-200 bg-white p-2">
                  <p className="text-xs font-semibold text-primary-900">{event.course_name}</p>
                  <p className="text-[11px] text-primary-700">
                    {formatShortDate(String(event.event_date).slice(0, 10))} | {event.start_time} - {event.end_time}
                  </p>
                  <p className="text-[11px] text-primary-600">{event.campus_name}</p>
                </div>
              ))}
              {!upcoming.length ? (
                <p className="text-xs text-primary-700">No hay clases próximas con el filtro actual.</p>
              ) : null}
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
