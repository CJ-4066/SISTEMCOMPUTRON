import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { calculateAgeFromBirthDate, formatAgeLabel } from '../utils/age';
import { getCampusScopeId } from '../utils/campusScope';
import { buildDocumentValue, DOCUMENT_TYPE_OPTIONS, parseDocumentValue } from '../utils/document';

const getTodayIsoDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const getEmptyStudent = () => ({
  first_name: '',
  last_name: '',
  document_type: 'DNI',
  document_number: '',
  birth_date: '',
  email: '',
  phone: '',
  address: '',
  no_guardian: false,
  guardian_id: '',
  guardian_first_name: '',
  guardian_last_name: '',
  guardian_email: '',
  guardian_phone: '',
  guardian_document_number: '',
  link_enrollment: false,
  course_campus_id: '',
  period_id: '',
  enrollment_date: getTodayIsoDate(),
});

const emptyGuardian = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  document_number: '',
};

const createTransferFormDefaults = () => ({
  student_id: '',
  source_enrollment_id: '',
  target_campus_id: '',
  allow_without_target_offering: false,
  request_notes: '',
});

const formatTransferTimestamp = (value) => {
  if (!value) return '-';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-PE');
};

const STUDENT_RECENT_LIMIT = 10;
const TRANSFER_REQUEST_NAV_STORAGE_KEY = 'computron:last-transfer-request-token';

