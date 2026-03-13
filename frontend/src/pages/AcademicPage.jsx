import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';

const getTodayIsoDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const createAssessmentDefaults = () => ({
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

const createAttendanceDefaults = () => ({
  enrollment_id: '',
  attendance_date: getTodayIsoDate(),
  status: 'PRESENTE',
  notes: '',
});

export default function AcademicPage() {
  const { hasPermission } = useAuth();
  const [courses, setCourses] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [studentGrades, setStudentGrades] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [assessmentForm, setAssessmentForm] = useState(createAssessmentDefaults);
  const [gradeForm, setGradeForm] = useState(gradeDefaults);
  const [attendanceForm, setAttendanceForm] = useState(createAttendanceDefaults);
  const [editingAssessmentId, setEditingAssessmentId] = useState(null);
  const [editingGradeId, setEditingGradeId] = useState(null);
  const [editingAttendanceId, setEditingAttendanceId] = useState(null);
  const [activeTab, setActiveTab] = useState('assessments');
  const [, startTabTransition] = useTransition();
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [showGradeForm, setShowGradeForm] = useState(false);
  const [showAttendanceForm, setShowAttendanceForm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const changeTab = (nextTab) => {
    startTabTransition(() => setActiveTab(nextTab));
  };

  const canViewAssessments = hasPermission(PERMISSIONS.ACADEMIC_ASSESSMENTS_VIEW);
  const canManageAssessments = hasPermission(PERMISSIONS.ACADEMIC_ASSESSMENTS_MANAGE);
  const canViewGrades = hasPermission(PERMISSIONS.ACADEMIC_GRADES_VIEW);
  const canManageGrades = hasPermission(PERMISSIONS.ACADEMIC_GRADES_MANAGE);
  const canViewAttendance = hasPermission(PERMISSIONS.ACADEMIC_ATTENDANCE_VIEW);
  const canManageAttendance = hasPermission(PERMISSIONS.ACADEMIC_ATTENDANCE_MANAGE);
  const canViewCourses = hasPermission(PERMISSIONS.COURSES_VIEW);
  const canViewPeriods = hasPermission(PERMISSIONS.PERIODS_VIEW);
  const canViewStudents = hasPermission(PERMISSIONS.STUDENTS_VIEW);
  const canViewEnrollments = hasPermission(PERMISSIONS.ENROLLMENTS_VIEW);

  const loadData = useCallback(async () => {
    try {
      if (canViewCourses) {
        const coursesRes = await api.get('/courses');
        setCourses(coursesRes.data.items || []);
      } else {
        setCourses([]);
      }

      if (canViewPeriods) {
        const periodsRes = await api.get('/catalogs/periods');
        setPeriods(periodsRes.data.items || []);
      } else {
        setPeriods([]);
      }

      if (canViewStudents) {
        const studentsRes = await api.get('/students');
        setStudents(studentsRes.data.items || []);
      } else {
        setStudents([]);
      }

      if (canViewEnrollments) {
        const enrollmentsRes = await api.get('/enrollments');
        setEnrollments(enrollmentsRes.data.items || []);
      } else {
        setEnrollments([]);
      }

      if (canViewAssessments) {
        const assessmentsRes = await api.get('/academic/assessments');
        setAssessments(assessmentsRes.data.items || []);
      } else {
        setAssessments([]);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar el modulo academico.');
    }
  }, [canViewCourses, canViewPeriods, canViewStudents, canViewEnrollments, canViewAssessments]);

  const loadStudentGrades = useCallback(async () => {
    if (!canViewGrades || !selectedStudent) {
      setStudentGrades([]);
      return;
    }

    try {
      const response = await api.get(`/academic/students/${selectedStudent}/grades`);
      setStudentGrades(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar el historial de notas.');
    }
  }, [canViewGrades, selectedStudent]);

  const loadAttendanceHistory = useCallback(async () => {
    if (!canViewAttendance || !attendanceForm.enrollment_id) {
      setAttendanceHistory([]);
      return;
    }

    try {
      const response = await api.get(`/academic/enrollments/${attendanceForm.enrollment_id}/attendances`);
      setAttendanceHistory(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar el historial de asistencia.');
    }
  }, [attendanceForm.enrollment_id, canViewAttendance]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStudentGrades();
  }, [loadStudentGrades]);

  useEffect(() => {
    loadAttendanceHistory();
  }, [loadAttendanceHistory]);

  useEffect(() => {
    const hasAssessmentsTab = canViewAssessments || canManageAssessments;
    const hasGradesTab = canViewGrades || canManageGrades;
    const hasAttendanceTab = canViewAttendance || canManageAttendance;

    if (activeTab === 'assessments' && !hasAssessmentsTab) {
      if (hasGradesTab) {
        setActiveTab('grades');
      } else if (hasAttendanceTab) {
        setActiveTab('attendance');
      }
    }

    if (activeTab === 'grades' && !hasGradesTab) {
      if (hasAssessmentsTab) {
        setActiveTab('assessments');
      } else if (hasAttendanceTab) {
        setActiveTab('attendance');
      }
    }

    if (activeTab === 'attendance' && !hasAttendanceTab) {
      if (hasAssessmentsTab) {
        setActiveTab('assessments');
      } else if (hasGradesTab) {
        setActiveTab('grades');
      }
    }
  }, [
    activeTab,
    canManageAssessments,
    canManageAttendance,
    canManageGrades,
    canViewAssessments,
    canViewAttendance,
    canViewGrades,
  ]);

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

  const submitAssessment = async (event) => {
    event.preventDefault();
    if (!canManageAssessments) return;

    setMessage('');
    setError('');

    try {
      const payload = {
        course_campus_id: Number(assessmentForm.course_campus_id),
        period_id: Number(assessmentForm.period_id),
        title: assessmentForm.title,
        assessment_date: assessmentForm.assessment_date,
        weight: Number(assessmentForm.weight),
      };

      if (editingAssessmentId) {
        await api.put(`/academic/assessments/${editingAssessmentId}`, payload);
        setMessage('Evaluacion actualizada correctamente.');
      } else {
        await api.post('/academic/assessments', payload);
        setMessage('Evaluacion creada correctamente.');
      }

      setAssessmentForm(createAssessmentDefaults());
      setShowAssessmentForm(false);
      setEditingAssessmentId(null);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo guardar la evaluacion.');
    }
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
      setShowGradeForm(false);
      setEditingGradeId(null);
      await loadStudentGrades();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo guardar la nota.');
    }
  };

  const submitAttendance = async (event) => {
    event.preventDefault();
    if (!canManageAttendance) return;

    setMessage('');
    setError('');

    try {
      const payload = {
        enrollment_id: Number(attendanceForm.enrollment_id),
        attendance_date: attendanceForm.attendance_date,
        status: attendanceForm.status,
        notes: attendanceForm.notes || null,
      };

      if (editingAttendanceId) {
        await api.put(`/academic/attendances/${editingAttendanceId}`, {
          attendance_date: payload.attendance_date,
          status: payload.status,
          notes: payload.notes,
        });
        setMessage('Asistencia actualizada correctamente.');
      } else {
        await api.post('/academic/attendances', payload);
        setMessage('Asistencia registrada correctamente.');
      }

      setAttendanceForm((prev) => ({ ...createAttendanceDefaults(), enrollment_id: prev.enrollment_id }));
      setShowAttendanceForm(false);
      setEditingAttendanceId(null);
      await loadAttendanceHistory();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo guardar la asistencia.');
    }
  };

  const startAssessmentCreate = () => {
    setEditingAssessmentId(null);
    setAssessmentForm(createAssessmentDefaults());
    setShowAssessmentForm((prev) => !prev);
  };

  const startAssessmentEdit = (assessment) => {
    setError('');
    setMessage('');
    setEditingAssessmentId(assessment.id);
    setAssessmentForm({
      course_campus_id: String(assessment.course_campus_id),
      period_id: String(assessment.period_id),
      title: assessment.title || '',
      assessment_date: assessment.assessment_date || '',
      weight: Number(assessment.weight ?? 20),
    });
    setShowAssessmentForm(true);
  };

  const deleteAssessment = async (assessment) => {
    if (!canManageAssessments) return;

    const confirmed = window.confirm(
      `Se eliminara la evaluacion "${assessment.title}". Esta accion no se puede deshacer.`,
    );
    if (!confirmed) return;

    setError('');
    setMessage('');

    try {
      await api.delete(`/academic/assessments/${assessment.id}`);
      if (editingAssessmentId === assessment.id) {
        setEditingAssessmentId(null);
        setAssessmentForm(createAssessmentDefaults());
        setShowAssessmentForm(false);
      }
      setMessage('Evaluacion eliminada correctamente.');
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo eliminar la evaluacion.');
    }
  };

  const startGradeCreate = () => {
    setEditingGradeId(null);
    setGradeForm(gradeDefaults);
    setShowGradeForm((prev) => !prev);
  };

  const startGradeEdit = (grade) => {
    if (!selectedStudent) return;

    setError('');
    setMessage('');
    setEditingGradeId(grade.id);
    setGradeForm({
      assessment_id: String(grade.assessment_id),
      student_id: String(selectedStudent),
      score: Number(grade.score ?? 0),
    });
    setShowGradeForm(true);
  };

  const deleteGrade = async (grade) => {
    if (!canManageGrades) return;

    const confirmed = window.confirm('Se eliminara esta nota. Esta accion no se puede deshacer.');
    if (!confirmed) return;

    setError('');
    setMessage('');

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

  const startAttendanceCreate = () => {
    setEditingAttendanceId(null);
    setAttendanceForm((prev) => ({ ...createAttendanceDefaults(), enrollment_id: prev.enrollment_id }));
    setShowAttendanceForm((prev) => !prev);
  };

  const startAttendanceEdit = (attendance) => {
    setError('');
    setMessage('');
    setEditingAttendanceId(attendance.id);
    setAttendanceForm((prev) => ({
      ...prev,
      attendance_date: attendance.attendance_date || '',
      status: attendance.status || 'PRESENTE',
      notes: attendance.notes || '',
    }));
    setShowAttendanceForm(true);
  };

  const deleteAttendance = async (attendance) => {
    if (!canManageAttendance) return;

    const confirmed = window.confirm('Se eliminara este registro de asistencia. Esta accion no se puede deshacer.');
    if (!confirmed) return;

    setError('');
    setMessage('');

    try {
      await api.delete(`/academic/attendances/${attendance.id}`);
      if (editingAttendanceId === attendance.id) {
        setEditingAttendanceId(null);
        setAttendanceForm((prev) => ({ ...createAttendanceDefaults(), enrollment_id: prev.enrollment_id }));
        setShowAttendanceForm(false);
      }
      setMessage('Asistencia eliminada correctamente.');
      await loadAttendanceHistory();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo eliminar la asistencia.');
    }
  };

  if (!canViewAssessments && !canViewGrades && !canViewAttendance && !canManageAssessments && !canManageGrades && !canManageAttendance) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Notas y asistencia</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este modulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Notas y asistencia</h1>
        <p className="text-sm text-primary-700">Gestion academica organizada por flujo de trabajo.</p>
      </div>

      <div className="page-tabs">
        {canViewAssessments || canManageAssessments ? (
          <button
            type="button"
            onClick={() => changeTab('assessments')}
            className={`page-tab ${activeTab === 'assessments' ? 'page-tab-active' : ''}`}
          >
            Evaluaciones
          </button>
        ) : null}
        {canViewGrades || canManageGrades ? (
          <button
            type="button"
            onClick={() => changeTab('grades')}
            className={`page-tab ${activeTab === 'grades' ? 'page-tab-active' : ''}`}
          >
            Notas
          </button>
        ) : null}
        {canViewAttendance || canManageAttendance ? (
          <button
            type="button"
            onClick={() => changeTab('attendance')}
            className={`page-tab ${activeTab === 'attendance' ? 'page-tab-active' : ''}`}
          >
            Asistencia
          </button>
        ) : null}
      </div>

      {message ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {activeTab === 'assessments' && (canViewAssessments || canManageAssessments) ? (
        <div className="space-y-4">
          {canManageAssessments ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={startAssessmentCreate}
                className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
              >
                {showAssessmentForm ? 'Cerrar formulario' : 'CREAR evaluacion'}
              </button>
            </div>
          ) : null}

          {showAssessmentForm && canManageAssessments ? (
            <form onSubmit={submitAssessment} className="panel-soft space-y-3">
              <h2 className="text-lg font-semibold text-primary-900">
                {editingAssessmentId ? 'EDITAR evaluacion' : 'CREAR evaluacion'}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <select
                  className="app-input lg:col-span-2"
                  value={assessmentForm.course_campus_id}
                  onChange={(event) => setAssessmentForm((prev) => ({ ...prev, course_campus_id: event.target.value }))}
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

                <input
                  className="app-input"
                  placeholder="Titulo"
                  value={assessmentForm.title}
                  onChange={(event) => setAssessmentForm((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />

                <input
                  type="date"
                  className="app-input"
                  value={assessmentForm.assessment_date}
                  onChange={(event) => setAssessmentForm((prev) => ({ ...prev, assessment_date: event.target.value }))}
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

              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">
                  {editingAssessmentId ? 'Guardar cambios' : 'Guardar evaluacion'}
                </button>
                {editingAssessmentId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAssessmentId(null);
                      setAssessmentForm(createAssessmentDefaults());
                      setShowAssessmentForm(false);
                    }}
                    className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
                  >
                    Cancelar edicion
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          {canViewAssessments ? (
            <article className="card overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-primary-600">
                    <th className="pb-2 pr-3">Fecha</th>
                    <th className="pb-2 pr-3">Evaluacion</th>
                    <th className="pb-2 pr-3">Curso/Sede</th>
                    <th className="pb-2">Peso</th>
                    {canManageAssessments ? <th className="pb-2">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((assessment) => {
                    const offering = offerings.find((item) => item.id === assessment.course_campus_id);
                    return (
                      <tr key={assessment.id} className="border-t border-primary-100">
                        <td className="py-2 pr-3">{assessment.assessment_date}</td>
                        <td className="py-2 pr-3 font-medium">{assessment.title}</td>
                        <td className="py-2 pr-3">{offering?.label || `Oferta #${assessment.course_campus_id}`}</td>
                        <td className="py-2">{Number(assessment.weight).toFixed(2)}%</td>
                        {canManageAssessments ? (
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startAssessmentEdit(assessment)}
                                className="rounded-lg border border-primary-300 bg-white px-2 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-50"
                              >
                                EDITAR
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteAssessment(assessment)}
                                className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
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
      ) : null}

      {activeTab === 'grades' && (canViewGrades || canManageGrades) ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <select
              className="app-input w-80"
              value={selectedStudent}
              onChange={(event) => setSelectedStudent(event.target.value)}
            >
              <option value="">Seleccione alumno para historial</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.first_name} {student.last_name}
                </option>
              ))}
            </select>

            {canManageGrades ? (
              <button
                type="button"
                onClick={startGradeCreate}
                className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
              >
                {showGradeForm ? 'Cerrar formulario' : 'CREAR nota'}
              </button>
            ) : null}
          </div>

          {showGradeForm && canManageGrades ? (
            <form onSubmit={submitGrade} className="panel-soft space-y-3">
              <h2 className="text-lg font-semibold text-primary-900">
                {editingGradeId ? 'EDITAR nota' : 'CREAR nota'}
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <select
                  className="app-input"
                  value={gradeForm.assessment_id}
                  onChange={(event) => setGradeForm((prev) => ({ ...prev, assessment_id: event.target.value }))}
                  disabled={Boolean(editingGradeId)}
                  required
                >
                  <option value="">Evaluacion</option>
                  {assessments.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.title} ({assessment.assessment_date})
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
                  placeholder="Nota (0-20)"
                  value={gradeForm.score}
                  onChange={(event) => setGradeForm((prev) => ({ ...prev, score: event.target.value }))}
                  required
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">
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
                    className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
                  >
                    Cancelar edicion
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          {canViewGrades ? (
            <article className="card overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-primary-600">
                    <th className="pb-2 pr-3">Fecha</th>
                    <th className="pb-2 pr-3">Evaluacion</th>
                    <th className="pb-2 pr-3">Curso</th>
                    <th className="pb-2 pr-3">Sede</th>
                    <th className="pb-2">Nota</th>
                    {canManageGrades ? <th className="pb-2">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {studentGrades.map((grade) => (
                    <tr key={grade.id} className="border-t border-primary-100">
                      <td className="py-2 pr-3">{grade.assessment_date}</td>
                      <td className="py-2 pr-3">{grade.assessment_title}</td>
                      <td className="py-2 pr-3">{grade.course_name}</td>
                      <td className="py-2 pr-3">{grade.campus_name}</td>
                      <td className="py-2 font-semibold">{Number(grade.score).toFixed(2)}</td>
                      {canManageGrades ? (
                        <td className="py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => startGradeEdit(grade)}
                              className="rounded-lg border border-primary-300 bg-white px-2 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-50"
                            >
                              EDITAR
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteGrade(grade)}
                              className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              ELIMINAR
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'attendance' && (canViewAttendance || canManageAttendance) ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <select
              className="app-input w-80"
              value={attendanceForm.enrollment_id}
              onChange={(event) =>
                setAttendanceForm((prev) => ({ ...prev, enrollment_id: event.target.value }))
              }
            >
              <option value="">Seleccione matricula para historial</option>
              {enrollments.map((enrollment) => (
                <option key={enrollment.id} value={enrollment.id}>
                  #{enrollment.id} - {enrollment.student_name}
                </option>
              ))}
            </select>

            {canManageAttendance ? (
              <button
                type="button"
                onClick={startAttendanceCreate}
                disabled={!attendanceForm.enrollment_id}
                className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showAttendanceForm ? 'Cerrar formulario' : 'CREAR asistencia'}
              </button>
            ) : null}
          </div>

          {showAttendanceForm && canManageAttendance ? (
            <form onSubmit={submitAttendance} className="panel-soft space-y-3">
              <h2 className="text-lg font-semibold text-primary-900">
                {editingAttendanceId ? 'EDITAR asistencia' : 'CREAR asistencia'}
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  type="date"
                  className="app-input"
                  value={attendanceForm.attendance_date}
                  onChange={(event) =>
                    setAttendanceForm((prev) => ({ ...prev, attendance_date: event.target.value }))
                  }
                  required
                />

                <select
                  className="app-input"
                  value={attendanceForm.status}
                  onChange={(event) => setAttendanceForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="PRESENTE">PRESENTE</option>
                  <option value="AUSENTE">AUSENTE</option>
                  <option value="FALTO">FALTO</option>
                  <option value="TARDE">TARDE</option>
                  <option value="JUSTIFICADO">JUSTIFICADO</option>
                </select>

                <input
                  className="app-input"
                  placeholder="Observacion"
                  value={attendanceForm.notes}
                  onChange={(event) => setAttendanceForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">
                  {editingAttendanceId ? 'Guardar cambios' : 'Guardar asistencia'}
                </button>
                {editingAttendanceId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAttendanceId(null);
                      setAttendanceForm((prev) => ({ ...createAttendanceDefaults(), enrollment_id: prev.enrollment_id }));
                      setShowAttendanceForm(false);
                    }}
                    className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
                  >
                    Cancelar edicion
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          {canViewAttendance ? (
            <article className="card overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-primary-600">
                    <th className="pb-2 pr-3">Fecha</th>
                    <th className="pb-2 pr-3">Estado</th>
                    <th className="pb-2">Observacion</th>
                    {canManageAttendance ? <th className="pb-2">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {attendanceHistory.map((attendance) => (
                    <tr key={attendance.id} className="border-t border-primary-100">
                      <td className="py-2 pr-3">{attendance.attendance_date}</td>
                      <td className="py-2 pr-3 font-medium">{attendance.status}</td>
                      <td className="py-2">{attendance.notes || '-'}</td>
                      {canManageAttendance ? (
                        <td className="py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => startAttendanceEdit(attendance)}
                              className="rounded-lg border border-primary-300 bg-white px-2 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-50"
                            >
                              EDITAR
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAttendance(attendance)}
                              className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              ELIMINAR
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
