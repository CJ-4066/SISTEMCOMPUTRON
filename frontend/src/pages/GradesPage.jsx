import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import StudentGradesPage from './StudentGradesPage';

const getTodayIsoDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const createAssessmentDefaults = () => ({
  teacher_assignment_id: '',
  course_campus_id: '',
  period_id: '',
  title: '',
  assessment_date: getTodayIsoDate(),
  weight: 20,
});

const gradeDefaults = {
  assessment_id: '',
  student_id: '',
  score: '',
};

const formatScore = (value) => Number(value || 0).toFixed(2);
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

const primaryButtonClass =
  'grades-btn grades-btn-primary rounded-xl px-4 py-2 text-sm font-semibold text-white';
const accentButtonClass =
  'grades-btn grades-btn-accent rounded-xl px-4 py-2 text-sm font-semibold text-white';
const secondaryButtonClass =
  'grades-btn grades-btn-secondary rounded-xl px-4 py-2 text-sm font-semibold';
const miniSecondaryButtonClass =
  'grades-mini-btn rounded-lg border border-primary-200 bg-white px-2.5 py-1 text-xs font-semibold text-primary-800';
const miniDangerButtonClass =
  'grades-mini-btn rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700';

function StaffGradesPage() {
  const { hasPermission, user } = useAuth();

  const [courses, setCourses] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [students, setStudents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [studentGrades, setStudentGrades] = useState([]);
  const [teacherAssignments, setTeacherAssignments] = useState([]);

  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');

  const [assessmentForm, setAssessmentForm] = useState(createAssessmentDefaults);
  const [gradeForm, setGradeForm] = useState(gradeDefaults);

  const [editingAssessmentId, setEditingAssessmentId] = useState(null);
  const [editingGradeId, setEditingGradeId] = useState(null);

  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [showGradeForm, setShowGradeForm] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canViewAssessments = hasPermission(PERMISSIONS.ACADEMIC_ASSESSMENTS_VIEW);
  const canManageAssessments = hasPermission(PERMISSIONS.ACADEMIC_ASSESSMENTS_MANAGE);
  const canViewGrades = hasPermission(PERMISSIONS.ACADEMIC_GRADES_VIEW);
  const canManageGrades = hasPermission(PERMISSIONS.ACADEMIC_GRADES_MANAGE);

  const canViewCourses = hasPermission(PERMISSIONS.COURSES_VIEW);
  const canViewPeriods = hasPermission(PERMISSIONS.PERIODS_VIEW);
  const canViewStudents = hasPermission(PERMISSIONS.STUDENTS_VIEW);
  const canViewTeacherAssignments = hasPermission(PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW);
  const isDocenteProfile = (user?.roles || []).length === 1 && (user?.roles || []).includes('DOCENTE');

  const loadData = useCallback(async () => {
    try {
      const [coursesRes, periodsRes, studentsRes, assessmentsRes, teacherAssignmentsRes] = await Promise.all([
        canViewCourses ? api.get('/courses') : Promise.resolve(null),
        canViewPeriods ? api.get('/catalogs/periods') : Promise.resolve(null),
        canViewStudents ? api.get('/students') : Promise.resolve(null),
        canViewAssessments ? api.get('/academic/assessments') : Promise.resolve(null),
        canViewTeacherAssignments ? api.get('/teachers/my-courses') : Promise.resolve(null),
      ]);

      const nextTeacherAssignments = teacherAssignmentsRes?.data?.items || [];
      const allowedAssessmentKeys = new Set(
        nextTeacherAssignments.map(
          (assignment) => `${Number(assignment.course_campus_id)}:${Number(assignment.period_id)}`,
        ),
      );

      let nextStudents = studentsRes?.data?.items || [];
      if (isDocenteProfile && canViewTeacherAssignments) {
        const assignmentStudentsResults = await Promise.allSettled(
          nextTeacherAssignments.map((assignment) =>
            api.get(`/teachers/my-courses/${assignment.assignment_id}/students`),
          ),
        );

        const teacherStudentsMap = new Map();
        for (const result of assignmentStudentsResults) {
          if (result.status !== 'fulfilled') continue;
          const assignmentStudents = result.value?.data?.item?.students || [];
          for (const student of assignmentStudents) {
            const studentId = Number(student.student_id);
            if (!studentId) continue;
            teacherStudentsMap.set(studentId, {
              id: studentId,
              first_name: student.first_name || '',
              last_name: student.last_name || '',
              document_number: student.document_number || '',
            });
          }
        }

        nextStudents = Array.from(teacherStudentsMap.values()).sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'es', {
            sensitivity: 'base',
          }),
        );
      }

      let nextAssessments = assessmentsRes?.data?.items || [];
      if (isDocenteProfile) {
        nextAssessments = nextAssessments.filter((assessment) =>
          allowedAssessmentKeys.has(`${Number(assessment.course_campus_id)}:${Number(assessment.period_id)}`),
        );
      }

      setCourses(coursesRes?.data?.items || []);
      setPeriods(periodsRes?.data?.items || []);
      setStudents(nextStudents);
      setAssessments(nextAssessments);
      setTeacherAssignments(nextTeacherAssignments);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar el módulo de notas.');
    }
  }, [
    canViewAssessments,
    canViewCourses,
    canViewPeriods,
    canViewStudents,
    canViewTeacherAssignments,
    isDocenteProfile,
  ]);

  const loadStudentGrades = useCallback(async () => {
    if (!canViewGrades || !selectedStudent) {
      setStudentGrades([]);
      return;
    }

    if (isDocenteProfile && !students.some((student) => Number(student.id) === Number(selectedStudent))) {
      setStudentGrades([]);
      return;
    }

    try {
      const params = selectedPeriod ? { period_id: Number(selectedPeriod) } : undefined;
      const response = await api.get(`/academic/students/${selectedStudent}/grades`, { params });
      setStudentGrades(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar el historial de notas.');
    }
  }, [canViewGrades, isDocenteProfile, selectedPeriod, selectedStudent, students]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStudentGrades();
  }, [loadStudentGrades]);

  useEffect(() => {
    if (!selectedStudent) return;
    const exists = students.some((student) => Number(student.id) === Number(selectedStudent));
    if (exists) return;
    setSelectedStudent('');
    setStudentGrades([]);
  }, [selectedStudent, students]);

  const offerings = useMemo(() => {
    const rows = [];
    for (const course of courses) {
      for (const offering of course.offerings || []) {
        rows.push({
          id: offering.offering_id,
          label: `${course.name} - ${offering.campus_name}`,
        });
      }
    }
    return rows;
  }, [courses]);

  const teacherCourseOptions = useMemo(() => {
    const grouped = new Map();

    for (const assignment of teacherAssignments) {
      const courseId = Number(assignment.course_id);
      if (grouped.has(courseId)) continue;

      grouped.set(courseId, {
        assignment_id: Number(assignment.assignment_id),
        course_campus_id: Number(assignment.course_campus_id),
        period_id: Number(assignment.period_id),
        label: assignment.course_name,
      });
    }

    return Array.from(grouped.values()).sort((a, b) =>
      String(a.label || '').localeCompare(String(b.label || ''), 'es', { sensitivity: 'base' }),
    );
  }, [teacherAssignments]);

  const assessmentOptionsForGrades = useMemo(() => {
    if (!selectedPeriod) return assessments;
    return assessments.filter((assessment) => Number(assessment.period_id) === Number(selectedPeriod));
  }, [assessments, selectedPeriod]);

  const selectedStudentName = useMemo(() => {
    if (!selectedStudent) return null;
    const found = students.find((student) => Number(student.id) === Number(selectedStudent));
    return found ? `${found.first_name} ${found.last_name}` : null;
  }, [selectedStudent, students]);

  const gradeStats = useMemo(() => {
    if (!studentGrades.length) {
      return {
        count: 0,
        simpleAverage: 0,
        weightedAverage: 0,
      };
    }

    const count = studentGrades.length;
    const sum = studentGrades.reduce((acc, grade) => acc + Number(grade.score || 0), 0);
    const simpleAverage = sum / count;

    const weighted = studentGrades.reduce(
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
  }, [studentGrades]);

  const startAssessmentCreate = () => {
    setEditingAssessmentId(null);
    setAssessmentForm(createAssessmentDefaults());
    setShowAssessmentForm((prev) => !prev);
  };

  const startAssessmentEdit = (assessment) => {
    setMessage('');
    setError('');
    const linkedTeacherCourse =
      teacherCourseOptions.find(
        (item) =>
          Number(item.course_campus_id) === Number(assessment.course_campus_id) &&
          Number(item.period_id) === Number(assessment.period_id),
      ) ||
      teacherCourseOptions.find(
        (item) => Number(item.course_campus_id) === Number(assessment.course_campus_id),
      ) ||
      null;

    setEditingAssessmentId(assessment.id);
    setAssessmentForm({
      teacher_assignment_id: linkedTeacherCourse ? String(linkedTeacherCourse.assignment_id) : '',
      course_campus_id: String(assessment.course_campus_id),
      period_id: String(assessment.period_id),
      title: assessment.title || '',
      assessment_date: assessment.assessment_date || '',
      weight: Number(assessment.weight ?? 20),
    });
    setShowAssessmentForm(true);
  };

  const submitAssessment = async (event) => {
    event.preventDefault();
    if (!canManageAssessments) return;

    setMessage('');
    setError('');

    try {
      const selectedTeacherCourse = teacherCourseOptions.find(
        (item) => String(item.assignment_id) === String(assessmentForm.teacher_assignment_id),
      );
      const resolvedCourseCampusId = selectedTeacherCourse
        ? Number(selectedTeacherCourse.course_campus_id)
        : Number(assessmentForm.course_campus_id);
      const resolvedPeriodId = selectedTeacherCourse
        ? Number(selectedTeacherCourse.period_id)
        : Number(assessmentForm.period_id);

      if (!resolvedCourseCampusId || !resolvedPeriodId) {
        setError('Selecciona un curso valido para registrar la evaluación.');
        return;
      }

      const payload = {
        course_campus_id: resolvedCourseCampusId,
        period_id: resolvedPeriodId,
        title: assessmentForm.title,
        assessment_date: assessmentForm.assessment_date,
        weight: Number(assessmentForm.weight),
      };

      if (editingAssessmentId) {
        await api.put(`/academic/assessments/${editingAssessmentId}`, payload);
        setMessage('Evaluación actualizada correctamente.');
      } else {
        await api.post('/academic/assessments', payload);
        setMessage('Evaluación creada correctamente.');
      }

      setAssessmentForm(createAssessmentDefaults());
      setEditingAssessmentId(null);
      setShowAssessmentForm(false);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo guardar la evaluación.');
    }
  };

  const deleteAssessment = async (assessment) => {
    if (!canManageAssessments) return;

    const confirmed = window.confirm(
      `Se eliminará la evaluación "${assessment.title}". Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    setMessage('');
    setError('');

    try {
      await api.delete(`/academic/assessments/${assessment.id}`);
      if (editingAssessmentId === assessment.id) {
        setEditingAssessmentId(null);
        setAssessmentForm(createAssessmentDefaults());
        setShowAssessmentForm(false);
      }
      setMessage('Evaluación eliminada correctamente.');
      await loadData();
      await loadStudentGrades();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo eliminar la evaluación.');
    }
  };

  const startGradeCreate = () => {
    setEditingGradeId(null);
    setGradeForm(gradeDefaults);
    setShowGradeForm((prev) => !prev);
  };

  const startGradeEdit = (grade) => {
    if (!selectedStudent) return;

    setMessage('');
    setError('');
    setEditingGradeId(grade.id);
    setGradeForm({
      assessment_id: String(grade.assessment_id),
      student_id: String(selectedStudent),
      score: Number(grade.score ?? 0),
    });
    setShowGradeForm(true);
  };

  const submitGrade = async (event) => {
    event.preventDefault();
    if (!canManageGrades) return;

    setMessage('');
    setError('');

    try {
      const payload = {
        assessment_id: Number(gradeForm.assessment_id),
        student_id: Number(gradeForm.student_id),
        score: Number(gradeForm.score),
      };

      if (editingGradeId) {
        await api.put(`/academic/grades/${editingGradeId}`, { score: payload.score });
        setMessage('Nota actualizada correctamente.');
      } else {
        await api.post('/academic/grades', payload);
        setMessage('Nota guardada correctamente.');
      }

      setSelectedStudent(String(gradeForm.student_id));
      setGradeForm(gradeDefaults);
      setEditingGradeId(null);
      setShowGradeForm(false);
      await loadStudentGrades();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo guardar la nota.');
    }
  };

  const deleteGrade = async (grade) => {
    if (!canManageGrades) return;

    const confirmed = window.confirm('Se eliminará esta nota. Esta acción no se puede deshacer.');
    if (!confirmed) return;

    setMessage('');
    setError('');

    try {
      await api.delete(`/academic/grades/${grade.id}`);
      if (editingGradeId === grade.id) {
        setEditingGradeId(null);
        setGradeForm(gradeDefaults);
        setShowGradeForm(false);
      }
      setMessage('Nota eliminada correctamente.');
      await loadStudentGrades();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo eliminar la nota.');
    }
  };

  if (!canViewAssessments && !canViewGrades && !canManageAssessments && !canManageGrades) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Notas de alumnos</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este módulo.</p>
      </section>
    );
  }

  return (
    <section className="grades-page space-y-6">
      <article className="grades-hero animate-rise">
        <div>
          <p className="grades-hero-kicker">MODULO ACADEMICO</p>
          <h1 className="text-3xl font-semibold text-primary-900">Notas de alumnos</h1>
        </div>
        {selectedStudentName ? <span className="grades-chip">Alumno activo: {selectedStudentName}</span> : null}
      </article>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="module-card grades-stat-card animate-rise">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Evaluaciones</p>
          <p className="module-stat-value">{assessments.length}</p>
          <p className="text-xs text-primary-700">Banco activo para calificar.</p>
        </article>
        <article className="module-card grades-stat-card animate-rise" style={{ animationDelay: '60ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Notas cargadas</p>
          <p className="module-stat-value">{gradeStats.count}</p>
          <p className="text-xs text-primary-700">Del alumno seleccionado.</p>
        </article>
        <article className="module-card grades-stat-card animate-rise" style={{ animationDelay: '120ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Promedio simple</p>
          <p className="module-stat-value">{formatScore(gradeStats.simpleAverage)}</p>
          <p className="text-xs text-primary-700">Escala 0 a 20.</p>
        </article>
        <article className="module-card grades-stat-card animate-rise" style={{ animationDelay: '180ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Promedio ponderado</p>
          <p className="module-stat-value">{formatScore(gradeStats.weightedAverage)}</p>
          <p className="text-xs text-primary-700">Calculado por peso de evaluación.</p>
        </article>
      </div>

      {message ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          {canManageAssessments ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={startAssessmentCreate}
                disabled={isDocenteProfile && !teacherCourseOptions.length}
                className={primaryButtonClass}
              >
                {showAssessmentForm ? 'Cerrar evaluación' : 'CREAR evaluación'}
              </button>
            </div>
          ) : null}

          {showAssessmentForm && canManageAssessments ? (
            <form onSubmit={submitAssessment} className="panel-soft grades-subpanel space-y-3">
              <h2 className="text-lg font-semibold text-primary-900">
                {editingAssessmentId ? 'EDITAR evaluación' : 'CREAR evaluación'}
              </h2>

              <div className={`grid gap-3 sm:grid-cols-2 ${isDocenteProfile ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
                {isDocenteProfile ? (
                  <select
                    className="app-input"
                    value={assessmentForm.teacher_assignment_id}
                    onChange={(event) =>
                      setAssessmentForm((prev) => ({
                        ...prev,
                        teacher_assignment_id: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Curso</option>
                    {teacherCourseOptions.map((course) => (
                      <option key={course.assignment_id} value={course.assignment_id}>
                        {course.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <select
                      className="app-input lg:col-span-2"
                      value={assessmentForm.course_campus_id}
                      onChange={(event) =>
                        setAssessmentForm((prev) => ({
                          ...prev,
                          course_campus_id: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Curso / sede</option>
                      {offerings.map((offering) => (
                        <option key={offering.id} value={offering.id}>
                          {offering.label}
                        </option>
                      ))}
                    </select>

                    <select
                      className="app-input"
                      value={assessmentForm.period_id}
                      onChange={(event) => setAssessmentForm((prev) => ({ ...prev, period_id: event.target.value }))}
                      required
                    >
                      <option value="">Periodo</option>
                      {periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <input
                  className="app-input"
                  placeholder="Título"
                  value={assessmentForm.title}
                  onChange={(event) => setAssessmentForm((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />

                <input
                  type="date"
                  className="app-input"
                  value={assessmentForm.assessment_date}
                  onChange={(event) =>
                    setAssessmentForm((prev) => ({ ...prev, assessment_date: event.target.value }))
                  }
                  required
                />

                <input
                  type="number"
                  min={1}
                  max={100}
                  className="app-input"
                  value={assessmentForm.weight}
                  onChange={(event) => setAssessmentForm((prev) => ({ ...prev, weight: event.target.value }))}
                  required
                />
              </div>

              {isDocenteProfile && !teacherCourseOptions.length ? (
                <p className="text-xs font-semibold text-red-700">
                  No tienes cursos asignados activos para crear evaluaciones.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button className={accentButtonClass} disabled={isDocenteProfile && !teacherCourseOptions.length}>
                  {editingAssessmentId ? 'Guardar cambios' : 'Guardar evaluación'}
                </button>
                {editingAssessmentId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAssessmentId(null);
                      setAssessmentForm(createAssessmentDefaults());
                      setShowAssessmentForm(false);
                    }}
                    className={secondaryButtonClass}
                  >
                    Cancelar edición
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          {canViewAssessments ? (
            <article className="card grades-panel overflow-x-auto">
              <h2 className="grades-panel-title text-lg font-semibold text-primary-900">Evaluaciones</h2>
              <table className="grades-table mt-3 min-w-full text-sm">
                <thead>
                  <tr className="text-left text-primary-600">
                    <th className="pb-2 pr-3">Fecha</th>
                    <th className="pb-2 pr-3">Título</th>
                    <th className="pb-2 pr-3">Curso/Sede</th>
                    <th className="pb-2">Peso</th>
                    {canManageAssessments ? <th className="pb-2">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((assessment) => {
                    const offering = offerings.find((item) => Number(item.id) === Number(assessment.course_campus_id));

                    return (
                      <tr key={assessment.id} className="border-t border-primary-100">
                        <td className="py-2 pr-3">{formatDateLabel(assessment.assessment_date)}</td>
                        <td className="py-2 pr-3 font-medium">{assessment.title}</td>
                        <td className="py-2 pr-3">{offering?.label || `Oferta #${assessment.course_campus_id}`}</td>
                        <td className="py-2">{formatScore(assessment.weight)}%</td>
                        {canManageAssessments ? (
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startAssessmentEdit(assessment)}
                                className={miniSecondaryButtonClass}
                              >
                                EDITAR
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteAssessment(assessment)}
                                className={miniDangerButtonClass}
                              >
                                ELIMINAR
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </article>
          ) : null}
        </div>

        <div className="space-y-4">
          <article className="card grades-panel space-y-3">
            <h2 className="grades-panel-title text-lg font-semibold text-primary-900">Notas por alumno</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="app-input"
                value={selectedStudent}
                onChange={(event) => setSelectedStudent(event.target.value)}
              >
                <option value="">Seleccione alumno</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.first_name} {student.last_name}
                  </option>
                ))}
              </select>

              <select
                className="app-input"
                value={selectedPeriod}
                onChange={(event) => setSelectedPeriod(event.target.value)}
              >
                <option value="">Todos los periodos</option>
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
            </div>

            {canManageGrades ? (
              <button
                type="button"
                onClick={startGradeCreate}
                className={primaryButtonClass}
              >
                {showGradeForm ? 'Cerrar nota' : 'CREAR nota'}
              </button>
            ) : null}

            {showGradeForm && canManageGrades ? (
              <form onSubmit={submitGrade} className="panel-soft grades-subpanel space-y-3">
                <h3 className="text-base font-semibold text-primary-900">
                  {editingGradeId ? 'EDITAR nota' : 'CREAR nota'}
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <select
                    className="app-input"
                    value={gradeForm.assessment_id}
                    onChange={(event) => setGradeForm((prev) => ({ ...prev, assessment_id: event.target.value }))}
                    disabled={Boolean(editingGradeId)}
                    required
                  >
                    <option value="">Evaluación</option>
                    {assessmentOptionsForGrades.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                        {assessment.title} ({formatDateLabel(assessment.assessment_date)})
                    </option>
                    ))}
                  </select>

                  <select
                    className="app-input"
                    value={gradeForm.student_id}
                    onChange={(event) => setGradeForm((prev) => ({ ...prev, student_id: event.target.value }))}
                    disabled={Boolean(editingGradeId)}
                    required
                  >
                    <option value="">Alumno</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min={0}
                    max={20}
                    step="0.01"
                    className="app-input"
                    value={gradeForm.score}
                    onChange={(event) => setGradeForm((prev) => ({ ...prev, score: event.target.value }))}
                    placeholder="Nota (0-20)"
                    required
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button className={accentButtonClass}>
                    {editingGradeId ? 'Guardar cambios' : 'Guardar nota'}
                  </button>
                  {editingGradeId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGradeId(null);
                        setGradeForm(gradeDefaults);
                        setShowGradeForm(false);
                      }}
                      className={secondaryButtonClass}
                    >
                      Cancelar edición
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </article>

          <article className="card grades-panel overflow-x-auto">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="grades-panel-title text-lg font-semibold text-primary-900">Historial de notas</h2>
              <span className="grades-chip">
                {selectedStudentName || 'Sin alumno'}
              </span>
            </div>

            <table className="grades-table min-w-full text-sm">
              <thead>
                <tr className="text-left text-primary-600">
                  <th className="pb-2 pr-3">Fecha</th>
                  <th className="pb-2 pr-3">Evaluación</th>
                  <th className="pb-2 pr-3">Curso</th>
                  <th className="pb-2 pr-3">Sede</th>
                  <th className="pb-2">Nota</th>
                  {canManageGrades ? <th className="pb-2">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {studentGrades.map((grade) => (
                  <tr key={grade.id} className="border-t border-primary-100">
                    <td className="py-2 pr-3">{formatDateLabel(grade.assessment_date)}</td>
                    <td className="py-2 pr-3">{grade.assessment_title}</td>
                    <td className="py-2 pr-3">{grade.course_name}</td>
                    <td className="py-2 pr-3">{grade.campus_name}</td>
                    <td className="py-2 font-semibold">{formatScore(grade.score)}</td>
                    {canManageGrades ? (
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startGradeEdit(grade)}
                            className={miniSecondaryButtonClass}
                          >
                            EDITAR
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteGrade(grade)}
                            className={miniDangerButtonClass}
                          >
                            ELIMINAR
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!studentGrades.length ? (
                  <tr>
                    <td colSpan={canManageGrades ? 6 : 5} className="py-4 text-center text-sm text-primary-700">
                      {selectedStudent
                        ? 'Este alumno no tiene notas registradas en el filtro actual.'
                        : 'Selecciona un alumno para ver y gestionar sus notas.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>
        </div>
      </div>
    </section>
  );
}

export default function GradesPage() {
  const { user } = useAuth();
  const isAlumnoProfile = (user?.roles || []).length === 1 && (user?.roles || []).includes('ALUMNO');

  if (isAlumnoProfile) {
    return <StudentGradesPage />;
  }

  return <StaffGradesPage />;
}
