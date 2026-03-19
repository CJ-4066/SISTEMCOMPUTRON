import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpenText,
  Building2,
  CalendarRange,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileQuestion,
  ImagePlus,
  ListOrdered,
  MoveDown,
  MoveUp,
  Plus,
  Trash2,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';

const emptyExamForm = {
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  max_attempts: '1',
  is_enabled: false,
};

const createQuestionId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createEmptyQuestionDraft = () => ({
  local_id: createQuestionId(),
  prompt: '',
  points: '1',
  option_count: '4',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  option_e: '',
  correct_key: 'A',
  image_file: null,
});

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

const optionKeysForCount = (count) => (String(count || '4') === '5' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D']);

const buildQuestionOptions = (question) => {
  const optionKeys = optionKeysForCount(question.option_count);
  const textByKey = {
    A: question.option_a,
    B: question.option_b,
    C: question.option_c,
    D: question.option_d,
    E: question.option_e,
  };

  return optionKeys.map((key) => ({
    text: String(textByKey[key] || '').trim(),
    is_correct: question.correct_key === key,
  }));
};

const formatDateLabel = (value) => {
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

const buildWorkspaceSummaryCards = (assignment) => [
  {
    key: 'campus',
    label: 'Sede / modalidad',
    value: assignment?.campus_name || 'Sin sede',
    helper: assignment?.modality || 'PRESENCIAL',
    icon: Building2,
  },
  {
    key: 'schedule',
    label: 'Salon / horario',
    value: assignment?.classroom_info || 'Sin detalle registrado',
    helper: 'Contexto operativo del examen',
    icon: Clock3,
  },
  {
    key: 'period',
    label: 'Periodo',
    value: assignment?.period_name || 'Sin periodo',
    helper: 'Publicación académica vigente',
    icon: CalendarRange,
  },
  {
    key: 'students',
    label: 'Alumnos activos',
    value: String(assignment?.active_students ?? 0),
    helper: 'Alcance actual del salón',
    icon: BookOpenText,
  },
];

export default function ExamBuilderPage() {
  const { assignmentId } = useParams();
  const numericAssignmentId = Number(assignmentId);
  const { hasPermission } = useAuth();

  const canViewAssignments = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW);

  const [assignment, setAssignment] = useState(null);
  const [loadingAssignment, setLoadingAssignment] = useState(false);
  const [savingExam, setSavingExam] = useState(false);
  const [examForm, setExamForm] = useState(emptyExamForm);
  const [questions, setQuestions] = useState([createEmptyQuestionDraft()]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [createdPractice, setCreatedPractice] = useState(null);

  const summaryCards = useMemo(() => buildWorkspaceSummaryCards(assignment), [assignment]);

  const totalPoints = useMemo(
    () => questions.reduce((sum, question) => sum + Number(question.points || 0), 0),
    [questions],
  );

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
      const items = response.data?.items || [];
      const found = items.find((item) => Number(item.assignment_id) === Number(numericAssignmentId)) || null;

      if (!found) {
        setAssignment(null);
        setError('No se encontro este salon en tus asignaciones.');
        return;
      }

      setAssignment(found);
    } catch (requestError) {
      setAssignment(null);
      setError(requestError.response?.data?.message || 'No se pudo cargar la informacion del salon.');
    } finally {
      setLoadingAssignment(false);
    }
  }, [canViewAssignments, numericAssignmentId]);

  useEffect(() => {
    loadAssignment();
  }, [loadAssignment]);

  const updateQuestion = (localId, updater) => {
    setQuestions((current) =>
      current.map((question) => {
        if (question.local_id !== localId) return question;
        return typeof updater === 'function' ? updater(question) : { ...question, ...updater };
      }),
    );
  };

  const addQuestion = () => {
    setQuestions((current) => [...current, createEmptyQuestionDraft()]);
  };

  const duplicateQuestion = (localId) => {
    setQuestions((current) => {
      const index = current.findIndex((item) => item.local_id === localId);
      if (index < 0) return current;
      const source = current[index];
      const duplicated = {
        ...source,
        local_id: createQuestionId(),
        image_file: null,
      };
      const next = current.slice();
      next.splice(index + 1, 0, duplicated);
      return next;
    });
  };

  const removeQuestion = (localId) => {
    setQuestions((current) => {
      if (current.length === 1) {
        return [createEmptyQuestionDraft()];
      }
      return current.filter((question) => question.local_id !== localId);
    });
  };

  const moveQuestion = (localId, direction) => {
    setQuestions((current) => {
      const index = current.findIndex((question) => question.local_id === localId);
      if (index < 0) return current;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;

      const next = current.slice();
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const resetBuilder = () => {
    setExamForm(emptyExamForm);
    setQuestions([createEmptyQuestionDraft()]);
    setCreatedPractice(null);
    setMessage('');
    setError('');
  };

  const saveExam = async (event) => {
    event.preventDefault();
    if (!assignment?.assignment_id) return;

    const payload = {
      assignment_id: Number(assignment.assignment_id),
      title: String(examForm.title || '').trim(),
      description: normalizeNullableInput(examForm.description),
      starts_at: normalizeNullableInput(examForm.starts_at),
      ends_at: normalizeNullableInput(examForm.ends_at),
      max_attempts: Number(examForm.max_attempts || 1),
      is_enabled: Boolean(examForm.is_enabled),
      questions: [],
    };

    if (!payload.title || payload.title.length < 3) {
      setError('El titulo del examen debe tener al menos 3 caracteres.');
      return;
    }

    if (!validateDateRange(payload.starts_at, payload.ends_at)) {
      setError('La fecha/hora de cierre debe ser mayor que la de inicio.');
      return;
    }

    if (!questions.length) {
      setError('Agrega al menos una pregunta al examen.');
      return;
    }

    setSavingExam(true);
    setMessage('');
    setError('');
    try {
      for (let index = 0; index < questions.length; index += 1) {
        const question = questions[index];
        const questionNumber = index + 1;
        const prompt = String(question.prompt || '').trim();
        const points = Number(question.points || 1);
        const options = buildQuestionOptions(question);

        if (!prompt || prompt.length < 3) {
          throw new Error(`La pregunta ${questionNumber} debe tener al menos 3 caracteres.`);
        }

        if (!Number.isFinite(points) || points <= 0) {
          throw new Error(`La pregunta ${questionNumber} debe tener un puntaje válido.`);
        }

        if (options.some((option) => !option.text)) {
          throw new Error(`Completa todas las opciones de la pregunta ${questionNumber}.`);
        }

        const questionPayload = {
          prompt,
          points,
          image_name: null,
          image_url: null,
          options,
        };

        if (question.image_file) {
          questionPayload.image_url = await fileToDataUrl(question.image_file);
          questionPayload.image_name = question.image_file.name || `pregunta-${questionNumber}`;
        }

        payload.questions.push(questionPayload);
      }

      const response = await api.post('/practices', payload);
      const created = response.data?.item || null;
      setCreatedPractice(created);
      setMessage('Examen creado correctamente con todas sus preguntas.');
    } catch (requestError) {
      setCreatedPractice(null);
      setError(requestError.response?.data?.message || requestError.message || 'No se pudo crear el examen.');
    } finally {
      setSavingExam(false);
    }
  };

  if (!canViewAssignments) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Constructor de examen</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este módulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      {message ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loadingAssignment ? <p className="text-sm text-primary-700">Cargando salon...</p> : null}

      {assignment ? (
        <article className="card overflow-hidden p-0">
          <div className="bg-gradient-to-r from-primary-950 via-primary-900 to-primary-800 px-5 py-6 text-white md:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">
                  <FileQuestion className="h-3.5 w-3.5" />
                  <span>Constructor de examen</span>
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                    {assignment.course_name}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm text-primary-100 md:text-base">
                    Crea el examen en una sola pantalla: define el título, programa la disponibilidad y agrega todas las
                    preguntas con opciones de la A a la E e imágenes por pregunta.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {createdPractice?.id ? (
                  <Link
                    to={`/courses/salon/${assignment.assignment_id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Volver al salón</span>
                  </Link>
                ) : null}
                <Link
                  to={`/courses/salon/${assignment.assignment_id}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Volver al salón</span>
                </Link>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.key} className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-200">
                          {item.label}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                        <p className="mt-1 text-xs text-primary-200">{item.helper}</p>
                      </div>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      ) : null}

      {assignment ? (
        <form onSubmit={saveExam} className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-5">
            <article className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-primary-900">Datos del examen</h2>
                  <p className="text-sm text-primary-700">
                    Este examen se guardará usando el módulo actual de prácticas, pero con un constructor dedicado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetBuilder}
                  className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
                >
                  Limpiar formulario
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-primary-900">Título del examen</span>
                  <input
                    className="app-input"
                    value={examForm.title}
                    onChange={(event) => setExamForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Ejemplo: Examen parcial de Power BI"
                    required
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm font-semibold text-primary-900">Intentos máximos</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="app-input"
                    value={examForm.max_attempts}
                    onChange={(event) => setExamForm((prev) => ({ ...prev, max_attempts: event.target.value }))}
                    required
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm font-semibold text-primary-900">Apertura</span>
                  <input
                    type="datetime-local"
                    className="app-input"
                    value={examForm.starts_at}
                    onChange={(event) => setExamForm((prev) => ({ ...prev, starts_at: event.target.value }))}
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm font-semibold text-primary-900">Cierre</span>
                  <input
                    type="datetime-local"
                    className="app-input"
                    value={examForm.ends_at}
                    onChange={(event) => setExamForm((prev) => ({ ...prev, ends_at: event.target.value }))}
                  />
                </label>
              </div>

              <label className="space-y-1">
                <span className="text-sm font-semibold text-primary-900">Descripción</span>
                <textarea
                  className="app-input min-h-24"
                  value={examForm.description}
                  onChange={(event) => setExamForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Instrucciones para el alumno, criterios o notas del examen."
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-primary-800">
                <input
                  type="checkbox"
                  checked={examForm.is_enabled}
                  onChange={(event) => setExamForm((prev) => ({ ...prev, is_enabled: event.target.checked }))}
                />
                Habilitar examen inmediatamente
              </label>
            </article>

            <article className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-primary-900">Preguntas del examen</h2>
                  <p className="text-sm text-primary-700">
                    Puedes agregar todas las preguntas que necesites. Cada pregunta acepta 4 o 5 opciones y una imagen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
                >
                  <Plus className="h-4 w-4" />
                  <span>Agregar pregunta</span>
                </button>
              </div>

              <div className="space-y-4">
                {questions.map((question, index) => {
                  const optionKeys = optionKeysForCount(question.option_count);
                  const canMoveUp = index > 0;
                  const canMoveDown = index < questions.length - 1;

                  return (
                    <section key={question.local_id} className="rounded-2xl border border-primary-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-600">
                            Pregunta {index + 1}
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-primary-900">
                            Configuración de la pregunta
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => moveQuestion(question.local_id, 'up')}
                            disabled={!canMoveUp}
                            className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="inline-flex items-center gap-1">
                              <MoveUp className="h-3.5 w-3.5" />
                              <span>Subir</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveQuestion(question.local_id, 'down')}
                            disabled={!canMoveDown}
                            className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="inline-flex items-center gap-1">
                              <MoveDown className="h-3.5 w-3.5" />
                              <span>Bajar</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateQuestion(question.local_id)}
                            className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs font-semibold text-primary-800 hover:bg-primary-50"
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeQuestion(question.local_id)}
                            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            <span className="inline-flex items-center gap-1">
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Eliminar</span>
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_180px]">
                        <label className="space-y-1 md:col-span-2">
                          <span className="text-sm font-semibold text-primary-900">Enunciado</span>
                          <textarea
                            className="app-input min-h-24"
                            value={question.prompt}
                            onChange={(event) => updateQuestion(question.local_id, { prompt: event.target.value })}
                            placeholder="Escribe la pregunta del examen"
                            required
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-sm font-semibold text-primary-900">Puntaje</span>
                          <input
                            type="number"
                            min={0.1}
                            max={100}
                            step="0.1"
                            className="app-input"
                            value={question.points}
                            onChange={(event) => updateQuestion(question.local_id, { points: event.target.value })}
                            required
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-sm font-semibold text-primary-900">Opciones</span>
                          <select
                            className="app-input"
                            value={question.option_count}
                            onChange={(event) =>
                              updateQuestion(question.local_id, (current) => {
                                const nextCount = event.target.value;
                                const nextCorrect =
                                  nextCount === '4' && current.correct_key === 'E' ? 'D' : current.correct_key;
                                return {
                                  ...current,
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

                        <label className="space-y-1">
                          <span className="text-sm font-semibold text-primary-900">Respuesta correcta</span>
                          <select
                            className="app-input"
                            value={question.correct_key}
                            onChange={(event) => updateQuestion(question.local_id, { correct_key: event.target.value })}
                          >
                            {optionKeys.map((key) => (
                              <option key={key} value={key}>
                                Opción {key}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-sm font-semibold text-primary-900">Opción A</span>
                          <input
                            className="app-input"
                            value={question.option_a}
                            onChange={(event) => updateQuestion(question.local_id, { option_a: event.target.value })}
                            placeholder="Respuesta A"
                            required
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-sm font-semibold text-primary-900">Opción B</span>
                          <input
                            className="app-input"
                            value={question.option_b}
                            onChange={(event) => updateQuestion(question.local_id, { option_b: event.target.value })}
                            placeholder="Respuesta B"
                            required
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-sm font-semibold text-primary-900">Opción C</span>
                          <input
                            className="app-input"
                            value={question.option_c}
                            onChange={(event) => updateQuestion(question.local_id, { option_c: event.target.value })}
                            placeholder="Respuesta C"
                            required
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-sm font-semibold text-primary-900">Opción D</span>
                          <input
                            className="app-input"
                            value={question.option_d}
                            onChange={(event) => updateQuestion(question.local_id, { option_d: event.target.value })}
                            placeholder="Respuesta D"
                            required
                          />
                        </label>
                        {question.option_count === '5' ? (
                          <label className="space-y-1 md:col-span-2">
                            <span className="text-sm font-semibold text-primary-900">Opción E</span>
                            <input
                              className="app-input"
                              value={question.option_e}
                              onChange={(event) => updateQuestion(question.local_id, { option_e: event.target.value })}
                              placeholder="Respuesta E"
                              required
                            />
                          </label>
                        ) : null}
                      </div>

                      <label className="mt-4 block space-y-1">
                        <span className="text-sm font-semibold text-primary-900">Imagen de la pregunta</span>
                        <span className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800">
                          <ImagePlus className="h-4 w-4" />
                          <span>{question.image_file ? question.image_file.name : 'Seleccionar imagen opcional'}</span>
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="mt-2 block w-full text-xs"
                          onChange={(event) =>
                            updateQuestion(question.local_id, {
                              image_file: event.target.files?.[0] || null,
                            })
                          }
                        />
                      </label>
                    </section>
                  );
                })}
              </div>
            </article>
          </div>

          <aside className="space-y-4">
            <article className="card space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-primary-900">Resumen</h2>
                <p className="text-sm text-primary-700">Control rápido del examen antes de publicarlo.</p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl bg-primary-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">Preguntas</p>
                  <p className="mt-2 text-2xl font-semibold text-primary-900">{questions.length}</p>
                </div>
                <div className="rounded-2xl bg-primary-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">Puntaje total</p>
                  <p className="mt-2 text-2xl font-semibold text-primary-900">{totalPoints.toFixed(1)}</p>
                </div>
                <div className="rounded-2xl bg-primary-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">Apertura</p>
                  <p className="mt-2 text-sm font-semibold text-primary-900">{formatDateLabel(examForm.starts_at)}</p>
                </div>
                <div className="rounded-2xl bg-primary-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">Cierre</p>
                  <p className="mt-2 text-sm font-semibold text-primary-900">{formatDateLabel(examForm.ends_at)}</p>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingExam}
                className="w-full rounded-xl bg-accent-600 px-4 py-3 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{savingExam ? 'Guardando examen...' : 'Guardar examen completo'}</span>
                </span>
              </button>
            </article>

            <article className="card space-y-3">
              <div className="flex items-center gap-2">
                <ListOrdered className="h-4 w-4 text-primary-700" />
                <h3 className="text-base font-semibold text-primary-900">Checklist</h3>
              </div>
              <ul className="space-y-2 text-sm text-primary-700">
                <li>Define un título claro para identificar el examen.</li>
                <li>Programa apertura y cierre si quieres publicación automática.</li>
                <li>Cada pregunta admite entre 4 y 5 opciones con una sola correcta.</li>
                <li>Puedes adjuntar una imagen por pregunta.</li>
                <li>El guardado crea el examen y todas sus preguntas en una sola operación.</li>
              </ul>
            </article>
          </aside>
        </form>
      ) : null}
    </section>
  );
}
