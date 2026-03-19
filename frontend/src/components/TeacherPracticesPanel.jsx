import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';

const emptyPracticeForm = {
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  max_attempts: '1',
  is_enabled: false,
};

const emptyQuestionForm = {
  prompt: '',
  points: '1',
  option_count: '4',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  option_e: '',
  correct_key: 'A',
};

const PRACTICE_STATE_META = {
  OPEN: { label: 'Abierta', className: 'bg-primary-100 text-primary-800' },
  UPCOMING: { label: 'Programada', className: 'bg-amber-100 text-amber-800' },
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

const toDateTimeLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - tzOffsetMs);
  return localDate.toISOString().slice(0, 16);
};

const normalizeNullableInput = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed || null;
};

const validateDateRange = (startsAt, endsAt) => {
  if (!startsAt || !endsAt) return true;
  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;
  return endDate > startDate;
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    reader.readAsDataURL(file);
  });

const buildQuestionOptions = (form) => {
  const optionKeys = String(form.option_count || '4') === '5' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  const textByKey = {
    A: form.option_a,
    B: form.option_b,
    C: form.option_c,
    D: form.option_d,
    E: form.option_e,
  };

  return optionKeys.map((key) => ({
    text: String(textByKey[key] || '').trim(),
    is_correct: form.correct_key === key,
  }));
};

