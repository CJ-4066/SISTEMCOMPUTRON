import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import StudentPracticesPanel from '../components/StudentPracticesPanel';

const emptyTopicForm = {
  title: '',
  content: '',
};

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

const STATUS_META = {
  PRESENTE: { label: 'Asistió', className: 'bg-primary-100 text-primary-800' },
  AUSENTE: { label: 'Ausente', className: 'bg-red-100 text-red-700' },
  FALTO: { label: 'Falto', className: 'bg-amber-100 text-amber-800' },
  TARDE: { label: 'Tarde', className: 'bg-accent-100 text-accent-800' },
  JUSTIFICADO: { label: 'Justificado', className: 'bg-accent-100 text-accent-800' },
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

export default function StudentCourseWorkspacePage() {
  const { assignmentId } = useParams();
  const numericAssignmentId = Number(assignmentId);
  const { user } = useAuth();

  const [assignment, setAssignment] = useState(null);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [loadingAssignment, setLoadingAssignment] = useState(false);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [error, setError] = useState('');
  const [message, _setMessage] = useState('');

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
  const [forumMessage, setForumMessage] = useState('');
  const [forumError, setForumError] = useState('');

  const loadAssignment = useCallback(async () => {
    if (!numericAssignmentId || Number.isNaN(numericAssignmentId)) {
      setAssignment(null);
      setError('Salón no válido.');
      return;
    }

    setLoadingAssignment(true);
    setError('');
    try {
      const response = await api.get('/students/me/courses');
      const items = response.data.items || [];
      const found = items.find((item) => Number(item.assignment_id) === Number(numericAssignmentId)) || null;

      if (!found) {
        setAssignment(null);
        setError('No se encontró este salón dentro de tus cursos matriculados.');
        return;
      }

      setAssignment(found);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar la información del salón.');
      setAssignment(null);
    } finally {
      setLoadingAssignment(false);
    }
  }, [numericAssignmentId]);

  const loadAttendance = useCallback(async (assignmentIdToLoad) => {
    if (!assignmentIdToLoad) {
      setAttendanceRows([]);
      return;
    }

    setLoadingAttendance(true);
    try {
      const response = await api.get('/students/me/attendance', {
        params: { assignment_id: Number(assignmentIdToLoad) },
      });
      setAttendanceRows(response.data.item?.attendances || []);
    } catch {
      setAttendanceRows([]);
    } finally {
      setLoadingAttendance(false);
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
    loadAttendance(assignment.assignment_id);
    loadTopics(assignment.assignment_id);
  }, [assignment, loadAttendance, loadTopics]);

  useEffect(() => {
    if (!selectedTopicId) return;
    loadComments(selectedTopicId);
  }, [selectedTopicId, loadComments]);

  const attendanceSummary = useMemo(() => {
    const summary = {
      PRESENTE: 0,
      AUSENTE: 0,
      FALTO: 0,
      TARDE: 0,
      JUSTIFICADO: 0,
    };

    for (const row of attendanceRows) {
      const key = String(row.status || 'AUSENTE').toUpperCase();
      if (summary[key] !== undefined) summary[key] += 1;
    }

    return summary;
  }, [attendanceRows]);

  const selectedTopic = useMemo(
    () => topics.find((topic) => Number(topic.id) === Number(selectedTopicId)) || null,
    [topics, selectedTopicId],
  );

  const canDeleteTopic = (topic) => Number(topic.author_user_id) === Number(user?.id);
  const canDeleteComment = (comment) => Number(comment.author_user_id) === Number(user?.id);

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

      setForumMessage('Publicación creada.');
      setTopicForm(emptyTopicForm);
      setTopicFile(null);
      setShowTopicForm(false);
      await loadTopics(assignment.assignment_id);
    } catch (requestError) {
      setForumError(requestError.response?.data?.message || 'No se pudo crear la publicación.');
    } finally {
      setSavingTopic(false);
    }
  };

  const removeTopic = async (topic) => {
    const confirmed = window.confirm(`Se eliminará la publicación "${topic.title}". ¿Continuar?`);
    if (!confirmed) return;

    setForumMessage('');
    setForumError('');
    try {
      await api.delete(`/forum/topics/${topic.id}`);
      setForumMessage('Publicación eliminada.');
      if (Number(selectedTopicId) === Number(topic.id)) {
        setSelectedTopicId(null);
        setComments([]);
      }
      await loadTopics(assignment?.assignment_id);
    } catch (requestError) {
      setForumError(requestError.response?.data?.message || 'No se pudo eliminar la publicación.');
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

  const removeComment = async (comment) => {
    const confirmed = window.confirm('Se eliminará este comentario. ¿Continuar?');
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

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Salón del curso</h1>
          <p className="text-sm text-primary-700">Espacio para consultar asistencia, resolver practicas y participar en el foro.</p>
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
      {loadingAssignment ? <p className="text-sm text-primary-700">Cargando salón...</p> : null}

      {assignment ? (
        <article className="card">
          <h2 className="text-lg font-semibold text-primary-900">{assignment.course_name}</h2>
          <div className="mt-2 grid gap-2 text-sm text-primary-700 md:grid-cols-2">
            <p>
              <strong className="text-primary-900">Sede/Modalidad:</strong> {assignment.campus_name} (
              {assignment.modality || 'PRESENCIAL'})
            </p>
            <p>
              <strong className="text-primary-900">Salón/Horario:</strong>{' '}
              {assignment.schedule_info || 'Sin detalle registrado'}
            </p>
            <p>
              <strong className="text-primary-900">Periodo:</strong> {assignment.period_name}
            </p>
            <p>
              <strong className="text-primary-900">Docente:</strong> {assignment.teacher_name || 'Por asignar'}
            </p>
          </div>
        </article>
      ) : null}

      {assignment ? <StudentPracticesPanel assignment={assignment} /> : null}

      {assignment ? (
        <article className="card order-2 overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-primary-900">Mi asistencia en este salón</h2>
            {loadingAttendance ? (
              <span className="text-xs text-primary-700">Actualizando...</span>
            ) : (
              <button
                type="button"
                onClick={() => loadAttendance(assignment.assignment_id)}
                className="rounded-lg border border-primary-300 bg-white px-3 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-50"
              >
                Actualizar
              </button>
            )}
          </div>

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
          </div>

          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-primary-600">
                <th className="pb-2 pr-3">Fecha</th>
                <th className="pb-2 pr-3">Curso</th>
                <th className="pb-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRows.map((row) => {
                const badge = STATUS_META[String(row.status || '').toUpperCase()] || STATUS_META.AUSENTE;
                return (
                  <tr key={row.id} className="border-t border-primary-100">
                    <td className="py-2 pr-3">{formatDate(row.attendance_date)}</td>
                    <td className="py-2 pr-3">{row.course_name}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loadingAttendance && !attendanceRows.length ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-sm text-primary-700">
                    Aún no hay asistencias registradas para este salón.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </article>
      ) : null}

      {assignment ? (
        <article className="card order-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-primary-900">Foro del salón</h2>
            <button
              type="button"
              onClick={() => setShowTopicForm((prev) => !prev)}
              className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
            >
              {showTopicForm ? 'Cerrar publicación' : 'Nueva publicación'}
            </button>
          </div>

          {forumMessage ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{forumMessage}</p> : null}
          {forumError ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{forumError}</p> : null}

          {showTopicForm ? (
            <form onSubmit={createTopic} className="panel-soft space-y-3">
              <h3 className="text-base font-semibold text-primary-900">Publicar consulta o entrega</h3>
              <input
                className="app-input"
                placeholder="Título"
                value={topicForm.title}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
              <textarea
                className="app-input min-h-28"
                placeholder="Escribe tu mensaje..."
                value={topicForm.content}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, content: event.target.value }))}
                required
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold text-primary-800">
                  Adjuntar archivo
                  <input
                    type="file"
                    className="mt-1 block w-full text-xs"
                    onChange={(event) => setTopicFile(event.target.files?.[0] || null)}
                  />
                </label>
                {topicFile ? (
                  <p className="self-end text-xs text-primary-700">Seleccionado: {topicFile.name}</p>
                ) : null}
              </div>
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
                    {topic.attachment_url ? <div className="mt-1">{attachmentLink(topic.attachment_url, topic.attachment_name)}</div> : null}
                    <p className="mt-2 text-[11px] text-primary-600">
                      {topic.author_name || 'Usuario'} | {formatDateTime(topic.created_at)} |{' '}
                      {Number(topic.comments_count || 0)} comentario(s)
                    </p>
                  </button>
                );
              })}

              {!loadingTopics && !topics.length ? (
                <p className="text-sm text-primary-700">No hay publicaciones en este salón.</p>
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
                    Eliminar publicación
                  </button>
                ) : null}
              </div>

              {selectedTopic ? (
                <>
                  <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                    <p className="text-base font-semibold text-primary-900">{selectedTopic.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-primary-800">{selectedTopic.content}</p>
                    {selectedTopic.attachment_url ? (
                      <div className="mt-2">{attachmentLink(selectedTopic.attachment_url, selectedTopic.attachment_name)}</div>
                    ) : null}
                    {selectedTopic.grade_score !== null && selectedTopic.grade_score !== undefined ? (
                      <div className="mt-3 rounded-lg border border-accent-200 bg-accent-50 p-2 text-xs text-accent-900">
                        <p className="font-semibold">Calificación: {Number(selectedTopic.grade_score).toFixed(2)} / 20</p>
                        <p>{selectedTopic.grade_feedback || 'Sin observación del docente.'}</p>
                        <p className="mt-1 text-[11px] text-accent-800">Actualizado: {formatDateTime(selectedTopic.graded_at)}</p>
                      </div>
                    ) : null}
                    <p className="mt-2 text-[11px] text-primary-600">
                      Publicado por {selectedTopic.author_name || 'Usuario'} el {formatDateTime(selectedTopic.created_at)}
                    </p>
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
                          <p className="text-xs font-semibold text-primary-900">{comment.author_name || 'Usuario'}</p>
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
                <p className="text-sm text-primary-700">Selecciona una publicación para ver los comentarios.</p>
              )}
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