export default function StudentsPage() {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentLoading, setStudentLoading] = useState(false);

  const [guardians, setGuardians] = useState([]);
  const [courses, setCourses] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [guardianSearch, setGuardianSearch] = useState('');
  const [guardianLinkFilter, setGuardianLinkFilter] = useState('all');
  const [transferRequests, setTransferRequests] = useState([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferCampusFilter, setTransferCampusFilter] = useState('');
  const [transferStudentSearch, setTransferStudentSearch] = useState('');
  const [transferStudentResults, setTransferStudentResults] = useState([]);
  const [transferStudentLoading, setTransferStudentLoading] = useState(false);
  const [transferContext, setTransferContext] = useState(null);
  const [transferForm, setTransferForm] = useState(createTransferFormDefaults);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [loadingTransferOptions, setLoadingTransferOptions] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [reviewingTransferId, setReviewingTransferId] = useState(null);

  const [studentForm, setStudentForm] = useState(getEmptyStudent);
  const [guardianForm, setGuardianForm] = useState(emptyGuardian);
  const [editingStudentId, setEditingStudentId] = useState(null);

  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState('students');
  const [, startTabTransition] = useTransition();
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showGuardianForm, setShowGuardianForm] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const [transferError, setTransferError] = useState('');

  const userRoles = user?.roles || [];
  const isRootAdminProfile = userRoles.includes('ADMIN') && !user?.base_campus_id;
  const canViewStudents = hasPermission(PERMISSIONS.STUDENTS_VIEW);
  const canManageStudents = hasPermission(PERMISSIONS.STUDENTS_MANAGE);
  const canViewGuardians = hasPermission(PERMISSIONS.GUARDIANS_VIEW);
  const canManageGuardians = hasPermission(PERMISSIONS.GUARDIANS_MANAGE);
  const canViewCampuses = hasPermission(PERMISSIONS.CAMPUSES_VIEW);
  const canManageCampuses = hasPermission(PERMISSIONS.CAMPUSES_MANAGE);
  const canReadCampuses = canViewCampuses || canManageCampuses;
  const canViewCourses = hasPermission(PERMISSIONS.COURSES_VIEW);
  const canViewPeriods = hasPermission(PERMISSIONS.PERIODS_VIEW);
  const canManageEnrollments = hasPermission(PERMISSIONS.ENROLLMENTS_MANAGE);
  const canUseInlineEnrollment = canManageStudents && canManageEnrollments && canViewCourses && canViewPeriods;
  const canViewTransfers = canViewStudents;
  const canManageTransfers = canViewStudents && canManageEnrollments;
  const canSelectTransferCampus = Boolean(isRootAdminProfile && canReadCampuses);
  const showStudentActions = canManageStudents || canManageTransfers;
  const resolveTabKey = useCallback(
    (candidateTab) => {
      const normalized = String(candidateTab || '').trim().toLowerCase();

      if (normalized === 'transfers' && canViewTransfers) return 'transfers';
      if (normalized === 'guardians' && canViewGuardians) return 'guardians';
      if (normalized === 'students' && canViewStudents) return 'students';
      if (canViewStudents) return 'students';
      if (canViewGuardians) return 'guardians';
      return 'students';
    },
    [canViewGuardians, canViewStudents, canViewTransfers],
  );
  const changeTab = useCallback(
    (nextTab, { replace = false } = {}) => {
      const resolvedTab = resolveTabKey(nextTab);
      startTabTransition(() => setActiveTab(resolvedTab));

      const nextParams = new URLSearchParams(searchParams);
      if (resolvedTab && resolvedTab !== 'students') {
        nextParams.set('tab', resolvedTab);
      } else {
        nextParams.delete('tab');
      }

      setSearchParams(nextParams, { replace });
    },
    [resolveTabKey, searchParams, setSearchParams, startTabTransition],
  );

  const fetchStudents = useCallback(
    async (search = '') => {
      if (!canViewStudents) {
        setStudents([]);
        return;
      }

      setStudentLoading(true);
      try {
        const response = await api.get('/students', {
          params: {
            q: search || undefined,
            page: 1,
            page_size: STUDENT_RECENT_LIMIT,
          },
        });

        setStudents(response.data.items || []);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'No se pudieron cargar los alumnos.');
      } finally {
        setStudentLoading(false);
      }
    },
    [canViewStudents],
  );

  const loadGuardians = useCallback(async () => {
    if (!canViewGuardians) {
      setGuardians([]);
      return;
    }

    try {
      const guardiansRes = await api.get('/guardians', {
        params: {
          has_students: 'all',
          page: 1,
          page_size: 100,
        },
      });
      setGuardians(guardiansRes.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar los apoderados.');
    }
  }, [canViewGuardians]);

  const loadEnrollmentCatalogs = useCallback(async () => {
    if (!canViewCourses) {
      setCourses([]);
    }

    if (!canViewPeriods) {
      setPeriods([]);
    }

    if (!canViewCourses && !canViewPeriods) {
      return;
    }

    try {
      const requests = [];
      if (canViewCourses) requests.push(api.get('/courses'));
      if (canViewPeriods) requests.push(api.get('/catalogs/periods'));

      const responses = await Promise.all(requests);

      if (canViewCourses) {
        const courseResponse = responses.shift();
        setCourses(courseResponse?.data?.items || []);
      }

      if (canViewPeriods) {
        const periodResponse = responses.shift();
        setPeriods(periodResponse?.data?.items || []);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar cursos y periodos.');
    }
  }, [canViewCourses, canViewPeriods]);

  const loadCampuses = useCallback(async () => {
    if (!canReadCampuses) {
      setCampuses([]);
      return;
    }

    try {
      const response = await api.get('/campuses', {
        ...(canSelectTransferCampus ? { _skipCampusScope: true } : {}),
      });
      setCampuses(response.data?.items || []);
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || 'No se pudieron cargar las sedes.');
    }
  }, [canReadCampuses, canSelectTransferCampus]);

  const loadTransfers = useCallback(async () => {
    if (!canViewTransfers) {
      setTransferRequests([]);
      return;
    }

    setTransferLoading(true);
    try {
      const response = await api.get('/students/transfers');
      setTransferRequests(response.data.items || []);
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || 'No se pudieron cargar las solicitudes de traslado.');
    } finally {
      setTransferLoading(false);
    }
  }, [canViewTransfers]);

  const loadTransferStudentResults = useCallback(
    async (search = '') => {
      if (!canManageTransfers) {
        setTransferStudentResults([]);
        return;
      }

      setTransferStudentLoading(true);
      try {
        const response = await api.get('/students', {
          params: {
            q: search || undefined,
            campus_id: canSelectTransferCampus && transferCampusFilter ? Number(transferCampusFilter) : undefined,
            page: 1,
            page_size: 8,
          },
          ...(canSelectTransferCampus ? { _skipCampusScope: true } : {}),
        });
        setTransferStudentResults(
          (response.data?.items || []).filter((student) => student.assigned_enrollment_status === 'ACTIVE'),
        );
      } catch (requestError) {
        setTransferError(requestError.response?.data?.message || 'No se pudieron cargar alumnos para traslado.');
      } finally {
        setTransferStudentLoading(false);
      }
    },
    [canManageTransfers, canSelectTransferCampus, transferCampusFilter],
  );

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchStudents(studentSearch);
    }, 250);

    return () => clearTimeout(debounce);
  }, [fetchStudents, studentSearch]);

  useEffect(() => {
    loadGuardians();
  }, [loadGuardians]);

  useEffect(() => {
    loadEnrollmentCatalogs();
  }, [loadEnrollmentCatalogs]);

  useEffect(() => {
    if (activeTab !== 'transfers' || !canSelectTransferCampus) return;
    if (campuses.length > 0) return;
    loadCampuses();
  }, [activeTab, campuses.length, canSelectTransferCampus, loadCampuses]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    if (activeTab !== 'transfers' || !canManageTransfers) return undefined;

    const debounce = setTimeout(() => {
      loadTransferStudentResults(transferStudentSearch.trim());
    }, 250);

    return () => clearTimeout(debounce);
  }, [activeTab, canManageTransfers, loadTransferStudentResults, transferStudentSearch]);

  useEffect(() => {
    if (activeTab === 'transfers') return;
    if (!transferError && !transferMessage) return;

    setTransferError('');
    setTransferMessage('');
  }, [activeTab, transferError, transferMessage]);

  useEffect(() => {
    if (!canSelectTransferCampus) return;
    setTransferContext(null);
    setTransferForm(createTransferFormDefaults());
    setShowTransferForm(false);
  }, [canSelectTransferCampus, transferCampusFilter]);

  useEffect(() => {
    const resolvedTab = resolveTabKey(requestedTab);
    const canonicalTab = resolvedTab && resolvedTab !== 'students' ? resolvedTab : '';
    const currentRequestedTab = String(requestedTab || '').trim().toLowerCase();

    if (resolvedTab !== activeTab) {
      startTabTransition(() => setActiveTab(resolvedTab));
      return;
    }

    if (currentRequestedTab !== canonicalTab) {
      const nextParams = new URLSearchParams(searchParams);
      if (canonicalTab) {
        nextParams.set('tab', canonicalTab);
      } else {
        nextParams.delete('tab');
      }
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeTab, requestedTab, resolveTabKey, searchParams, setSearchParams, startTabTransition]);

  useEffect(() => {
    if (!canUseInlineEnrollment && studentForm.link_enrollment) {
      setStudentForm((prev) => ({
        ...prev,
        link_enrollment: false,
        course_campus_id: '',
        period_id: '',
        enrollment_date: getTodayIsoDate(),
      }));
    }
  }, [canUseInlineEnrollment, studentForm.link_enrollment]);

  const selectedTransferOption = useMemo(() => {
    if (!transferContext?.options?.length) return null;

    return (
      transferContext.options.find(
        (option) => String(option.enrollment_id) === String(transferForm.source_enrollment_id),
      ) || transferContext.options[0]
    );
  }, [transferContext, transferForm.source_enrollment_id]);

  const selectedTransferTargetCampuses = useMemo(() => {
    if (!selectedTransferOption) return [];

    return transferForm.allow_without_target_offering
      ? selectedTransferOption.all_target_campuses || []
      : selectedTransferOption.target_campuses || [];
  }, [selectedTransferOption, transferForm.allow_without_target_offering]);

  const selectedTransferAvailableCampusIds = useMemo(
    () => new Set((selectedTransferOption?.target_campuses || []).map((campus) => String(campus.campus_id))),
    [selectedTransferOption],
  );

  useEffect(() => {
    if (!transferContext?.options?.length) return;

    const fallbackOption = selectedTransferOption || transferContext.options[0];
    if (!fallbackOption) return;

    const targetExists = selectedTransferTargetCampuses.some(
      (campus) => String(campus.campus_id) === String(transferForm.target_campus_id),
    );
    const nextTargetCampusId = targetExists
      ? String(transferForm.target_campus_id || '')
      : String(selectedTransferTargetCampuses[0]?.campus_id || '');

    if (
      String(transferForm.source_enrollment_id || '') === String(fallbackOption.enrollment_id) &&
      String(transferForm.target_campus_id || '') === nextTargetCampusId
    ) {
      return;
    }

    setTransferForm((prev) => ({
      ...prev,
      source_enrollment_id: String(fallbackOption.enrollment_id),
      target_campus_id: nextTargetCampusId,
    }));
  }, [
    selectedTransferOption,
    selectedTransferTargetCampuses,
    transferContext,
    transferForm.source_enrollment_id,
    transferForm.target_campus_id,
    transferForm.allow_without_target_offering,
  ]);

  const filteredGuardians = useMemo(() => {
    const term = guardianSearch.trim().toLowerCase();

    return guardians.filter((guardian) => {
      const studentCount = Number(guardian.student_count || 0);
      const fullText = `${guardian.first_name} ${guardian.last_name} ${guardian.email || ''} ${guardian.phone || ''} ${guardian.document_number || ''}`.toLowerCase();

      const matchesText = !term || fullText.includes(term);
      const matchesLinkFilter =
        guardianLinkFilter === 'all' ||
        (guardianLinkFilter === 'yes' && studentCount > 0) ||
        (guardianLinkFilter === 'no' && studentCount === 0);

      return matchesText && matchesLinkFilter;
    });
  }, [guardians, guardianSearch, guardianLinkFilter]);

  const offeringOptions = useMemo(() => {
    const options = [];

    for (const course of courses) {
      for (const offering of course.offerings || []) {
        const modality = offering.modality || 'PRESENCIAL';
        const modalityLabel =
          modality === 'VIRTUAL' ? 'Virtual' : modality === 'HIBRIDO' ? 'Hibrido' : 'Presencial';
        const campusName = offering.campus_name || 'Sin sede';

        options.push({
          id: offering.offering_id,
          label: `${course.name} - ${campusName} (${modalityLabel})`,
        });
      }
    }

    return options;
  }, [courses]);

  const pendingIncomingTransfers = useMemo(
    () =>
      transferRequests.filter((item) => item.direction === 'INCOMING' && item.status === 'PENDING').length,
    [transferRequests],
  );

  const studentAgeLabel = useMemo(
    () => formatAgeLabel(calculateAgeFromBirthDate(studentForm.birth_date)),
    [studentForm.birth_date],
  );

  const submitStudent = async (event) => {
    event.preventDefault();
    if (!canManageStudents) return;

    setError('');
    setMessage('');

    try {
      const payload = {
        first_name: studentForm.first_name,
        last_name: studentForm.last_name,
        document_number: buildDocumentValue(studentForm.document_type, studentForm.document_number),
        birth_date: studentForm.birth_date,
        email: studentForm.email || null,
        phone: studentForm.phone || null,
        address: studentForm.address || null,
      };

      const isEditing = Boolean(editingStudentId);

      if (!isEditing) {
        payload.no_guardian = Boolean(studentForm.no_guardian);

        if (!payload.no_guardian) {
          const guardianFirstName = studentForm.guardian_first_name.trim();
          const guardianLastName = studentForm.guardian_last_name.trim();
          const guardianEmail = studentForm.guardian_email.trim();
          const guardianPhone = studentForm.guardian_phone.trim();
          const guardianDocumentNumber = studentForm.guardian_document_number.trim();

          if (studentForm.guardian_id) {
            payload.guardian_links = [{ guardian_id: Number(studentForm.guardian_id), relationship: 'APODERADO' }];
          }

          const hasQuickGuardianData = Boolean(
            guardianFirstName ||
              guardianLastName ||
              guardianEmail ||
              guardianPhone ||
              guardianDocumentNumber,
          );

          if (hasQuickGuardianData) {
            if (!guardianFirstName || !guardianLastName) {
              setError('Para registrar un apoderado nuevo, ingresa al menos nombres y apellidos.');
              return;
            }

            payload.guardian_payload = {
              first_name: guardianFirstName,
              last_name: guardianLastName,
              email: guardianEmail || null,
              phone: guardianPhone || null,
              document_number: guardianDocumentNumber || null,
              relationship: 'APODERADO',
            };
          }

          if (!payload.guardian_links && !payload.guardian_payload) {
            setError('Debes seleccionar o registrar un apoderado, o marcar la opción "Sin apoderado".');
            return;
          }
        }

        if (studentForm.link_enrollment) {
          if (!studentForm.course_campus_id || !studentForm.period_id) {
            setError('Selecciona curso/sede y periodo para registrar la matricula.');
            return;
          }

          payload.enrollment = {
            course_campus_id: Number(studentForm.course_campus_id),
            period_id: Number(studentForm.period_id),
            enrollment_date: studentForm.enrollment_date || undefined,
          };
        }

        const createResponse = await api.post('/students', payload);
        const accessUser = createResponse.data?.item?.access_user || null;
        const hasGuardian = (createResponse.data?.item?.guardians || []).length > 0;
        if (accessUser?.email && accessUser?.initial_password) {
          setMessage(
            `Alumno creado${hasGuardian ? '' : ' sin apoderado'}. Usuario: ${accessUser.email} | Clave inicial: ${accessUser.initial_password}`,
          );
        } else {
          setMessage(`Alumno creado correctamente${hasGuardian ? '.' : ' sin apoderado.'}`);
        }
      } else {
        await api.put(`/students/${editingStudentId}`, payload);
        setMessage('Alumno actualizado correctamente.');
      }

      setStudentForm(getEmptyStudent());
      setShowStudentForm(false);
      setEditingStudentId(null);
      setStudentSearch('');
      await fetchStudents('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo crear el alumno.');
    }
  };

  const startStudentCreate = () => {
    setStudentForm(getEmptyStudent());
    setEditingStudentId(null);
    setShowStudentForm((prev) => !prev);
  };

  const startStudentEdit = (student) => {
    setError('');
    setMessage('');
    const parsedDocument = parseDocumentValue(student.document_number);
    setEditingStudentId(student.id);
    setShowStudentForm(true);
    setStudentForm({
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      document_type: parsedDocument.document_type,
      document_number: parsedDocument.document_number,
      birth_date: student.birth_date || '',
      email: student.email || '',
      phone: student.phone || '',
      address: student.address || '',
      no_guardian: false,
      guardian_id: '',
      guardian_first_name: '',
      guardian_last_name: '',
      guardian_email: '',
      guardian_phone: '',
      guardian_document_number: '',
      link_enrollment: false,
      course_campus_id: '',
      period_id: '',
      enrollment_date: getTodayIsoDate(),
    });
  };

  const deleteStudent = async (student) => {
    if (!canManageStudents) return;

    const confirmed = window.confirm(
      `Se eliminara al alumno ${student.first_name} ${student.last_name}. Esta accion no se puede deshacer.`,
    );
    if (!confirmed) return;

    setError('');
    setMessage('');

    try {
      await api.delete(`/students/${student.id}`);
      if (editingStudentId === student.id) {
        setEditingStudentId(null);
        setStudentForm(getEmptyStudent());
        setShowStudentForm(false);
      }
      setMessage('Alumno eliminado correctamente.');
      await fetchStudents(studentSearch);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo eliminar el alumno.');
    }
  };

  const closeTransferForm = () => {
    setTransferContext(null);
    setTransferForm(createTransferFormDefaults());
    setShowTransferForm(false);
    setLoadingTransferOptions(false);
  };

  const openTransferRequest = useCallback(async (student) => {
    if (!canManageTransfers) return;

    setTransferError('');
    setTransferMessage('');
    setLoadingTransferOptions(true);
    setTransferContext(null);
    setShowTransferForm(false);

    try {
      const response = await api.get(`/students/${student.id}/transfer-options`, {
        params: {
          campus_id: canSelectTransferCampus && transferCampusFilter ? Number(transferCampusFilter) : undefined,
        },
        ...(canSelectTransferCampus ? { _skipCampusScope: true } : {}),
      });
      const detail = response.data?.item || {};
      const options = detail.options || [];
      if (!options.length) {
        changeTab('transfers');
        setTransferError('El alumno no tiene una matrícula activa disponible para traslado en la sede filtrada.');
        return;
      }
      const preferredOption = options.find((option) => (option.target_campuses || []).length > 0) || options[0];
      const hasAnyTargets = options.some((option) => (option.target_campuses || []).length > 0);

      setTransferStudentSearch(`${detail.student?.first_name || student.first_name || ''} ${detail.student?.last_name || student.last_name || ''}`.trim());
      setTransferContext({
        student: detail.student,
        options,
      });
      setTransferForm({
        student_id: String(detail.student?.id || student.id),
        source_enrollment_id: String(preferredOption.enrollment_id),
        target_campus_id: String(preferredOption.target_campuses?.[0]?.campus_id || ''),
        allow_without_target_offering: false,
        request_notes: '',
      });
      setShowTransferForm(true);
      changeTab('transfers');
      if (!hasAnyTargets) {
        setTransferError(
          'La matrícula cargó correctamente, pero no existe otra sede activa disponible para ese curso y periodo. Si necesitas moverlo igual, marca la opción "No es necesario que haya un curso".',
        );
      }
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || 'No se pudo preparar la solicitud de traslado.');
    } finally {
      setLoadingTransferOptions(false);
    }
  }, [canManageTransfers, canSelectTransferCampus, changeTab, transferCampusFilter]);

  const selectTransferStudent = useCallback(
    async (student) => {
      await openTransferRequest(student);
    },
    [openTransferRequest],
  );

  useEffect(() => {
    const transferStudent = location.state?.transferStudent || null;
    const transferRequestToken = String(location.state?.transferRequestToken || '').trim();
    if (!transferStudent?.id || !transferRequestToken || !canManageTransfers) return;

    if (typeof window !== 'undefined' && window.sessionStorage) {
      const lastHandledToken = window.sessionStorage.getItem(TRANSFER_REQUEST_NAV_STORAGE_KEY) || '';
      if (lastHandledToken === transferRequestToken) {
        navigate(location.pathname, { replace: true, state: null });
        return;
      }
      window.sessionStorage.setItem(TRANSFER_REQUEST_NAV_STORAGE_KEY, transferRequestToken);
    }

    navigate(location.pathname, { replace: true, state: null });
    openTransferRequest({
      id: transferStudent.id,
      first_name: transferStudent.first_name || '',
      last_name: transferStudent.last_name || '',
    });
  }, [canManageTransfers, location.pathname, location.state, navigate, openTransferRequest]);

  const submitTransferRequest = async (event) => {
    event.preventDefault();
    if (!canManageTransfers) return;

    if (!selectedTransferTargetCampuses.length) {
      setTransferError('La matrícula seleccionada no tiene sedes destino disponibles para registrar el traslado.');
      return;
    }

    const campusScopeId =
      (canSelectTransferCampus && transferCampusFilter ? Number(transferCampusFilter) : null) ||
      Number(selectedTransferOption?.source_campus_id || 0) ||
      getCampusScopeId();
    if (!campusScopeId) {
      setTransferError('Selecciona una sede activa para registrar el traslado.');
      return;
    }

    if (!transferForm.student_id || !transferForm.source_enrollment_id || !transferForm.target_campus_id) {
      setTransferError('Selecciona la matrícula y la sede destino para registrar el traslado.');
      return;
    }

    setTransferError('');
    setTransferMessage('');
    setSubmittingTransfer(true);

    try {
      await api.post(
        '/students/transfers',
        {
          student_id: Number(transferForm.student_id),
          source_enrollment_id: Number(transferForm.source_enrollment_id),
          target_campus_id: Number(transferForm.target_campus_id),
          allow_without_target_offering: Boolean(transferForm.allow_without_target_offering),
          request_notes: transferForm.request_notes.trim() || null,
        },
        {
          params: { campus_id: campusScopeId },
        },
      );

      closeTransferForm();
      setTransferMessage('Solicitud de traslado registrada.');
      await loadTransfers();
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || 'No se pudo registrar la solicitud de traslado.');
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const resolveTransferRequest = async (transfer, decision) => {
    if (!canManageTransfers || !transfer?.id) return;

    const campusScopeId = getCampusScopeId();
    if (!campusScopeId) {
      setTransferError('Selecciona la sede destino activa para revisar el traslado.');
      return;
    }

    const promptMessage =
      decision === 'APPROVE'
        ? 'Observacion de aprobacion (opcional)'
        : 'Motivo del rechazo';
    const rawNotes = window.prompt(promptMessage, transfer.review_notes || '');
    if (rawNotes === null) return;

    const reviewNotes = rawNotes.trim();
    if (decision === 'REJECT' && !reviewNotes) {
      setTransferError('Debes indicar un motivo para rechazar el traslado.');
      return;
    }

    setTransferError('');
    setTransferMessage('');
    setReviewingTransferId(transfer.id);

    try {
      await api.patch(
        `/students/transfers/${transfer.id}/decision`,
        {
          decision,
          review_notes: reviewNotes || null,
        },
        {
          params: { campus_id: campusScopeId },
        },
      );

      setTransferMessage(
        decision === 'APPROVE'
          ? 'Traslado aprobado y matrícula creada en la sede destino.'
          : 'Solicitud de traslado rechazada.',
      );
      await loadTransfers();
    } catch (requestError) {
      setTransferError(requestError.response?.data?.message || 'No se pudo actualizar la solicitud de traslado.');
    } finally {
      setReviewingTransferId(null);
    }
  };

  const submitGuardian = async (event) => {
    event.preventDefault();
    if (!canManageGuardians) return;

    setError('');
    setMessage('');

    try {
      await api.post('/guardians', {
        ...guardianForm,
        email: guardianForm.email || null,
        phone: guardianForm.phone || null,
        document_number: guardianForm.document_number || null,
      });

      setGuardianForm(emptyGuardian);
      setShowGuardianForm(false);
      setMessage('Apoderado creado correctamente.');
      await loadGuardians();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo crear el apoderado.');
    }
  };

  if (!canViewStudents && !canViewGuardians) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Alumnos y apoderados</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este modulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Alumnos y apoderados</h1>
          <p className="text-sm text-primary-700">Registro academico con vistas separadas por tarea.</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
            {students.length} alumnos
          </span>
          <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-800">
            {guardians.length} apoderados
          </span>
          {canViewTransfers ? (
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-800">
              {transferRequests.length} traslados
            </span>
          ) : null}
        </div>
      </div>

      <div className="page-tabs">
        {canViewStudents ? (
          <button
            type="button"
            onClick={() => changeTab('students')}
            className={`page-tab ${activeTab === 'students' ? 'page-tab-active' : ''}`}
          >
            Alumnos
          </button>
        ) : null}
        {canViewGuardians ? (
          <button
            type="button"
            onClick={() => changeTab('guardians')}
            className={`page-tab ${activeTab === 'guardians' ? 'page-tab-active' : ''}`}
          >
            Apoderados
          </button>
        ) : null}
        {canViewTransfers ? (
          <button
            type="button"
            onClick={() => changeTab('transfers')}
            className={`page-tab ${activeTab === 'transfers' ? 'page-tab-active' : ''}`}
          >
            Traslados{pendingIncomingTransfers > 0 ? ` (${pendingIncomingTransfers})` : ''}
          </button>
        ) : null}
      </div>

      {activeTab !== 'transfers' && message ? (
        <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p>
      ) : null}
      {activeTab !== 'transfers' && error ? (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}
      {activeTab === 'transfers' && transferMessage ? (
        <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{transferMessage}</p>
      ) : null}
      {activeTab === 'transfers' && transferError ? (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{transferError}</p>
      ) : null}
      {activeTab === 'transfers' && canViewTransfers && pendingIncomingTransfers > 0 ? (
        <p className="rounded-xl bg-accent-50 p-3 text-sm text-accent-800">
          Tienes {pendingIncomingTransfers} solicitud{pendingIncomingTransfers === 1 ? '' : 'es'} de traslado por revisar
          en la sede activa.
        </p>
      ) : null}

      {activeTab === 'students' && canViewStudents ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-primary-700">Gestiona alumnos y sus vinculos con apoderados.</p>
              <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
                {students.length} ultimos registros
              </span>
            </div>
            {canManageStudents ? (
              <button
                type="button"
                onClick={startStudentCreate}
                className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
              >
                {showStudentForm ? 'Cerrar formulario' : 'CREAR alumno'}
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="app-input w-full max-w-xl"
              placeholder="Buscar alumno por nombre, apellido, documento, correo, telefono o apoderado"
              value={studentSearch}
              onChange={(event) => {
                setStudentSearch(event.target.value);
              }}
            />
          </div>

          <p className="text-xs text-primary-600">
            Se muestran solo los 10 alumnos mas recientes.
          </p>

          {showStudentForm && canManageStudents ? (
            <form onSubmit={submitStudent} className="panel-soft space-y-3">
              <h2 className="text-lg font-semibold text-primary-900">
                {editingStudentId ? 'EDITAR alumno' : 'CREAR alumno'}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input
                  className="app-input"
                  placeholder="Nombres"
                  value={studentForm.first_name}
                  onChange={(event) => setStudentForm((prev) => ({ ...prev, first_name: event.target.value }))}
                  required
                />
                <input
                  className="app-input"
                  placeholder="Apellidos"
                  value={studentForm.last_name}
                  onChange={(event) => setStudentForm((prev) => ({ ...prev, last_name: event.target.value }))}
                  required
                />
                <select
                  className="app-input"
                  value={studentForm.document_type}
                  onChange={(event) => setStudentForm((prev) => ({ ...prev, document_type: event.target.value }))}
                >
                  {DOCUMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="app-input"
                  placeholder="Numero de documento"
                  value={studentForm.document_number}
                  onChange={(event) => setStudentForm((prev) => ({ ...prev, document_number: event.target.value }))}
                  required
                />
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-primary-700">Fecha de nacimiento</span>
                  <input
                    type="date"
                    className="app-input"
                    value={studentForm.birth_date}
                    onChange={(event) => setStudentForm((prev) => ({ ...prev, birth_date: event.target.value }))}
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-primary-700">Edad</span>
                  <input
                    className="app-input"
                    value={studentAgeLabel}
                    placeholder="Se calcula automáticamente"
                    readOnly
                  />
                </label>
                <input
                  type="email"
                  className="app-input"
                  placeholder="Correo"
                  value={studentForm.email}
                  onChange={(event) => setStudentForm((prev) => ({ ...prev, email: event.target.value }))}
                />
                <input
                  className="app-input"
                  placeholder="Telefono"
                  value={studentForm.phone}
                  onChange={(event) => setStudentForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="app-input"
                  placeholder="Direccion"
                  value={studentForm.address}
                  onChange={(event) => setStudentForm((prev) => ({ ...prev, address: event.target.value }))}
                />
                <div />
              </div>

              {!editingStudentId ? (
                <div className="space-y-3 rounded-xl border border-primary-200 bg-white p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-primary-900">
                    <input
                      type="checkbox"
                      checked={studentForm.no_guardian}
                      onChange={(event) =>
                        setStudentForm((prev) => ({
                          ...prev,
                          no_guardian: event.target.checked,
                          guardian_id: event.target.checked ? '' : prev.guardian_id,
                          guardian_first_name: event.target.checked ? '' : prev.guardian_first_name,
                          guardian_last_name: event.target.checked ? '' : prev.guardian_last_name,
                          guardian_email: event.target.checked ? '' : prev.guardian_email,
                          guardian_phone: event.target.checked ? '' : prev.guardian_phone,
                          guardian_document_number: event.target.checked ? '' : prev.guardian_document_number,
                        }))
                      }
                    />
                    Registrar SIN apoderado
                  </label>

                  {!studentForm.no_guardian ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <select
                        className="app-input lg:col-span-3"
                        value={studentForm.guardian_id}
                        onChange={(event) => setStudentForm((prev) => ({ ...prev, guardian_id: event.target.value }))}
                      >
                        <option value="">Selecciona apoderado existente (opcional)</option>
                        {guardians.map((guardian) => (
                          <option key={guardian.id} value={guardian.id}>
                            {guardian.first_name} {guardian.last_name}
                          </option>
                        ))}
                      </select>

                      <input
                        className="app-input"
                        placeholder="Apoderado: nombres"
                        value={studentForm.guardian_first_name}
                        onChange={(event) =>
                          setStudentForm((prev) => ({ ...prev, guardian_first_name: event.target.value }))
                        }
                      />
                      <input
                        className="app-input"
                        placeholder="Apoderado: apellidos"
                        value={studentForm.guardian_last_name}
                        onChange={(event) =>
                          setStudentForm((prev) => ({ ...prev, guardian_last_name: event.target.value }))
                        }
                      />
                      <input
                        type="email"
                        className="app-input"
                        placeholder="Apoderado: correo (opcional)"
                        value={studentForm.guardian_email}
                        onChange={(event) => setStudentForm((prev) => ({ ...prev, guardian_email: event.target.value }))}
                      />
                      <input
                        className="app-input"
                        placeholder="Apoderado: telefono (opcional)"
                        value={studentForm.guardian_phone}
                        onChange={(event) => setStudentForm((prev) => ({ ...prev, guardian_phone: event.target.value }))}
                      />
                      <input
                        className="app-input"
                        placeholder="Apoderado: documento (opcional)"
                        value={studentForm.guardian_document_number}
                        onChange={(event) =>
                          setStudentForm((prev) => ({ ...prev, guardian_document_number: event.target.value }))
                        }
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-primary-700">El alumno se guardará como "Sin apoderado".</p>
                  )}
                </div>
              ) : null}

              {!editingStudentId ? (
                <div className="space-y-3 rounded-xl border border-primary-200 bg-white p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-primary-900">
                    <input
                      type="checkbox"
                      checked={studentForm.link_enrollment}
                      disabled={!canUseInlineEnrollment}
                      onChange={(event) =>
                        setStudentForm((prev) => ({
                          ...prev,
                          link_enrollment: event.target.checked,
                          course_campus_id: event.target.checked ? prev.course_campus_id : '',
                          period_id: event.target.checked ? prev.period_id : '',
                          enrollment_date: event.target.checked
                            ? prev.enrollment_date || getTodayIsoDate()
                            : getTodayIsoDate(),
                        }))
                      }
                    />
                    Vincular matricula al registrar alumno
                  </label>

                  {studentForm.link_enrollment ? (
                    canUseInlineEnrollment ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <select
                            className="app-input lg:col-span-2"
                            value={studentForm.course_campus_id}
                            onChange={(event) =>
                              setStudentForm((prev) => ({ ...prev, course_campus_id: event.target.value }))
                            }
                            required
                          >
                            <option value="">Seleccione curso/carrera y sede</option>
                            {offeringOptions.map((offering) => (
                              <option key={offering.id} value={offering.id}>
                                {offering.label}
                              </option>
                            ))}
                          </select>

                          <select
                            className="app-input"
                            value={studentForm.period_id}
                            onChange={(event) =>
                              setStudentForm((prev) => ({ ...prev, period_id: event.target.value }))
                            }
                            required
                          >
                            <option value="">Seleccione periodo</option>
                            {periods.map((period) => (
                              <option key={period.id} value={period.id}>
                                {period.name}
                              </option>
                            ))}
                          </select>

                          <label className="space-y-1">
                            <span className="text-xs font-semibold text-primary-700">Fecha de matrícula</span>
                            <input
                              type="date"
                              className="app-input"
                              value={studentForm.enrollment_date}
                              onChange={(event) =>
                                setStudentForm((prev) => ({ ...prev, enrollment_date: event.target.value }))
                              }
                            />
                          </label>
                        </div>
                        <p className="text-xs text-primary-600">
                          La fecha de matrícula es el día en que se registra la inscripción del alumno.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-primary-700">
                        Tu usuario no tiene permisos suficientes para crear matriculas desde este formulario.
                      </p>
                    )
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
                >
                  {editingStudentId ? 'Guardar cambios' : 'Guardar alumno'}
                </button>
                {editingStudentId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStudentId(null);
                      setStudentForm(getEmptyStudent());
                      setShowStudentForm(false);
                    }}
                    className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
                  >
                    Cancelar edicion
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <article className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-primary-600">
                  <th className="pb-2 pr-3">Alumno</th>
                  <th className="pb-2 pr-3">Tipo doc.</th>
                  <th className="pb-2 pr-3">Nro. doc.</th>
                  <th className="pb-2 pr-3">Contacto</th>
                  <th className="pb-2 pr-3">Sede asignada</th>
                  <th className="pb-2 pr-3">Registrado por</th>
                  <th className="pb-2">Apoderados</th>
                  {showStudentActions ? <th className="pb-2">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const parsedDocument = parseDocumentValue(student.document_number);
                  return (
                  <tr key={student.id} className="border-t border-primary-100">
                    <td className="py-2 pr-3 font-medium">
                      {student.first_name} {student.last_name}
                    </td>
                    <td className="py-2 pr-3">{parsedDocument.document_type}</td>
                    <td className="py-2 pr-3">{parsedDocument.document_number || '-'}</td>
                    <td className="py-2 pr-3">{student.email || student.phone || '-'}</td>
                    <td className="py-2 pr-3">
                      <div>{student.assigned_campus_name || '-'}</div>
                      {student.assigned_enrollment_status &&
                      student.assigned_enrollment_status !== 'ACTIVE' ? (
                        <div className="text-xs text-primary-500">
                          Matricula {String(student.assigned_enrollment_status).toLowerCase()}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{student.created_by_name || '-'}</td>
                    <td className="py-2">
                      {student.guardians?.length
                        ? student.guardians.map((guardian) => guardian.name).join(', ')
                        : 'Sin apoderado'}
                    </td>
                    {showStudentActions ? (
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {canManageStudents ? (
                            <button
                              type="button"
                              onClick={() => startStudentEdit(student)}
                              className="rounded-lg border border-primary-300 bg-white px-2 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-50"
                            >
                              EDITAR
                            </button>
                          ) : null}
                          {canManageStudents ? (
                            <button
                              type="button"
                              onClick={() => deleteStudent(student)}
                              className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              ELIMINAR
                            </button>
                          ) : null}
                          {canManageTransfers ? (
                            <button
                              type="button"
                              onClick={() => openTransferRequest(student)}
                              className="rounded-lg border border-accent-300 bg-white px-2 py-1 text-xs font-semibold text-accent-800 hover:bg-accent-50"
                            >
                              TRASLADO
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                  );
                })}
                {!studentLoading && students.length === 0 ? (
                  <tr>
                    <td colSpan={showStudentActions ? 8 : 7} className="py-4 text-center text-sm text-primary-600">
                      No se encontraron alumnos con ese criterio.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>
        </div>
      ) : null}

      {activeTab === 'transfers' && canViewTransfers ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary-900">Solicitudes de traslado entre sedes</h2>
              <p className="text-sm text-primary-700">
                La sede origen registra la solicitud y la sede destino la aprueba o la rechaza.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
                {transferRequests.length} solicitudes
              </span>
              <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-800">
                {pendingIncomingTransfers} pendientes por revisar
              </span>
              {loadingTransferOptions ? (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-700">
                  Preparando traslado...
                </span>
              ) : null}
            </div>
          </div>

          {canManageTransfers ? (
            <div className="panel-soft space-y-3">
              <div>
                <h3 className="text-base font-semibold text-primary-900">Seleccionar alumno</h3>
                <p className="text-sm text-primary-700">
                  Busca por nombre o documento. Al elegir un alumno, el sistema carga su matricula activa y filtra la
                  sede donde esta asignado. Aqui solo se listan alumnos con matricula activa.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {canSelectTransferCampus ? (
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-primary-700">Filtrar alumnos por sede</span>
                    <select
                      className="app-input"
                      value={transferCampusFilter}
                      onChange={(event) => setTransferCampusFilter(event.target.value)}
                    >
                      <option value="">Todas las sedes</option>
                      {campuses.map((campus) => (
                        <option key={campus.id} value={campus.id}>
                          {campus.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-primary-700">Alumno</span>
                  <input
                    className="app-input"
                    placeholder="Buscar alumno por nombre o numero de documento"
                    value={transferStudentSearch}
                    onChange={(event) => setTransferStudentSearch(event.target.value)}
                  />
                </label>
              </div>

              {transferStudentLoading ? (
                <p className="text-sm text-primary-700">Buscando alumnos...</p>
              ) : null}

              {!transferStudentLoading && transferStudentResults.length > 0 ? (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {transferStudentResults.map((student) => {
                    const parsedDocument = parseDocumentValue(student.document_number);
                    return (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => selectTransferStudent(student)}
                        className="rounded-xl border border-primary-200 bg-white px-3 py-3 text-left hover:border-accent-300 hover:bg-accent-50"
                      >
                        <p className="font-semibold text-primary-900">
                          {student.first_name} {student.last_name}
                        </p>
                        <p className="text-xs text-primary-600">
                          {parsedDocument.document_type}: {parsedDocument.document_number || '-'}
                        </p>
                        <p className="mt-2 text-xs text-primary-700">
                          Sede asignada: {student.assigned_campus_name || 'Sin sede'}
                        </p>
                        <p className="text-xs text-primary-600">
                          {student.assigned_course_name || 'Sin curso'} |{' '}
                          {student.assigned_enrollment_status === 'ACTIVE'
                            ? 'Matricula activa'
                            : student.assigned_enrollment_status
                              ? `Matricula ${String(student.assigned_enrollment_status).toLowerCase()}`
                              : 'Sin matricula'}
                        </p>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-accent-700">
                          {student.assigned_enrollment_status === 'ACTIVE' ? 'Preparar traslado' : 'Revisar alumno'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {!transferStudentLoading && transferStudentResults.length === 0 ? (
                <p className="text-sm text-primary-700">
                  {transferStudentSearch.trim()
                    ? 'No se encontraron alumnos para ese criterio.'
                    : 'Escribe un nombre o documento para seleccionar al alumno que vas a trasladar.'}
                </p>
              ) : null}
            </div>
          ) : null}

          {showTransferForm && transferContext ? (
            <form onSubmit={submitTransferRequest} className="panel-soft space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-primary-900">
                    Solicitar traslado: {transferContext.student?.first_name} {transferContext.student?.last_name}
                  </h3>
                  <p className="text-sm text-primary-700">
                    Selecciona la matrícula de origen y la sede que deberá aceptar el traslado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeTransferForm}
                  className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
                >
                  Cerrar
                </button>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-primary-700">Matricula / curso actual</span>
                  <select
                    className="app-input"
                    value={transferForm.source_enrollment_id}
                    onChange={(event) =>
                      setTransferForm((prev) => ({ ...prev, source_enrollment_id: event.target.value }))
                    }
                    required
                  >
                    {transferContext.options.map((option) => (
                      <option key={option.enrollment_id} value={option.enrollment_id}>
                        {option.course_name} - {option.period_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-primary-700">Sede asignada</span>
                  <input
                    className="app-input"
                    value={selectedTransferOption?.source_campus_name || ''}
                    placeholder="Se completa al seleccionar el alumno"
                    readOnly
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-primary-700">Sede destino</span>
                  <select
                    className="app-input"
                    value={transferForm.target_campus_id}
                    onChange={(event) =>
                      setTransferForm((prev) => ({ ...prev, target_campus_id: event.target.value }))
                    }
                    required={Boolean(selectedTransferTargetCampuses.length)}
                    disabled={!selectedTransferOption || !selectedTransferTargetCampuses.length}
                  >
                    <option value="">
                      {selectedTransferTargetCampuses.length
                        ? 'Seleccione sede destino'
                        : 'No hay sedes destino disponibles'}
                    </option>
                    {selectedTransferTargetCampuses.map((campus) => (
                      <option key={campus.campus_id} value={campus.campus_id}>
                        {campus.campus_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-primary-200 bg-white px-3 py-3 text-sm text-primary-800">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={transferForm.allow_without_target_offering}
                  onChange={(event) =>
                    setTransferForm((prev) => ({
                      ...prev,
                      allow_without_target_offering: event.target.checked,
                    }))
                  }
                />
                <span>
                  <span className="block font-semibold text-primary-900">No es necesario que haya un curso</span>
                  <span className="block text-xs text-primary-700">
                    Si lo marcas, el traslado podrá enviarse aunque la sede destino no tenga una oferta activa del mismo
                    curso. En ese caso el alumno cambia de sede, pero no se crea matrícula nueva hasta registrar un curso
                    después.
                  </span>
                </span>
              </label>

              {selectedTransferOption ? (
                <div className="space-y-2 rounded-xl border border-primary-200 bg-white px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-primary-900">
                      Validación de sedes para el curso de origen
                    </p>
                    <p className="text-xs text-primary-700">
                      Aquí solo se muestran las sedes donde el mismo curso del alumno sí está habilitado.
                    </p>
                  </div>

                  {selectedTransferOption.course_enabled_campuses?.length ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      {selectedTransferOption.course_enabled_campuses.map((campus) => {
                        const campusId = String(campus.campus_id);
                        const isAvailableForTransfer = selectedTransferAvailableCampusIds.has(campusId);
                        const statusText = isAvailableForTransfer
                          ? 'Curso habilitado y disponible para traslado'
                          : 'Curso habilitado, pero esta sede no está disponible para esta solicitud';

                        return (
                          <label
                            key={campus.campus_id}
                            className="flex items-start gap-3 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-900"
                          >
                            <input type="checkbox" className="mt-1 h-4 w-4" checked readOnly />
                            <span>
                              <span className="block font-medium">{campus.campus_name}</span>
                              <span className="block text-xs text-primary-700">{statusText}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-red-700">
                      No hay sedes con este curso habilitado fuera de la sede de origen.
                    </p>
                  )}
                </div>
              ) : null}

              {selectedTransferOption ? (
                <div className="space-y-1">
                  <p className="text-sm text-primary-700">
                    Origen actual: {selectedTransferOption.source_campus_name} | Curso: {selectedTransferOption.course_name}
                    {' '}| Periodo: {selectedTransferOption.period_name}
                  </p>
                  {!(selectedTransferOption.target_campuses || []).length && !transferForm.allow_without_target_offering ? (
                    <p className="text-sm text-red-700">
                      No aparece un cambio de sede para esta matrícula porque no existe otra sede activa habilitada para
                      ese mismo curso y periodo. Marca la opción para permitir traslado sin curso.
                    </p>
                  ) : null}
                  {transferForm.allow_without_target_offering ? (
                    <p className="text-sm text-primary-700">
                      El traslado se registrará sin exigir curso equivalente en la sede destino.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <textarea
                className="app-input min-h-[110px]"
                placeholder="Motivo u observaciones del traslado (opcional)"
                value={transferForm.request_notes}
                onChange={(event) => setTransferForm((prev) => ({ ...prev, request_notes: event.target.value }))}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={submittingTransfer || !selectedTransferTargetCampuses.length}
                  className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submittingTransfer ? 'Registrando...' : 'Registrar solicitud'}
                </button>
                <button
                  type="button"
                  onClick={closeTransferForm}
                  className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <p className="rounded-xl border border-dashed border-primary-300 bg-white p-3 text-sm text-primary-700">
              Usa el botón <span className="font-semibold">TRASLADO</span> en el listado de alumnos para crear una
              solicitud desde la sede activa.
            </p>
          )}

          <article className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-primary-600">
                  <th className="pb-2 pr-3">Solicitud</th>
                  <th className="pb-2 pr-3">Alumno</th>
                  <th className="pb-2 pr-3">Curso / periodo</th>
                  <th className="pb-2 pr-3">Origen</th>
                  <th className="pb-2 pr-3">Destino</th>
                  <th className="pb-2 pr-3">Estado</th>
                  <th className="pb-2 pr-3">Notas</th>
                  <th className="pb-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {transferRequests.map((item) => {
                  const statusClassName =
                    item.status === 'APPROVED'
                      ? 'bg-primary-100 text-primary-800'
                      : item.status === 'REJECTED'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-accent-100 text-accent-800';
                  const directionLabel =
                    item.direction === 'INCOMING'
                      ? 'Recibir'
                      : item.direction === 'OUTGOING'
                        ? 'Enviada'
                        : 'General';

                  return (
                    <tr key={item.id} className="border-t border-primary-100 align-top">
                      <td className="py-2 pr-3">
                        <p className="font-medium text-primary-900">#{item.id}</p>
                        <p className="text-xs text-primary-600">{formatTransferTimestamp(item.created_at)}</p>
                        <p className="text-xs text-primary-600">{item.requested_by_name || 'Sin usuario origen'}</p>
                        <span className="mt-1 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-primary-700">
                          {directionLabel}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-primary-900">{item.student_name}</p>
                        <p className="text-xs text-primary-600">{item.student_document || '-'}</p>
                      </td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-primary-900">{item.course_name}</p>
                        <p className="text-xs text-primary-600">{item.period_name}</p>
                      </td>
                      <td className="py-2 pr-3">{item.source_campus_name}</td>
                      <td className="py-2 pr-3">{item.target_campus_name}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClassName}`}>
                          {item.status}
                        </span>
                        {item.reviewed_by_name ? (
                          <p className="mt-1 text-xs text-primary-600">
                            {item.reviewed_by_name} | {formatTransferTimestamp(item.decided_at)}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <p>{item.request_notes || 'Sin observaciones del origen.'}</p>
                        {item.review_notes ? (
                          <p className="mt-1 text-xs text-primary-600">Revision: {item.review_notes}</p>
                        ) : null}
                      </td>
                      <td className="py-2">
                        {item.can_review && canManageTransfers ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={reviewingTransferId === item.id}
                              onClick={() => resolveTransferRequest(item, 'APPROVE')}
                              className="rounded-lg border border-primary-300 bg-white px-2 py-1 text-xs font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              APROBAR
                            </button>
                            <button
                              type="button"
                              disabled={reviewingTransferId === item.id}
                              onClick={() => resolveTransferRequest(item, 'REJECT')}
                              className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              RECHAZAR
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-primary-500">Sin acciones</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!transferLoading && transferRequests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-sm text-primary-600">
                      No hay solicitudes de traslado para la sede activa.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>
        </div>
      ) : null}

      {activeTab === 'guardians' && canViewGuardians ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <input
                className="app-input w-72"
                placeholder="Buscar por nombre, correo, telefono o documento"
                value={guardianSearch}
                onChange={(event) => setGuardianSearch(event.target.value)}
              />
              <select
                className="app-input w-56"
                value={guardianLinkFilter}
                onChange={(event) => setGuardianLinkFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                <option value="yes">Con alumnos vinculados</option>
                <option value="no">Sin alumnos vinculados</option>
              </select>
            </div>

            {canManageGuardians ? (
              <button
                type="button"
                onClick={() => setShowGuardianForm((value) => !value)}
                className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
              >
                {showGuardianForm ? 'Cerrar formulario' : 'Nuevo apoderado'}
              </button>
            ) : null}
          </div>

          {showGuardianForm && canManageGuardians ? (
            <form onSubmit={submitGuardian} className="panel-soft space-y-3">
              <h2 className="text-lg font-semibold text-primary-900">Registrar apoderado</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input
                  className="app-input"
                  placeholder="Nombres"
                  value={guardianForm.first_name}
                  onChange={(event) => setGuardianForm((prev) => ({ ...prev, first_name: event.target.value }))}
                  required
                />
                <input
                  className="app-input"
                  placeholder="Apellidos"
                  value={guardianForm.last_name}
                  onChange={(event) => setGuardianForm((prev) => ({ ...prev, last_name: event.target.value }))}
                  required
                />
                <input
                  className="app-input"
                  placeholder="Documento"
                  value={guardianForm.document_number}
                  onChange={(event) => setGuardianForm((prev) => ({ ...prev, document_number: event.target.value }))}
                />
                <input
                  type="email"
                  className="app-input"
                  placeholder="Correo"
                  value={guardianForm.email}
                  onChange={(event) => setGuardianForm((prev) => ({ ...prev, email: event.target.value }))}
                />
                <input
                  className="app-input"
                  placeholder="Telefono"
                  value={guardianForm.phone}
                  onChange={(event) => setGuardianForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </div>

              <button
                type="submit"
                className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
              >
                Guardar apoderado
              </button>
            </form>
          ) : null}

          <article className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-primary-600">
                  <th className="pb-2 pr-3">Apoderado</th>
                  <th className="pb-2 pr-3">Contacto</th>
                  <th className="pb-2 pr-3">Documento</th>
                  <th className="pb-2">Alumnos vinculados</th>
                </tr>
              </thead>
              <tbody>
                {filteredGuardians.map((guardian) => (
                  <tr key={guardian.id} className="border-t border-primary-100">
                    <td className="py-2 pr-3 font-medium">
                      {guardian.first_name} {guardian.last_name}
                    </td>
                    <td className="py-2 pr-3">{guardian.email || guardian.phone || '-'}</td>
                    <td className="py-2 pr-3">{guardian.document_number || '-'}</td>
                    <td className="py-2">{Number(guardian.student_count || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </div>
      ) : null}
    </section>
  );
}
