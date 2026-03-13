import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const PRACTICE_STATE_META = {
  OPEN: { label: 'Disponible', className: 'bg-primary-100 text-primary-800' },
  UPCOMING: { label: 'Proxima', className: 'bg-amber-100 text-amber-800' },
  CLOSED: { label: 'Cerrada', className: 'bg-red-100 text-red-700' },
  DISABLED: { label: 'Deshabilitada', className: 'bg-primary-100 text-primary-700' },
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

export default function StudentPracticesPanel({ assignment }) {
  const assignmentId = Number(assignment?.assignment_id || 0);

  const [practices, setPractices] = useState([]);
  const [selectedPracticeId, setSelectedPracticeId] = useState(null);
  const [selectedPractice, setSelectedPractice] = useState(null);
  const [practiceQuestions, setPracticeQuestions] = useState([]);
  const [studentProgress, setStudentProgress] = useState(null);
  const [answersByQuestion, setAnswersByQuestion] = useState({});

  const [loadingPractices, setLoadingPractices] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submittingPractice, setSubmittingPractice] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadPractices = useCallback(async () => {
    if (!assignmentId) {
      setPractices([]);
      setSelectedPracticeId(null);
      setSelectedPractice(null);
      setPracticeQuestions([]);
      setStudentProgress(null);
      return;
    }

    setLoadingPractices(true);
    setError('');
    try {
      const response = await api.get('/practices', {
        params: { assignment_id: assignmentId },
      });
      const items = response.data?.items || [];
      setPractices(items);
      setSelectedPracticeId((prev) => {
        if (!items.length) return null;
        if (!prev) return items[0].id;
        const stillExists = items.some((item) => Number(item.id) === Number(prev));
        return stillExists ? prev : items[0].id;
      });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar las practicas.');
      setPractices([]);
      setSelectedPracticeId(null);
      setSelectedPractice(null);
      setPracticeQuestions([]);
      setStudentProgress(null);
    } finally {
      setLoadingPractices(false);
    }
  }, [assignmentId]);

  const loadPracticeDetail = useCallback(async (practiceId) => {
    if (!practiceId) {
      setSelectedPractice(null);
      setPracticeQuestions([]);
      setStudentProgress(null);
      setAnswersByQuestion({});
      return;
    }

    setLoadingDetail(true);
    setError('');
    try {
      const response = await api.get(`/practices/${practiceId}`);
      setSelectedPractice(response.data?.item || null);
      setPracticeQuestions(response.data?.questions || []);
      setStudentProgress(response.data?.student_progress || null);
      setAnswersByQuestion({});
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar el detalle de la practica.');
      setSelectedPractice(null);
      setPracticeQuestions([]);
      setStudentProgress(null);
      setAnswersByQuestion({});
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadPractices();
  }, [loadPractices]);

  useEffect(() => {
    loadPracticeDetail(selectedPracticeId);
  }, [loadPracticeDetail, selectedPracticeId]);

  const selectedPracticeFromList = useMemo(
    () => practices.find((item) => Number(item.id) === Number(selectedPracticeId)) || null,
    [practices, selectedPracticeId],
  );

  const attemptsUsed = Number(
    studentProgress?.attempts_used ??
      selectedPracticeFromList?.attempts_used ??
      0,
  );
  const remainingAttempts = Number(
    studentProgress?.remaining_attempts ??
      selectedPracticeFromList?.remaining_attempts ??
      0,
  );

  const canSubmitPractice = Boolean(
    selectedPractice &&
      selectedPractice.is_open &&
      remainingAttempts > 0 &&
      !submittingPractice &&
      practiceQuestions.length > 0,
  );

  const submitPractice = async (event) => {
    event.preventDefault();
    if (!selectedPracticeId) return;

    const unansweredCount = practiceQuestions.filter(
      (question) => !answersByQuestion[question.id],
    ).length;
    if (unansweredCount > 0) {
      setError('Debes responder todas las preguntas antes de enviar.');
      return;
    }

    const answers = practiceQuestions.map((question) => ({
      question_id: Number(question.id),
      option_id: Number(answersByQuestion[question.id]),
    }));

    setSubmittingPractice(true);
    setMessage('');
    setError('');
    try {
      const response = await api.post(`/practices/${selectedPracticeId}/submit`, {
        answers,
      });
      const result = response.data?.item;
      setMessage(
        `Practica enviada. Puntaje: ${Number(result?.score || 0).toFixed(2)} / ${Number(
          result?.max_score || 0,
        ).toFixed(2)} (${Number(result?.percentage || 0).toFixed(2)}%).`,
      );
      await Promise.all([loadPractices(), loadPracticeDetail(selectedPracticeId)]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo enviar la practica.');
    } finally {
      setSubmittingPractice(false);
    }
  };

  return (
    <article className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-primary-900">Practicas del curso</h2>
        <p className="text-xs text-primary-700">
          Responde las practicas habilitadas y recibe calificacion automatica al enviar. El orden de opciones se muestra aleatorio.
        </p>
      </div>

      {message ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-primary-900">Listado</h3>
            {loadingPractices ? <span className="text-xs text-primary-700">Cargando...</span> : null}
          </div>

          {practices.map((practice) => {
            const isActive = Number(practice.id) === Number(selectedPracticeId);
            const stateMeta =
              PRACTICE_STATE_META[String(practice.availability_label || '').toUpperCase()] ||
              PRACTICE_STATE_META.DISABLED;

            return (
              <button
                key={practice.id}
                type="button"
                onClick={() => setSelectedPracticeId(practice.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  isActive ? 'border-primary-500 bg-primary-50' : 'border-primary-200 bg-white hover:bg-primary-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-primary-900">{practice.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stateMeta.className}`}>
                    {stateMeta.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-primary-700">{practice.description || 'Sin descripcion.'}</p>
                <p className="mt-2 text-[11px] text-primary-600">
                  Preguntas: {Number(practice.question_count || 0)} | Intentos usados:{' '}
                  {Number(practice.attempts_used || 0)} / {Number(practice.max_attempts || 1)}
                </p>
                <p className="text-[11px] text-primary-600">
                  Inicio: {formatDateTime(practice.starts_at)} | Cierre: {formatDateTime(practice.ends_at)}
                </p>
              </button>
            );
          })}

          {!loadingPractices && !practices.length ? (
            <p className="text-sm text-primary-700">No hay practicas disponibles en este salon.</p>
          ) : null}
        </div>

        <div className="space-y-4">
          {loadingDetail ? <p className="text-sm text-primary-700">Cargando detalle de practica...</p> : null}

          {!loadingDetail && selectedPractice ? (
            <>
              <div className="panel-soft space-y-2">
                <h3 className="text-base font-semibold text-primary-900">{selectedPractice.title}</h3>
                <p className="text-sm text-primary-800">{selectedPractice.description || 'Sin descripcion.'}</p>
                <p className="text-xs text-primary-700">
                  Inicio: {formatDateTime(selectedPractice.starts_at)} | Cierre: {formatDateTime(selectedPractice.ends_at)}
                </p>
                <p className="text-xs text-primary-700">
                  Intentos usados: {attemptsUsed} | Intentos restantes: {remainingAttempts}
                </p>
                {studentProgress?.latest_score !== null && studentProgress?.latest_score !== undefined ? (
                  <p className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-xs font-semibold text-accent-900">
                    Ultimo resultado: {Number(studentProgress.latest_score || 0).toFixed(2)} /{' '}
                    {Number(studentProgress.latest_max_score || 0).toFixed(2)} (
                    {Number(studentProgress.latest_max_score || 0) > 0
                      ? Number(
                          ((Number(studentProgress.latest_score || 0) /
                            Number(studentProgress.latest_max_score || 1)) *
                            100),
                        ).toFixed(2)
                      : '0.00'}
                    %)
                  </p>
                ) : null}
              </div>

              <form onSubmit={submitPractice} className="space-y-3">
                {practiceQuestions.map((question) => (
                  <div key={question.id} className="rounded-xl border border-primary-200 bg-white p-3">
                    <p className="text-sm font-semibold text-primary-900">
                      {question.sort_order}. {question.prompt}
                    </p>
                    <p className="text-xs text-primary-600">Puntos: {Number(question.points || 0).toFixed(2)}</p>
                    {question.image_url ? (
                      <div className="mt-2">
                        <img
                          src={question.image_url}
                          alt={question.image_name || 'Imagen de la pregunta'}
                          className="max-h-64 rounded-lg border border-primary-200 object-contain"
                        />
                      </div>
                    ) : null}
                    <div className="mt-2 space-y-2">
                      {(question.options || []).map((option) => (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-start gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-900"
                        >
                          <input
                            type="radio"
                            name={`question-${question.id}`}
                            value={option.id}
                            checked={Number(answersByQuestion[question.id]) === Number(option.id)}
                            onChange={() =>
                              setAnswersByQuestion((prev) => ({
                                ...prev,
                                [question.id]: Number(option.id),
                              }))
                            }
                            disabled={!canSubmitPractice}
                          />
                          <span>{option.option_text}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {!practiceQuestions.length ? (
                  <p className="text-sm text-primary-700">Esta practica no tiene preguntas activas.</p>
                ) : null}

                <button
                  type="submit"
                  disabled={!canSubmitPractice}
                  className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingPractice ? 'Enviando...' : 'Enviar practica'}
                </button>

                {!selectedPractice.is_open ? (
                  <p className="text-xs text-red-700">Esta practica no esta habilitada en este momento.</p>
                ) : null}
                {selectedPractice.is_open && remainingAttempts <= 0 ? (
                  <p className="text-xs text-red-700">Ya agotaste tus intentos para esta practica.</p>
                ) : null}
              </form>
            </>
          ) : null}

          {!loadingDetail && !selectedPractice ? (
            <p className="text-sm text-primary-700">Selecciona una practica para resolverla.</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
