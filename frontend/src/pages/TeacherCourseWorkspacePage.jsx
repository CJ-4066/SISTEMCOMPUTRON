import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import TeacherPracticesPanel from '../components/TeacherPracticesPanel';

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

const emptyTopicForm = {
  title: '',
  content: '',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toDownloadName = (value) => {
  const safe = String(value || '').trim();
  if (!safe) return 'adjunto';
  return safe.replace(/[\\/]/g, '_');
};

const attachmentLink = (attachmentUrl, attachmentName) => {
  if (!attachmentUrl) return null;
  const isInlineData = String(attachmentUrl).startsWith('data:');

  return (
    <a
      href={attachmentUrl}
      target={isInlineData ? undefined : '_blank'}
      rel={isInlineData ? undefined : 'noreferrer'}
      download={isInlineData ? toDownloadName(attachmentName) : undefined}
      className="text-xs font-semibold text-accent-800 underline"
    >
      {attachmentName ? `Adjunto: ${attachmentName}` : 'Ver adjunto'}
    </a>
  );
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });

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

export default function TeacherCourseWorkspacePage() {
  const { assignmentId } = useParams();
  const numericAssignmentId = Number(assignmentId);
  const { user, hasPermission } = useAuth();

  const [assignment, setAssignment] = useState(null);
  const [attendanceDate, setAttendanceDate] = useState(todayIso());
  const [students, setStudents] = useState([]);
  const [statusByEnrollment, setStatusByEnrollment] = useState({});
  const [loadingAssignment, setLoadingAssignment] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceSearchOpen, setAttendanceSearchOpen] = useState(false);
  const [attendanceStudentSearch, setAttendanceStudentSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [topics, setTopics] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [comments, setComments] = useState([]);
  const [topicForm, setTopicForm] = useState(emptyTopicForm);
  const [topicFile, setTopicFile] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentFile, setCommentFile] = useState(null);
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [savingTopic, setSavingTopic] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [savingTopicGrade, setSavingTopicGrade] = useState(false);
  const [gradeScoreInput, setGradeScoreInput] = useState('');
  const [gradeFeedbackInput, setGradeFeedbackInput] = useState('');
  const [forumMessage, setForumMessage] = useState('');
  const [forumError, setForumError] = useState('');

  const canViewAssignments = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW);
  const canManageAttendance = hasPermission(PERMISSIONS.ACADEMIC_ATTENDANCE_MANAGE);
  const canManageAssignments = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_MANAGE);

  const loadAssignment = useCallback(async () => {
    if (!canViewAssignments) {
      setAssignment(null);
      return;
    }

    if (!numericAssignmentId || Number.isNaN(numericAssignmentId)) {
      setAssignment(null);
      setError('Salon no valido.');
      return;
    }

    setLoadingAssignment(true);
    setError('');
    try {
      const response = await api.get('/teachers/my-courses');
      const items = response.data.items || [];
      const found = items.find((item) => Number(item.assignment_id) === Number(numericAssignmentId)) || null;

      if (!found) {
        setAssignment(null);
        setError('No se encontro este salon en tus asignaciones.');
        return;
      }

      setAssignment(found);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar la informacion del salon.');
      setAssignment(null);
    } finally {
      setLoadingAssignment(false);
    }
  }, [canViewAssignments, numericAssignmentId]);

  const loadStudents = useCallback(async (assignmentIdToLoad, date) => {
    if (!assignmentIdToLoad) {
      setStudents([]);
      return false;
    }

    setLoadingStudents(true);
    setError('');
    try {
      const response = await api.get(`/teachers/my-courses/${assignmentIdToLoad}/students`, {
        params: { date },
      });

      const items = (response.data.item?.students || []).slice().sort((a, b) => {
        const byLastName = String(a.last_name || '').localeCompare(String(b.last_name || ''), 'es', {
          sensitivity: 'base',
        });
        if (byLastName !== 0) return byLastName;
        return String(a.first_name || '').localeCompare(String(b.first_name || ''), 'es', {
          sensitivity: 'base',
        });
      });

      setStudents(items);
      setStatusByEnrollment(
        items.reduce((acc, item) => {
          acc[item.enrollment_id] = item.attendance_status || 'AUSENTE';
          return acc;
        }, {}),
      );
      setAttendanceStudentSearch('');
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar los alumnos del salon.');
      setStudents([]);
      return false;
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  const loadTopics = useCallback(async (assignmentIdToLoad) => {
    if (!assignmentIdToLoad) {
      setTopics([]);
      setSelectedTopicId(null);
      setComments([]);
      return;
    }

    setLoadingTopics(true);
    setForumError('');
    try {
      const response = await api.get('/forum/topics', {
        params: { assignment_id: Number(assignmentIdToLoad) },
      });
      const items = response.data.items || [];
      setTopics(items);

      if (!items.length) {
        setSelectedTopicId(null);
        setComments([]);
        return;
      }

      setSelectedTopicId((prev) => {
        const exists = items.some((item) => Number(item.id) === Number(prev));
        return exists ? prev : items[0].id;
      });
    } catch (requestError) {
      setForumError(requestError.response?.data?.message || 'No se pudieron cargar las publicaciones del foro.');
      setTopics([]);
      setSelectedTopicId(null);
      setComments([]);
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  const loadComments = useCallback(async (topicIdToLoad) => {
    if (!topicIdToLoad) {
      setComments([]);
      return;
    }

    setLoadingComments(true);
    setForumError('');
    try {
      const response = await api.get(`/forum/topics/${topicIdToLoad}/comments`);
      setComments(response.data.items || []);
    } catch (requestError) {
      setForumError(requestError.response?.data?.message || 'No se pudieron cargar los comentarios.');
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    loadAssignment();
  }, [loadAssignment]);

  useEffect(() => {
    if (!assignment?.assignment_id) return;
    setStudents([]);
    setStatusByEnrollment({});
    loadStudents(assignment.assignment_id, attendanceDate);
  }, [attendanceDate, assignment?.assignment_id, loadStudents]);

  useEffect(() => {
    if (!assignment) return;
    loadTopics(assignment.assignment_id);
  }, [assignment, loadTopics]);

  useEffect(() => {
    if (!selectedTopicId) return;
    loadComments(selectedTopicId);
  }, [selectedTopicId, loadComments]);

  const attendanceSummary = useMemo(() => {
    const summary = {
      PRESENTE: 0,
      AUSENTE: 0,
      FALTO: 0,
      JUSTIFICADO: 0,
    };

    for (const student of students) {
      const status = statusByEnrollment[student.enrollment_id] || 'AUSENTE';
      if (summary[status] !== undefined) summary[status] += 1;
    }

    return summary;
  }, [statusByEnrollment, students]);

  const attendanceTotal = useMemo(
    () => Object.values(attendanceSummary).reduce((sum, value) => sum + value, 0),
    [attendanceSummary],
  );

  const filteredStudents = useMemo(() => {
    const term = attendanceStudentSearch.trim().toLowerCase();
    if (!term) return students;

    return students.filter((student) => {
      const fullName = `${student.last_name || ''} ${student.first_name || ''}`.trim().toLowerCase();
      const reverseName = `${student.first_name || ''} ${student.last_name || ''}`.trim().toLowerCase();
      const document = String(student.document_number || '').toLowerCase();
      return fullName.includes(term) || reverseName.includes(term) || document.includes(term);
    });
  }, [attendanceStudentSearch, students]);

  const selectedTopic = useMemo(
    () => topics.find((topic) => Number(topic.id) === Number(selectedTopicId)) || null,
    [topics, selectedTopicId],
  );

  useEffect(() => {
    if (!selectedTopic) {
      setGradeScoreInput('');
      setGradeFeedbackInput('');
      return;
    }

    setGradeScoreInput(
      selectedTopic.grade_score === null || selectedTopic.grade_score === undefined
        ? ''
        : String(selectedTopic.grade_score),
    );
    setGradeFeedbackInput(selectedTopic.grade_feedback || '');
  }, [selectedTopic]);

  const canDeleteTopic = (topic) =>
    canManageAssignments || Number(topic.author_user_id) === Number(user?.id);

  const canDeleteComment = (comment) =>
    canManageAssignments || Number(comment.author_user_id) === Number(user?.id);

  const handleStatusChange = (enrollmentId, status) => {
    setStatusByEnrollment((prev) => ({
      ...prev,
      [enrollmentId]: status,
    }));
  };

  const applyStatusToVisibleStudents = (status) => {
    if (!canManageAttendance || !students.length) return;

    const targets = filteredStudents.length ? filteredStudents : students;
    setStatusByEnrollment((prev) => {
      const next = { ...prev };
      for (const student of targets) {
        next[student.enrollment_id] = status;
      }
      return next;
    });
    setMessage('');
    setError('');
  };

  const saveAttendance = async () => {
    if (!assignment || !canManageAttendance || !students.length) return;

    setSavingAttendance(true);
    setMessage('');
    setError('');
    try {
      await api.post(`/teachers/my-courses/${assignment.assignment_id}/attendance`, {
        attendance_date: attendanceDate,
        attendances: students.map((student) => ({
          enrollment_id: Number(student.enrollment_id),
          status: statusByEnrollment[student.enrollment_id] || 'AUSENTE',
        })),
      });

      setMessage('Asistencia guardada correctamente.');
      await loadStudents(assignment.assignment_id, attendanceDate);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo guardar la asistencia.');
    } finally {
      setSavingAttendance(false);
    }
  };

  const createTopic = async (event) => {
    event.preventDefault();
    if (!assignment) return;

    setSavingTopic(true);
    setForumMessage('');
    setForumError('');
    try {
      let attachmentUrl = null;
      let attachmentName = null;

      if (topicFile) {
        attachmentUrl = await fileToDataUrl(topicFile);
        attachmentName = topicFile.name || 'adjunto';
      }

      await api.post('/forum/topics', {
        assignment_id: Number(assignment.assignment_id),
        title: topicForm.title.trim(),
        content: topicForm.content.trim(),
        attachment_name: attachmentName,
        attachment_url: attachmentUrl,
      });
      setForumMessage('Publicacion creada.');
      setTopicForm(emptyTopicForm);
      setTopicFile(null);
      setShowTopicForm(false);
      await loadTopics(assignment.assignment_id);
    } catch (requestError) {
      setForumError(requestError.response?.data?.message || 'No se pudo crear la publicacion.');
    } finally {
      setSavingTopic(false);
    }
  };

  const removeTopic = async (topic) => {
    const confirmed = window.confirm(`Se eliminara la publicacion "${topic.title}". ¿Continuar?`);
    if (!confirmed) return;

    setForumMessage('');
    setForumError('');
    try {
      await api.delete(`/forum/topics/${topic.id}`);
      setForumMessage('Publicacion eliminada.');
      if (Number(selectedTopicId) === Number(topic.id)) {
        setSelectedTopicId(null);
        setComments([]);
      }
      await loadTopics(assignment?.assignment_id);
    } catch (requestError) {
      setForumError(requestError.response?.data?.message || 'No se pudo eliminar la publicacion.');
    }
  };

  const createComment = async (event) => {
    event.preventDefault();
    if (!selectedTopicId || !commentText.trim()) return;

    setSavingComment(true);
    setForumMessage('');
    setForumError('');
    try {
      let attachmentUrl = null;
      let attachmentName = null;

      if (commentFile) {
        attachmentUrl = await fileToDataUrl(commentFile);
        attachmentName = commentFile.name || 'adjunto';
      }

      await api.post(`/forum/topics/${selectedTopicId}/comments`, {
        content: commentText.trim(),
        attachment_name: attachmentName,
        attachment_url: attachmentUrl,
      });
      setForumMessage('Comentario publicado.');
      setCommentText('');
      setCommentFile(null);
      await Promise.all([loadComments(selectedTopicId), loadTopics(assignment?.assignment_id)]);
    } catch (requestError) {
      setForumError(requestError.response?.data?.message || 'No se pudo publicar el comentario.');
    } finally {
      setSavingComment(false);
    }
  };

  const saveTopicGrade = async () => {
    if (!selectedTopic) return;

    const trimmedFeedback = gradeFeedbackInput.trim();
    const normalizedScore = gradeScoreInput === '' ? null : Number(gradeScoreInput);

    if (normalizedScore !== null && (Number.isNaN(normalizedScore) || normalizedScore < 0 || normalizedScore > 20)) {
      setForumError('La calificacion debe estar entre 0 y 20.');
      return;
    }

    setSavingTopicGrade(true);
    setForumMessage('');
    setForumError('');
    try {
      await api.put(`/forum/topics/${selectedTopic.id}`, {
        grade_score: normalizedScore,
        grade_feedback: trimmedFeedback || null,
      });
      setForumMessage('Calificacion actualizada.');
      await loadTopics(assignment?.assignment_id);
    } catch (requestError) {
      setForumError(requestError.response?.data?.message || 'No se pudo guardar la calificacion.');
    } finally {
      setSavingTopicGrade(false);
    }
  };

  const removeComment = async (comment) => {
    const confirmed = window.confirm('Se eliminara este comentario. ¿Continuar?');
    if (!confirmed) return;

    setForumMessage('');
    setForumError('');
    try {
      await api.delete(`/forum/comments/${comment.id}`);
      setForumMessage('Comentario eliminado.');
      await Promise.all([loadComments(selectedTopicId), loadTopics(assignment?.assignment_id)]);
    } catch (requestError) {
      setForumError(requestError.response?.data?.message || 'No se pudo eliminar el comentario.');
    }
  };

  if (!canViewAssignments) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Salon</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este modulo.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Salon del curso</h1>
          <p className="text-sm text-primary-700">Asistencia, practicas y foro del salon en una sola vista de trabajo.</p>
        </div>
        <Link
          to="/courses"
          className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
        >
          Volver a cursos
        </Link>
      </div>

      {message ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loadingAssignment ? <p className="text-sm text-primary-700">Cargando salon...</p> : null}

      {assignment ? (
        <article className="card">
          <h2 className="text-lg font-semibold text-primary-900">{assignment.course_name}</h2>
          <div className="mt-2 grid gap-2 text-sm text-primary-700 md:grid-cols-2">
            <p>
              <strong className="text-primary-900">Sede/Modalidad:</strong> {assignment.campus_name} (
              {assignment.modality || 'PRESENCIAL'})
            </p>
            <p>
              <strong className="text-primary-900">Salon/Horario:</strong>{' '}
              {assignment.classroom_info || 'Sin detalle registrado'}
            </p>
            <p>
              <strong className="text-primary-900">Periodo:</strong> {assignment.period_name}
            </p>
            <p>
              <strong className="text-primary-900">Alumnos activos:</strong> {assignment.active_students}
            </p>
          </div>
        </article>
      ) : null}

      {assignment ? <TeacherPracticesPanel assignment={assignment} /> : null}

      {assignment ? (
        <article className="card order-2 overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-primary-900">Alumnos del salon/curso</h2>
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
              <label className="text-sm text-primary-700" htmlFor="workspace-attendance-date">
                Fecha
              </label>
              <input
                id="workspace-attendance-date"
                type="date"
                className="app-input w-44"
                value={attendanceDate}
                onChange={(event) => setAttendanceDate(event.target.value)}
              />
              <button
                type="button"
                onClick={saveAttendance}
                disabled={!canManageAttendance || savingAttendance || loadingStudents || students.length === 0}
                className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAttendance ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>

          <p className="mb-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-700">
            Puedes usar búsqueda y aplicar estados masivos sobre los alumnos visibles para acelerar el registro.
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyStatusToVisibleStudents('PRESENTE')}
              disabled={!canManageAttendance || savingAttendance || loadingStudents || students.length === 0}
              className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Visibles: Asistió
            </button>
            <button
              type="button"
              onClick={() => applyStatusToVisibleStudents('AUSENTE')}
              disabled={!canManageAttendance || savingAttendance || loadingStudents || students.length === 0}
              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Visibles: Ausente
            </button>
            <button
              type="button"
              onClick={() => applyStatusToVisibleStudents('JUSTIFICADO')}
              disabled={!canManageAttendance || savingAttendance || loadingStudents || students.length === 0}
              className="rounded-lg border border-accent-300 bg-white px-3 py-2 text-xs font-semibold text-accent-800 hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Visibles: Justificado
            </button>
          </div>

          {loadingStudents ? <p className="mb-3 text-sm text-primary-700">Cargando lista de alumnos...</p> : null}

          {!loadingStudents ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
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
                  {filteredStudents.map((student) => {
                    const currentStatus = statusByEnrollment[student.enrollment_id] || 'AUSENTE';
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
                              onChange={(event) => handleStatusChange(student.enrollment_id, event.target.value)}
                              disabled={!canManageAttendance || savingAttendance || loadingStudents}
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
                  {!loadingStudents && students.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-sm text-primary-700">
                        Este salon no tiene alumnos activos asignados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {students.length > 0 && filteredStudents.length === 0 ? (
                <p className="mt-3 text-sm text-primary-700">Sin coincidencias para la búsqueda actual.</p>
              ) : null}
            </>
          ) : null}
        </article>
      ) : null}

      {assignment ? (
        <article className="card order-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-primary-900">Foro del salon</h2>
            <button
              type="button"
              onClick={() => setShowTopicForm((prev) => !prev)}
              className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
            >
              {showTopicForm ? 'Cerrar publicacion' : 'Nueva publicacion'}
            </button>
          </div>

          {forumMessage ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{forumMessage}</p> : null}
          {forumError ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{forumError}</p> : null}

          {showTopicForm ? (
            <form onSubmit={createTopic} className="panel-soft space-y-3">
              <h3 className="text-base font-semibold text-primary-900">Publicar informacion del curso</h3>
              <input
                className="app-input"
                placeholder="Titulo de la publicacion"
                value={topicForm.title}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
              <textarea
                className="app-input min-h-28"
                placeholder="Escribe indicaciones, comunicados o consultas..."
                value={topicForm.content}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, content: event.target.value }))}
                required
              />
              <label className="text-xs font-semibold text-primary-800">
                Adjuntar archivo
                <input
                  type="file"
                  className="mt-1 block w-full text-xs"
                  onChange={(event) => setTopicFile(event.target.files?.[0] || null)}
                />
              </label>
              {topicFile ? <p className="text-xs text-primary-700">Seleccionado: {topicFile.name}</p> : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingTopic}
                  className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingTopic ? 'Publicando...' : 'Publicar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTopicForm(false);
                    setTopicForm(emptyTopicForm);
                    setTopicFile(null);
                  }}
                  className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-primary-900">Publicaciones</h3>
                {loadingTopics ? <span className="text-xs text-primary-700">Cargando...</span> : null}
              </div>
              {topics.map((topic) => {
                const isActive = Number(topic.id) === Number(selectedTopicId);
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setSelectedTopicId(topic.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isActive ? 'border-primary-500 bg-primary-50' : 'border-primary-200 bg-white hover:bg-primary-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-primary-900">{topic.title}</p>
                      {topic.is_pinned ? (
                        <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-800">
                          Fijado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-primary-700">{topic.content}</p>
                    {topic.attachment_url ? (
                      <div className="mt-1">
                        {attachmentLink(topic.attachment_url, topic.attachment_name)}
                      </div>
                    ) : null}
                    {topic.grade_score !== null && topic.grade_score !== undefined ? (
                      <p className="mt-1 text-[11px] font-semibold text-accent-900">
                        Nota: {Number(topic.grade_score).toFixed(2)} / 20
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-primary-600">
                      {topic.author_name || 'Usuario'} | {formatDateTime(topic.created_at)} |{' '}
                      {Number(topic.comments_count || 0)} comentario(s)
                    </p>
                  </button>
                );
              })}
              {!loadingTopics && !topics.length ? (
                <p className="text-sm text-primary-700">No hay publicaciones en este salon.</p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-primary-900">Detalle y comentarios</h3>
                {selectedTopic && canDeleteTopic(selectedTopic) ? (
                  <button
                    type="button"
                    onClick={() => removeTopic(selectedTopic)}
                    className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Eliminar publicacion
                  </button>
                ) : null}
              </div>

              {selectedTopic ? (
                <>
                  <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                    <p className="text-base font-semibold text-primary-900">{selectedTopic.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-primary-800">{selectedTopic.content}</p>
                    {selectedTopic.attachment_url ? (
                      <div className="mt-2">
                        {attachmentLink(selectedTopic.attachment_url, selectedTopic.attachment_name)}
                      </div>
                    ) : null}
                    {selectedTopic.grade_score !== null && selectedTopic.grade_score !== undefined ? (
                      <div className="mt-3 rounded-lg border border-accent-200 bg-accent-50 p-2 text-xs text-accent-900">
                        <p className="font-semibold">Calificacion: {Number(selectedTopic.grade_score).toFixed(2)} / 20</p>
                        <p>{selectedTopic.grade_feedback || 'Sin observacion.'}</p>
                        <p className="mt-1 text-[11px] text-accent-800">
                          Revisado: {formatDateTime(selectedTopic.graded_at)}
                        </p>
                      </div>
                    ) : null}
                    <p className="mt-2 text-[11px] text-primary-600">
                      Publicado por {selectedTopic.author_name || 'Usuario'} el{' '}
                      {formatDateTime(selectedTopic.created_at)}
                    </p>
                  </div>

                  <div className="panel-soft space-y-2">
                    <h4 className="text-sm font-semibold text-primary-900">Calificar entrega/publicacion</h4>
                    <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step="0.01"
                        className="app-input"
                        placeholder="Nota (0-20)"
                        value={gradeScoreInput}
                        onChange={(event) => setGradeScoreInput(event.target.value)}
                      />
                      <input
                        className="app-input"
                        placeholder="Observacion (opcional)"
                        value={gradeFeedbackInput}
                        onChange={(event) => setGradeFeedbackInput(event.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={saveTopicGrade}
                      disabled={savingTopicGrade}
                      className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingTopicGrade ? 'Guardando...' : 'Guardar calificacion'}
                    </button>
                  </div>

                  <form onSubmit={createComment} className="space-y-2">
                    <textarea
                      className="app-input min-h-24"
                      placeholder="Escribe tu comentario..."
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      required
                    />
                    <label className="text-xs font-semibold text-primary-800">
                      Adjuntar archivo
                      <input
                        type="file"
                        className="mt-1 block w-full text-xs"
                        onChange={(event) => setCommentFile(event.target.files?.[0] || null)}
                      />
                    </label>
                    {commentFile ? <p className="text-xs text-primary-700">Seleccionado: {commentFile.name}</p> : null}
                    <button
                      type="submit"
                      disabled={savingComment || !commentText.trim()}
                      className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingComment ? 'Comentando...' : 'Comentar'}
                    </button>
                  </form>

                  <div className="space-y-2">
                    {loadingComments ? <p className="text-xs text-primary-700">Cargando comentarios...</p> : null}
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-xl border border-primary-100 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-primary-900">
                            {comment.author_name || 'Usuario'}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-primary-600">{formatDateTime(comment.created_at)}</span>
                            {canDeleteComment(comment) ? (
                              <button
                                type="button"
                                onClick={() => removeComment(comment)}
                                className="rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                              >
                                Eliminar
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-primary-800">{comment.content}</p>
                        {comment.attachment_url ? (
                          <div className="mt-2">{attachmentLink(comment.attachment_url, comment.attachment_name)}</div>
                        ) : null}
                      </div>
                    ))}
                    {!loadingComments && !comments.length ? (
                      <p className="text-sm text-primary-700">Sin comentarios por ahora.</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-primary-700">Selecciona una publicacion para ver los comentarios.</p>
              )}
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