export default function TeacherPracticesPanel({ assignment }) {
  const assignmentId = Number(assignment?.assignment_id || 0);
  const location = useLocation();

  const [practices, setPractices] = useState([]);
  const [selectedPracticeId, setSelectedPracticeId] = useState(null);
  const [selectedPractice, setSelectedPractice] = useState(null);
  const [practiceQuestions, setPracticeQuestions] = useState([]);
  const [practiceResults, setPracticeResults] = useState([]);

  const [loadingPractices, setLoadingPractices] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(emptyPracticeForm);
  const [editForm, setEditForm] = useState(emptyPracticeForm);
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm);
  const [questionImageFile, setQuestionImageFile] = useState(null);

  const [creatingPractice, setCreatingPractice] = useState(false);
  const [savingPractice, setSavingPractice] = useState(false);
  const [deletingPractice, setDeletingPractice] = useState(false);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [updatingQuestionId, setUpdatingQuestionId] = useState(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const questionOptionKeys = useMemo(
    () => (String(questionForm.option_count || '4') === '5' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D']),
    [questionForm.option_count],
  );

  const syncEditFormFromPractice = useCallback((practice) => {
    if (!practice) {
      setEditForm(emptyPracticeForm);
      return;
    }

    setEditForm({
      title: String(practice.title || ''),
      description: String(practice.description || ''),
      starts_at: toDateTimeLocalInput(practice.starts_at),
      ends_at: toDateTimeLocalInput(practice.ends_at),
      max_attempts: String(practice.max_attempts || 1),
      is_enabled: Boolean(practice.is_enabled),
    });
  }, []);

  const loadPractices = useCallback(async () => {
    if (!assignmentId) {
      setPractices([]);
      setSelectedPracticeId(null);
      setSelectedPractice(null);
      setPracticeQuestions([]);
      setPracticeResults([]);
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
      setPracticeResults([]);
    } finally {
      setLoadingPractices(false);
    }
  }, [assignmentId]);

  const loadPracticeDetail = useCallback(
    async (practiceId) => {
      if (!practiceId) {
        setSelectedPractice(null);
        setPracticeQuestions([]);
        setPracticeResults([]);
        setEditForm(emptyPracticeForm);
        return;
      }

      setLoadingDetail(true);
      setError('');
      try {
        const [detailResponse, resultsResponse] = await Promise.all([
          api.get(`/practices/${practiceId}`),
          api.get(`/practices/${practiceId}/results`),
        ]);

        const practiceItem = detailResponse.data?.item || null;
        const questions = detailResponse.data?.questions || [];
        const results = resultsResponse.data?.items || [];

        setSelectedPractice(practiceItem);
        setPracticeQuestions(questions);
        setPracticeResults(results);
        syncEditFormFromPractice(practiceItem);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'No se pudo cargar el detalle de la practica.');
        setSelectedPractice(null);
        setPracticeQuestions([]);
        setPracticeResults([]);
      } finally {
        setLoadingDetail(false);
      }
    },
    [syncEditFormFromPractice],
  );

  const refreshResults = useCallback(async () => {
    if (!selectedPracticeId) return;

    setLoadingResults(true);
    setError('');
    try {
      const response = await api.get(`/practices/${selectedPracticeId}/results`);
      setPracticeResults(response.data?.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar los resultados de la practica.');
    } finally {
      setLoadingResults(false);
    }
  }, [selectedPracticeId]);

  useEffect(() => {
    loadPractices();
  }, [loadPractices]);

  useEffect(() => {
    loadPracticeDetail(selectedPracticeId);
  }, [loadPracticeDetail, selectedPracticeId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('newPractice') !== '1') return;

    setShowCreateForm(true);
    if (typeof document !== 'undefined') {
      const panel = document.getElementById('teacher-practices-panel');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedPracticeId = Number(params.get('practiceId') || 0);
    const builderSaved = params.get('builderSaved') === '1';

    if (requestedPracticeId > 0) {
      setSelectedPracticeId(requestedPracticeId);
    }
    if (builderSaved) {
      setMessage('Examen creado correctamente y vinculado al salón.');
    }
  }, [location.search]);

  const openCreateInNewTab = () => {
    if (!assignmentId || typeof window === 'undefined') return;
    const route = `/courses/salon/${assignmentId}/examen/nuevo`;
    window.open(route, '_blank', 'noopener,noreferrer');
  };

  const createPractice = async (event) => {
    event.preventDefault();
    if (!assignmentId) return;

    const payload = {
      assignment_id: assignmentId,
      title: String(createForm.title || '').trim(),
      description: normalizeNullableInput(createForm.description),
      starts_at: normalizeNullableInput(createForm.starts_at),
      ends_at: normalizeNullableInput(createForm.ends_at),
      max_attempts: Number(createForm.max_attempts || 1),
      is_enabled: Boolean(createForm.is_enabled),
    };

    if (!payload.title || payload.title.length < 3) {
      setError('El titulo de la practica debe tener al menos 3 caracteres.');
      return;
    }
    if (!validateDateRange(payload.starts_at, payload.ends_at)) {
      setError('La fecha/hora de cierre debe ser mayor que la de inicio.');
      return;
    }

    setCreatingPractice(true);
    setMessage('');
    setError('');
    try {
      const response = await api.post('/practices', payload);
      const createdId = Number(response.data?.item?.id || 0);
      setMessage('Practica creada correctamente.');
      setCreateForm(emptyPracticeForm);
      setShowCreateForm(false);
      await loadPractices();
      if (createdId) setSelectedPracticeId(createdId);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo crear la practica.');
    } finally {
      setCreatingPractice(false);
    }
  };

  const savePractice = async () => {
    if (!selectedPracticeId) return;

    const payload = {
      title: String(editForm.title || '').trim(),
      description: normalizeNullableInput(editForm.description),
      starts_at: normalizeNullableInput(editForm.starts_at),
      ends_at: normalizeNullableInput(editForm.ends_at),
      max_attempts: Number(editForm.max_attempts || 1),
      is_enabled: Boolean(editForm.is_enabled),
    };

    if (!payload.title || payload.title.length < 3) {
      setError('El titulo de la practica debe tener al menos 3 caracteres.');
      return;
    }
    if (!validateDateRange(payload.starts_at, payload.ends_at)) {
      setError('La fecha/hora de cierre debe ser mayor que la de inicio.');
      return;
    }

    setSavingPractice(true);
    setMessage('');
    setError('');
    try {
      await api.put(`/practices/${selectedPracticeId}`, payload);
      setMessage('Configuracion de practica actualizada.');
      await Promise.all([loadPractices(), loadPracticeDetail(selectedPracticeId)]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo actualizar la practica.');
    } finally {
      setSavingPractice(false);
    }
  };

  const deletePractice = async () => {
    if (!selectedPracticeId) return;
    const confirmed = window.confirm('Se eliminara esta practica con sus preguntas e intentos. ¿Continuar?');
    if (!confirmed) return;

    setDeletingPractice(true);
    setMessage('');
    setError('');
    try {
      await api.delete(`/practices/${selectedPracticeId}`);
      setMessage('Practica eliminada.');
      setSelectedPracticeId(null);
      setSelectedPractice(null);
      setPracticeQuestions([]);
      setPracticeResults([]);
      await loadPractices();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo eliminar la practica.');
    } finally {
      setDeletingPractice(false);
    }
  };

  const createQuestion = async (event) => {
    event.preventDefault();
    if (!selectedPracticeId) return;

    const optionCount = Number(questionForm.option_count || 4);
    const payload = {
      prompt: String(questionForm.prompt || '').trim(),
      points: Number(questionForm.points || 1),
      options: buildQuestionOptions(questionForm),
      image_name: null,
      image_url: null,
    };

    if (!payload.prompt || payload.prompt.length < 3) {
      setError('La pregunta debe tener al menos 3 caracteres.');
      return;
    }
    if (payload.options.some((option) => !option.text)) {
      setError(`Completa las ${optionCount} opciones antes de guardar la pregunta.`);
      return;
    }

    setCreatingQuestion(true);
    setMessage('');
    setError('');
    try {
      if (questionImageFile) {
        payload.image_url = await fileToDataUrl(questionImageFile);
        payload.image_name = questionImageFile.name || 'pregunta';
      }

      await api.post(`/practices/${selectedPracticeId}/questions`, payload);
      setMessage('Pregunta creada.');
      setQuestionForm(emptyQuestionForm);
      setQuestionImageFile(null);
      await Promise.all([loadPractices(), loadPracticeDetail(selectedPracticeId)]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo crear la pregunta.');
    } finally {
      setCreatingQuestion(false);
    }
  };

  const toggleQuestionState = async (question) => {
    if (!question?.id) return;

    setUpdatingQuestionId(question.id);
    setMessage('');
    setError('');
    try {
      await api.put(`/questions/${question.id}`, {
        is_active: !question.is_active,
      });
      setMessage(question.is_active ? 'Pregunta deshabilitada.' : 'Pregunta habilitada.');
      await Promise.all([loadPractices(), loadPracticeDetail(selectedPracticeId)]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo actualizar la pregunta.');
    } finally {
      setUpdatingQuestionId(null);
    }
  };

  const deleteQuestion = async (question) => {
    if (!question?.id) return;
    const confirmed = window.confirm('Se eliminara la pregunta y sus respuestas registradas. ¿Continuar?');
    if (!confirmed) return;

    setDeletingQuestionId(question.id);
    setMessage('');
    setError('');
    try {
      await api.delete(`/questions/${question.id}`);
      setMessage('Pregunta eliminada.');
      await Promise.all([loadPractices(), loadPracticeDetail(selectedPracticeId)]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo eliminar la pregunta.');
    } finally {
      setDeletingQuestionId(null);
    }
  };

  return (
    <article id="teacher-practices-panel" className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-primary-900">Exámenes y prácticas</h2>
          <p className="text-xs text-primary-700">
            Crea preguntas y respuestas, programa disponibilidad por fecha/hora y revisa resultados automaticos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreateInNewTab}
            className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
          >
            Crear examen en pestaña
          </button>
          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
          >
            {showCreateForm ? 'Cerrar formulario' : 'Crear aqui'}
          </button>
        </div>
      </div>

      {message ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {showCreateForm ? (
        <form onSubmit={createPractice} className="panel-soft space-y-3">
          <h3 className="text-base font-semibold text-primary-900">Crear practica</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="app-input"
              placeholder="Titulo de la practica"
              value={createForm.title}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
            <input
              type="number"
              min={1}
              max={20}
              className="app-input"
              placeholder="Intentos maximos"
              value={createForm.max_attempts}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, max_attempts: event.target.value }))}
              required
            />
            <input
              type="datetime-local"
              className="app-input"
              value={createForm.starts_at}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, starts_at: event.target.value }))}
            />
            <input
              type="datetime-local"
              className="app-input"
              value={createForm.ends_at}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, ends_at: event.target.value }))}
            />
          </div>
          <textarea
            className="app-input min-h-24"
            placeholder="Descripcion (opcional)"
            value={createForm.description}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <label className="inline-flex items-center gap-2 text-sm text-primary-800">
            <input
              type="checkbox"
              checked={createForm.is_enabled}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, is_enabled: event.target.checked }))}
            />
            Habilitar inmediatamente
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={creatingPractice}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingPractice ? 'Creando...' : 'Crear practica'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setCreateForm(emptyPracticeForm);
              }}
              className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-primary-900">Practicas del salon</h3>
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
                  Preguntas: {Number(practice.question_count || 0)} | Intentos enviados:{' '}
                  {Number(practice.attempts_count || 0)}
                </p>
                <p className="text-[11px] text-primary-600">
                  Inicio: {formatDateTime(practice.starts_at)} | Cierre: {formatDateTime(practice.ends_at)}
                </p>
              </button>
            );
          })}
          {!loadingPractices && !practices.length ? (
            <p className="text-sm text-primary-700">Todavia no hay practicas en este salon.</p>
          ) : null}
        </div>

        <div className="space-y-4">
          {loadingDetail ? <p className="text-sm text-primary-700">Cargando detalle de practica...</p> : null}

          {!loadingDetail && selectedPractice ? (
            <>
              <div className="panel-soft space-y-3">
                <h3 className="text-base font-semibold text-primary-900">Configuracion de practica</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="app-input"
                    placeholder="Titulo"
                    value={editForm.title}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                  />
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="app-input"
                    placeholder="Intentos maximos"
                    value={editForm.max_attempts}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, max_attempts: event.target.value }))}
                  />
                  <input
                    type="datetime-local"
                    className="app-input"
                    value={editForm.starts_at}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, starts_at: event.target.value }))}
                  />
                  <input
                    type="datetime-local"
                    className="app-input"
                    value={editForm.ends_at}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, ends_at: event.target.value }))}
                  />
                </div>
                <textarea
                  className="app-input min-h-24"
                  placeholder="Descripcion"
                  value={editForm.description}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                />
                <label className="inline-flex items-center gap-2 text-sm text-primary-800">
                  <input
                    type="checkbox"
                    checked={editForm.is_enabled}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, is_enabled: event.target.checked }))}
                  />
                  Practica habilitada
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={savePractice}
                    disabled={savingPractice}
                    className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingPractice ? 'Guardando...' : 'Guardar configuracion'}
                  </button>
                  <button
                    type="button"
                    onClick={refreshResults}
                    disabled={loadingResults}
                    className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingResults ? 'Actualizando resultados...' : 'Actualizar resultados'}
                  </button>
                  <button
                    type="button"
                    onClick={deletePractice}
                    disabled={deletingPractice}
                    className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingPractice ? 'Eliminando...' : 'Eliminar practica'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-primary-900">Preguntas</h3>
                {practiceQuestions.map((question) => (
                  <div key={question.id} className="rounded-xl border border-primary-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-primary-900">
                          {question.sort_order}. {question.prompt}
                        </p>
                        <p className="text-xs text-primary-600">Puntos: {Number(question.points || 0).toFixed(2)}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          question.is_active ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {question.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    {question.image_url ? (
                      <div className="mt-2">
                        <img
                          src={question.image_url}
                          alt={question.image_name || 'Imagen de la pregunta'}
                          className="max-h-56 rounded-lg border border-primary-200 object-contain"
                        />
                      </div>
                    ) : null}
                    <div className="mt-2 space-y-1">
                      {(question.options || []).map((option) => (
                        <p
                          key={option.id}
                          className={`rounded-lg px-2 py-1 text-xs ${
                            option.is_correct ? 'bg-accent-100 text-accent-900' : 'bg-primary-50 text-primary-800'
                          }`}
                        >
                          {option.option_text}
                        </p>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleQuestionState(question)}
                        disabled={updatingQuestionId === question.id}
                        className="rounded-lg border border-primary-300 bg-white px-3 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updatingQuestionId === question.id
                          ? 'Guardando...'
                          : question.is_active
                            ? 'Deshabilitar'
                            : 'Habilitar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteQuestion(question)}
                        disabled={deletingQuestionId === question.id}
                        className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingQuestionId === question.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </div>
                ))}
                {!practiceQuestions.length ? (
                  <p className="text-sm text-primary-700">Esta practica aun no tiene preguntas.</p>
                ) : null}
              </div>

              <form onSubmit={createQuestion} className="panel-soft space-y-3">
                <h3 className="text-base font-semibold text-primary-900">Agregar pregunta</h3>
                <textarea
                  className="app-input min-h-20"
                  placeholder="Enunciado de la pregunta"
                  value={questionForm.prompt}
                  onChange={(event) => setQuestionForm((prev) => ({ ...prev, prompt: event.target.value }))}
                  required
                />
                <input
                  type="number"
                  min={0.1}
                  max={100}
                  step="0.1"
                  className="app-input"
                  placeholder="Puntaje"
                  value={questionForm.points}
                  onChange={(event) => setQuestionForm((prev) => ({ ...prev, points: event.target.value }))}
                  required
                />
                <label className="space-y-1 text-sm text-primary-800">
                  <span className="font-medium">Cantidad de opciones</span>
                  <select
                    className="app-input"
                    value={questionForm.option_count}
                    onChange={(event) =>
                      setQuestionForm((prev) => {
                        const nextCount = event.target.value;
                        const nextCorrect = nextCount === '4' && prev.correct_key === 'E' ? 'D' : prev.correct_key;
                        return {
                          ...prev,
                          option_count: nextCount,
                          correct_key: nextCorrect,
                        };
                      })
                    }
                  >
                    <option value="4">4 opciones</option>
                    <option value="5">5 opciones</option>
                  </select>
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="app-input"
                    placeholder="Opcion A"
                    value={questionForm.option_a}
                    onChange={(event) => setQuestionForm((prev) => ({ ...prev, option_a: event.target.value }))}
                    required
                  />
                  <input
                    className="app-input"
                    placeholder="Opcion B"
                    value={questionForm.option_b}
                    onChange={(event) => setQuestionForm((prev) => ({ ...prev, option_b: event.target.value }))}
                    required
                  />
                  <input
                    className="app-input"
                    placeholder="Opcion C"
                    value={questionForm.option_c}
                    onChange={(event) => setQuestionForm((prev) => ({ ...prev, option_c: event.target.value }))}
                    required
                  />
                  <input
                    className="app-input"
                    placeholder="Opcion D"
                    value={questionForm.option_d}
                    onChange={(event) => setQuestionForm((prev) => ({ ...prev, option_d: event.target.value }))}
                    required
                  />
                  {questionForm.option_count === '5' ? (
                    <input
                      className="app-input sm:col-span-2"
                      placeholder="Opcion E"
                      value={questionForm.option_e}
                      onChange={(event) => setQuestionForm((prev) => ({ ...prev, option_e: event.target.value }))}
                      required
                    />
                  ) : null}
                </div>
                <label className="text-xs font-semibold text-primary-800">
                  Imagen de la pregunta (opcional)
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full text-xs"
                    onChange={(event) => setQuestionImageFile(event.target.files?.[0] || null)}
                  />
                </label>
                {questionImageFile ? (
                  <p className="text-xs text-primary-700">Imagen seleccionada: {questionImageFile.name}</p>
                ) : null}
                <label className="space-y-1 text-sm text-primary-800">
                  <span className="font-medium">Respuesta correcta</span>
                  <select
                    className="app-input"
                    value={questionForm.correct_key}
                    onChange={(event) => setQuestionForm((prev) => ({ ...prev, correct_key: event.target.value }))}
                  >
                    {questionOptionKeys.map((key) => (
                      <option key={key} value={key}>
                        Opcion {key}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={creatingQuestion}
                  className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingQuestion ? 'Guardando pregunta...' : 'Agregar pregunta'}
                </button>
              </form>

              <div className="space-y-2">
                <h3 className="text-base font-semibold text-primary-900">Resultados de intentos</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-primary-600">
                        <th className="pb-2 pr-3">Alumno</th>
                        <th className="pb-2 pr-3">Documento</th>
                        <th className="pb-2 pr-3">Intento</th>
                        <th className="pb-2 pr-3">Puntaje</th>
                        <th className="pb-2">Enviado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {practiceResults.map((result) => (
                        <tr key={result.id} className="border-t border-primary-100">
                          <td className="py-2 pr-3 font-medium">
                            {result.last_name}, {result.first_name}
                          </td>
                          <td className="py-2 pr-3">{result.document_number || '-'}</td>
                          <td className="py-2 pr-3">#{result.attempt_number}</td>
                          <td className="py-2 pr-3">
                            {Number(result.score || 0).toFixed(2)} / {Number(result.max_score || 0).toFixed(2)} (
                            {Number(result.percentage || 0).toFixed(2)}%)
                          </td>
                          <td className="py-2">{formatDateTime(result.submitted_at)}</td>
                        </tr>
                      ))}
                      {!practiceResults.length ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-center text-sm text-primary-700">
                            Todavia no hay intentos enviados.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}

          {!loadingDetail && !selectedPractice ? (
            <p className="text-sm text-primary-700">Selecciona una practica para configurar preguntas y revisar resultados.</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
