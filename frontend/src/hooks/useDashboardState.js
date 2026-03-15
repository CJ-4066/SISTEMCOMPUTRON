import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { getCampusScopeId, setCampusScopeId } from '../utils/campusScope';

export default function useDashboardState({ canViewDashboard, canViewCampuses }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campuses, setCampuses] = useState([]);
  const [showCampusSelector, setShowCampusSelector] = useState(false);
  const [campusScopeId, setCampusScopeIdState] = useState(() => getCampusScopeId());
  const [campusDraftId, setCampusDraftId] = useState(() => String(getCampusScopeId() || ''));
  const [summary, setSummary] = useState({
    totals: {
      students: 0,
      courses: 0,
      payments: 0,
      income: '0.00',
    },
    recent_payments: [],
    morosity: [],
    charts: {
      payment_status: [],
      payment_methods: [],
      payments_by_day: [],
      morosity_by_campus: [],
    },
    visibility: {
      students: false,
      courses: false,
      payments: false,
      reports: false,
    },
  });

  useEffect(() => {
    if (!canViewDashboard) {
      setLoading(false);
      return;
    }

    const loadSummary = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/dashboard/summary');
        setSummary(response.data || {});
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'No se pudo cargar el dashboard.');
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, [canViewDashboard, campusScopeId]);

  useEffect(() => {
    if (!canViewCampuses) {
      setCampuses([]);
      return;
    }

    const loadCampuses = async () => {
      try {
        const response = await api.get('/campuses', { _skipCampusScope: true });
        setCampuses(response.data.items || []);
      } catch {
        setCampuses([]);
      }
    };

    loadCampuses();
  }, [canViewCampuses]);

  useEffect(() => {
    setCampusDraftId(String(campusScopeId || ''));
  }, [campusScopeId]);

  const selectedCampusName = useMemo(() => {
    if (!campusScopeId) return 'Todas las sedes';
    return campuses.find((campus) => Number(campus.id) === Number(campusScopeId))?.name || `Sede #${campusScopeId}`;
  }, [campusScopeId, campuses]);

  const toggleCampusSelector = () => {
    setShowCampusSelector((current) => !current);
  };

  const applyCampusScope = () => {
    const nextValue = campusDraftId ? Number(campusDraftId) : null;
    setCampusScopeId(nextValue);
    setCampusScopeIdState(nextValue);
    setShowCampusSelector(false);
  };

  const clearCampusScope = () => {
    setCampusScopeId(null);
    setCampusScopeIdState(null);
    setCampusDraftId('');
    setShowCampusSelector(false);
  };

  return {
    loading,
    error,
    summary,
    campuses,
    showCampusSelector,
    campusDraftId,
    selectedCampusName,
    setCampusDraftId,
    toggleCampusSelector,
    applyCampusScope,
    clearCampusScope,
  };
}
