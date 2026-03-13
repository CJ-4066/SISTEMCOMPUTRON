import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { downloadCsv } from '../utils/csv';
import { fetchAllPages } from '../utils/paginatedFetch';
import StudentPaymentsPage from './StudentPaymentsPage';

const PAYMENT_STATUS_LABELS = {
  COMPLETED: 'Completado',
  PENDING: 'Pendiente',
  REJECTED: 'Rechazado',
};

const PAYMENT_METHOD_LABELS = {
  YAPE: 'Yape',
  TRANSFERENCIA: 'Transferencia',
  QR: 'QR',
  EFECTIVO: 'Efectivo',
  OTRO: 'Otro',
};

const ALL_PENDING_INSTALLMENTS = 'ALL';
const PAYMENT_INITIAL_LIMIT = 10;
const PAYMENT_LOAD_STEP = 10;

const paymentDefaults = {
  student_id: '',
  selected_installment_id: ALL_PENDING_INSTALLMENTS,
  amount_received: '',
  method: 'YAPE',
  reference_code: '',
  notes: '',
  no_evidence: false,
};

const toPaymentStatusLabel = (status) => {
  const key = String(status || '').toUpperCase();
  return PAYMENT_STATUS_LABELS[key] || status || '-';
};

const toPaymentMethodLabel = (method) => {
  const key = String(method || '').toUpperCase();
  return PAYMENT_METHOD_LABELS[key] || method || '-';
};

const round2 = (value) => Number((Number(value) || 0).toFixed(2));

const yieldToBrowser = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });

const getApiErrorMessage = (requestError, fallbackMessage) => {
  const payload = requestError?.response?.data;

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.message) return parsed.message;
    } catch {
      // non-JSON text response
    }
  }

  return payload?.message || requestError?.message || fallbackMessage;
};

const openReceiptWindow = (title) => {
  const popup = window.open('about:blank', '_blank');
  if (!popup) return null;

  popup.document.open();
  popup.document.write(
    `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #1f2937; }
      .hint { color: #475569; font-size: 14px; }
    </style>
  </head>
  <body>
    <h2>Generando boleta...</h2>
    <p class="hint">Espera un momento.</p>
  </body>
</html>`,
  );
  popup.document.close();

  return popup;
};

const renderReceiptWindow = (popup, html) => {
  if (!popup || popup.closed) return;
  popup.document.open();
  popup.document.write(html || '');
  popup.document.close();
};

const uploadPaymentEvidence = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/payments/evidence', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return {
    evidenceUrl: response.data?.item?.evidence_url || null,
    evidenceName: response.data?.item?.evidence_name || file?.name || 'evidencia',
  };
};

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function StaffPaymentsPage() {
  const { hasPermission } = useAuth();

  const [payments, setPayments] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [pendingSummary, setPendingSummary] = useState({ student: null, summary: null, items: [] });

  const [form, setForm] = useState(paymentDefaults);
  const [evidenceFile, setEvidenceFile] = useState(null);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [studentFilter, setStudentFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');

  const [paymentVisibleCount, setPaymentVisibleCount] = useState(PAYMENT_INITIAL_LIMIT);
  const [hasMorePayments, setHasMorePayments] = useState(false);

  const [loadingPayments, setLoadingPayments] = useState(false);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [loadingCampuses, setLoadingCampuses] = useState(false);
  const [loadingPendingSummary, setLoadingPendingSummary] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [exportingPayments, setExportingPayments] = useState(false);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [receiptFormat, setReceiptFormat] = useState('F2');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submitModeRef = useRef('save');

  const canViewPayments = hasPermission(PERMISSIONS.PAYMENTS_VIEW);
  const canManagePayments = hasPermission(PERMISSIONS.PAYMENTS_MANAGE);
  const canViewEnrollments = hasPermission(PERMISSIONS.ENROLLMENTS_VIEW);
  const canViewCampuses = hasPermission(PERMISSIONS.CAMPUSES_VIEW);
  const canAccessPaymentsData = canViewPayments || canManagePayments;

  const paymentFilterParams = useMemo(
    () => ({
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      student_id: studentFilter ? Number(studentFilter) : undefined,
      campus_id: campusFilter ? Number(campusFilter) : undefined,
      date_from: dateFromFilter || undefined,
      date_to: dateToFilter || undefined,
    }),
    [campusFilter, dateFromFilter, dateToFilter, statusFilter, studentFilter],
  );

  const studentOptions = useMemo(() => {
    const map = new Map();
    for (const enrollment of enrollments) {
      if (!enrollment.student_id) continue;
      const key = String(enrollment.student_id);
      if (!map.has(key)) {
        map.set(key, {
          id: enrollment.student_id,
          label: enrollment.student_name || `Alumno #${enrollment.student_id}`,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [enrollments]);

  const selectedPendingItems = useMemo(() => {
    const items = pendingSummary.items || [];
    if (!form.selected_installment_id || form.selected_installment_id === ALL_PENDING_INSTALLMENTS) {
      return items;
    }
    return items.filter((item) => String(item.installment_id) === String(form.selected_installment_id));
  }, [form.selected_installment_id, pendingSummary.items]);

  const pendingInstallmentOptions = useMemo(() => {
    return (pendingSummary.items || []).map((item) => {
      const dueDate = item.due_date ? ` | Vence: ${item.due_date}` : '';
      const concept = item.concept_name ? ` (${item.concept_name})` : '';
      return {
        id: String(item.installment_id),
        label: `Cuota #${item.installment_id}${concept} - S/ ${round2(item.pending_amount).toFixed(2)}${dueDate}`,
        amount: round2(item.pending_amount),
      };
    });
  }, [pendingSummary.items]);

  const pendingTotals = useMemo(() => {
    const totalPending = round2(
      selectedPendingItems.reduce((sum, item) => sum + Number(item.pending_amount || 0), 0),
    );
    const amountReceived = round2(form.amount_received || 0);
    const amountApplied = round2(Math.min(amountReceived, totalPending));
    const remainingDebt = round2(Math.max(totalPending - amountReceived, 0));
    const overpayment = round2(Math.max(amountReceived - totalPending, 0));

    return {
      amountReceived,
      totalPending,
      amountApplied,
      remainingDebt,
      overpayment,
    };
  }, [form.amount_received, selectedPendingItems]);

  const allocationDetails = useMemo(() => {
    const details = [];
    let remainingToApply = pendingTotals.amountApplied;

    for (const item of selectedPendingItems) {
      if (remainingToApply <= 0) break;
      const pendingAmount = round2(item.pending_amount || 0);
      if (pendingAmount <= 0) continue;
      const amount = round2(Math.min(pendingAmount, remainingToApply));
      if (amount <= 0) continue;

      details.push({
        enrollment_id: Number(item.enrollment_id),
        installment_id: Number(item.installment_id),
        amount,
      });
      remainingToApply = round2(remainingToApply - amount);
    }

    return details;
  }, [pendingTotals.amountApplied, selectedPendingItems]);

  const allocationByEnrollment = useMemo(() => {
    const grouped = new Map();

    for (const detail of allocationDetails) {
      const key = String(detail.enrollment_id);
      if (!grouped.has(key)) {
        grouped.set(key, {
          enrollment_id: detail.enrollment_id,
          details: [],
          applied_amount: 0,
        });
      }
      const current = grouped.get(key);
      current.details.push({
        installment_id: detail.installment_id,
        amount: detail.amount,
      });
      current.applied_amount = round2(current.applied_amount + detail.amount);
    }

    return Array.from(grouped.values()).sort((a, b) => a.enrollment_id - b.enrollment_id);
  }, [allocationDetails]);

  const allocationByInstallment = useMemo(() => {
    const allocation = new Map();
    for (const detail of allocationDetails) {
      allocation.set(String(detail.installment_id), detail.amount);
    }
    return allocation;
  }, [allocationDetails]);

  const loadPayments = useCallback(
    async ({ limit = paymentVisibleCount } = {}) => {
      if (!canViewPayments) {
        setPayments([]);
        setHasMorePayments(false);
        return;
      }

      setLoadingPayments(true);
      try {
        const response = await api.get('/payments', {
          params: {
            ...paymentFilterParams,
            page: 1,
            page_size: limit,
            include_total: false,
          },
        });

        const items = response.data?.items || [];
        const meta = response.data?.meta || {};

        setPayments(items);
        setHasMorePayments(Boolean(meta.has_more));
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'No se pudieron cargar los pagos.');
      } finally {
        setLoadingPayments(false);
      }
    },
    [canViewPayments, paymentFilterParams, paymentVisibleCount],
  );

  const loadEnrollments = useCallback(async () => {
    if (!canViewEnrollments) {
      setEnrollments([]);
      return;
    }

    setLoadingEnrollments(true);
    try {
      const response = await api.get('/enrollments');
      setEnrollments(response.data?.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar las matrículas.');
    } finally {
      setLoadingEnrollments(false);
    }
  }, [canViewEnrollments]);

  const ensureEnrollmentsLoaded = useCallback(async () => {
    if (!canViewEnrollments || loadingEnrollments || enrollments.length > 0) return;
    await loadEnrollments();
  }, [canViewEnrollments, enrollments.length, loadEnrollments, loadingEnrollments]);

  const loadCampuses = useCallback(async () => {
    if (!canViewCampuses) {
      setCampuses([]);
      return;
    }

    setLoadingCampuses(true);
    try {
      const response = await api.get('/campuses', { _skipCampusScope: true });
      setCampuses(response.data?.items || []);
    } catch {
      setCampuses([]);
    } finally {
      setLoadingCampuses(false);
    }
  }, [canViewCampuses]);

  const loadPendingSummary = useCallback(
    async (studentId) => {
      if (!studentId || !canAccessPaymentsData) {
        setPendingSummary({ student: null, summary: null, items: [] });
        return;
      }

      setLoadingPendingSummary(true);
      try {
        const response = await api.get('/payments/pending-summary', {
          params: { student_id: Number(studentId) },
        });
        setPendingSummary({
          student: response.data?.student || null,
          summary: response.data?.summary || null,
          items: response.data?.items || [],
        });
      } catch (requestError) {
        setPendingSummary({ student: null, summary: null, items: [] });
        setError(requestError.response?.data?.message || 'No se pudo cargar el resumen de cuotas pendientes.');
      } finally {
        setLoadingPendingSummary(false);
      }
    },
    [canAccessPaymentsData],
  );

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    if (showPaymentForm) {
      ensureEnrollmentsLoaded();
    }
  }, [ensureEnrollmentsLoaded, showPaymentForm]);

  useEffect(() => {
    loadCampuses();
  }, [loadCampuses]);

  useEffect(() => {
    loadPendingSummary(form.student_id);
  }, [form.student_id, loadPendingSummary]);

  useEffect(() => {
    if (!pendingSummary.items.length) {
      if (form.selected_installment_id !== ALL_PENDING_INSTALLMENTS) {
        setForm((prev) => ({ ...prev, selected_installment_id: ALL_PENDING_INSTALLMENTS }));
      }
      return;
    }

    if (form.selected_installment_id === ALL_PENDING_INSTALLMENTS) return;

    const exists = pendingSummary.items.some(
      (item) => String(item.installment_id) === String(form.selected_installment_id),
    );
    if (!exists) {
      setForm((prev) => ({
        ...prev,
        selected_installment_id: ALL_PENDING_INSTALLMENTS,
        amount_received: '',
      }));
    }
  }, [form.selected_installment_id, pendingSummary.items]);

  useEffect(() => {
    if (form.method === 'EFECTIVO') {
      setForm((prev) => ({ ...prev, no_evidence: false }));
      setEvidenceFile(null);
    }
  }, [form.method]);

  const clearPaymentFilters = () => {
    setStatusFilter('ALL');
    setStudentFilter('');
    setCampusFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setPaymentVisibleCount(PAYMENT_INITIAL_LIMIT);
  };

  const resetPaymentForm = () => {
    setForm(paymentDefaults);
    setEvidenceFile(null);
    setPendingSummary({ student: null, summary: null, items: [] });
  };

  const handleInstallmentSelection = (value) => {
    if (value === ALL_PENDING_INSTALLMENTS) {
      const totalPending = round2(
        (pendingSummary.items || []).reduce((sum, item) => sum + Number(item.pending_amount || 0), 0),
      );
      setForm((prev) => ({
        ...prev,
        selected_installment_id: ALL_PENDING_INSTALLMENTS,
        amount_received: totalPending > 0 ? totalPending.toFixed(2) : '',
      }));
      return;
    }

    const selected = (pendingSummary.items || []).find((item) => String(item.installment_id) === String(value));
    setForm((prev) => ({
      ...prev,
      selected_installment_id: value,
      amount_received: selected ? round2(selected.pending_amount).toFixed(2) : prev.amount_received,
    }));
  };

  const exportPaymentsCsv = async () => {
    if (!canViewPayments) return;

    setExportingPayments(true);
    setMessage('');
    setError('');

    try {
      await yieldToBrowser();

      const allPayments = await fetchAllPages({
        path: '/payments',
        params: paymentFilterParams,
      });

      const rows = allPayments.map((item) => ({
        id: item.id,
        fecha_hora: formatDateTime(item.payment_date),
        usuario_registro: item.processed_by_name || '-',
        alumno: item.student_name || '',
        enrollment_id: item.enrollment_id || '',
        monto_aplicado: round2(item.total_amount).toFixed(2),
        monto_recibido: round2(item.amount_received).toFixed(2),
        saldo_favor: round2(item.overpayment_amount).toFixed(2),
        metodo: toPaymentMethodLabel(item.method),
        estado: toPaymentStatusLabel(item.status),
        referencia: item.reference_code || '',
        evidencia: item.no_evidence ? 'Sin evidencia (marcado)' : item.evidence_name || '',
      }));

      await downloadCsv({
        filename: `reporte_pagos_${new Date().toISOString().slice(0, 10)}.xlsx`,
        headers: [
          { key: 'id', label: 'ID' },
          { key: 'fecha_hora', label: 'Fecha/Hora' },
          { key: 'usuario_registro', label: 'Usuario registro' },
          { key: 'alumno', label: 'Alumno' },
          { key: 'enrollment_id', label: 'Matrícula ID' },
          { key: 'monto_aplicado', label: 'Monto aplicado' },
          { key: 'monto_recibido', label: 'Monto recibido' },
          { key: 'saldo_favor', label: 'Saldo a favor' },
          { key: 'metodo', label: 'Método' },
          { key: 'estado', label: 'Estado' },
          { key: 'referencia', label: 'Referencia' },
          { key: 'evidencia', label: 'Evidencia' },
        ],
        rows,
      });

      setMessage(`Reporte generado: ${rows.length} pagos exportados.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo exportar el reporte de pagos en Excel.');
    } finally {
      setExportingPayments(false);
    }
  };

  const openPaymentReceipt = useCallback(
    async (paymentId, { silent = false, format = receiptFormat, autoPrint = false } = {}) => {
      if (!paymentId) return;

      const receiptWindow = openReceiptWindow('Boleta de pago');
      if (!receiptWindow) {
        if (!silent) {
          setError('El navegador bloqueó la apertura de la boleta. Habilita ventanas emergentes e intenta de nuevo.');
        }
        return;
      }

      try {
        const response = await api.get(`/payments/${paymentId}/receipt`, {
          params: { format },
        });
        renderReceiptWindow(receiptWindow, response.data || '');

        if (autoPrint) {
          receiptWindow.focus();
          window.setTimeout(() => {
            if (!receiptWindow.closed) {
              receiptWindow.print();
            }
          }, 250);
        }
      } catch (requestError) {
        if (!receiptWindow.closed) {
          receiptWindow.close();
        }
        if (!silent) {
          setError(getApiErrorMessage(requestError, 'No se pudo emitir la boleta del pago.'));
        }
      }
    },
    [receiptFormat],
  );

  const previewPaymentReceipt = async ({ autoPrint = false } = {}) => {
    if (!form.student_id) {
      setError('Selecciona un alumno para la vista previa de boleta.');
      return;
    }

    const pendingByInstallment = new Map(
      (selectedPendingItems || []).map((item) => [Number(item.installment_id), item]),
    );

    const previewDetails = allocationDetails
      .map((detail) => {
        const pendingItem = pendingByInstallment.get(Number(detail.installment_id));
        const description = pendingItem?.concept_name
          ? `${pendingItem.concept_name} (Cuota ${detail.installment_id})`
          : `Cuota ${detail.installment_id}`;
        return {
          description,
          amount: round2(detail.amount),
          quantity: 1,
        };
      })
      .filter((item) => Number(item.amount) > 0);

    const previewAmount = round2(pendingTotals.amountReceived || 0);
    if (previewDetails.length === 0 || previewAmount <= 0) {
      setError('Ingresa un monto válido para generar la vista previa de boleta.');
      return;
    }

    const firstEnrollmentId =
      allocationByEnrollment[0]?.enrollment_id || selectedPendingItems[0]?.enrollment_id || null;

    const previewWindow = openReceiptWindow('Vista previa de boleta');
    if (!previewWindow) {
      setError('El navegador bloqueó la vista previa. Habilita ventanas emergentes e intenta de nuevo.');
      return;
    }

    try {
      setError('');
      const response = await api.post(
        '/payments/receipt-preview',
        {
          format: receiptFormat,
          student_id: Number(form.student_id),
          enrollment_id: firstEnrollmentId ? Number(firstEnrollmentId) : undefined,
          amount_received: previewAmount,
          details: previewDetails,
        },
      );
      renderReceiptWindow(previewWindow, response.data || '');

      if (autoPrint) {
        previewWindow.focus();
        window.setTimeout(() => {
          if (!previewWindow.closed) {
            previewWindow.print();
          }
        }, 250);
      }
    } catch (requestError) {
      if (!previewWindow.closed) {
        previewWindow.close();
      }
      if (requestError.response?.status === 404) {
        setError('La vista previa de boleta no está disponible en el backend actual. Reinicia el backend.');
        return;
      }

      setError(getApiErrorMessage(requestError, 'No se pudo generar la vista previa de la boleta.'));
    }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    if (!canManagePayments) return;
    const shouldPrintReceipt = submitModeRef.current === 'print';

    setSavingPayment(true);
    setMessage('');
    setError('');

    try {
      await yieldToBrowser();

      if (!form.student_id) {
        throw new Error('Selecciona un alumno.');
      }

      if (!selectedPendingItems.length) {
        throw new Error('El alumno no tiene cuotas pendientes.');
      }

      if (pendingTotals.amountReceived <= 0) {
        throw new Error('Ingresa un monto válido para el pago.');
      }

      if (allocationByEnrollment.length === 0) {
        throw new Error('El monto ingresado no se puede aplicar a cuotas pendientes.');
      }

      const needsEvidence = form.method !== 'EFECTIVO';
      if (needsEvidence && !form.no_evidence && !evidenceFile) {
        throw new Error('Adjunta una evidencia o marca "No se tiene evidencias".');
      }

      let evidenceUrl = null;
      let evidenceName = null;
      if (needsEvidence && !form.no_evidence && evidenceFile) {
        const uploadedEvidence = await uploadPaymentEvidence(evidenceFile);
        evidenceUrl = uploadedEvidence.evidenceUrl;
        evidenceName = uploadedEvidence.evidenceName;

        if (!evidenceUrl) {
          throw new Error('No se pudo obtener una URL válida para la evidencia subida.');
        }
      }

      let createdPayments = 0;
      let firstCreatedPaymentId = null;
      for (let index = 0; index < allocationByEnrollment.length; index += 1) {
        const group = allocationByEnrollment[index];
        const groupReceived = round2(group.applied_amount + (index === 0 ? pendingTotals.overpayment : 0));

        const extraNotes = [];
        if (pendingTotals.remainingDebt > 0 && index === 0) {
          extraNotes.push(`Saldo pendiente tras pago: S/ ${pendingTotals.remainingDebt.toFixed(2)}`);
        }
        if (pendingTotals.overpayment > 0 && index === 0) {
          extraNotes.push(`Saldo a favor generado: S/ ${pendingTotals.overpayment.toFixed(2)}`);
        }

        const mergedNotes = [form.notes.trim(), ...extraNotes].filter(Boolean).join(' | ') || null;

        const response = await api.post('/payments', {
          student_id: Number(form.student_id),
          enrollment_id: Number(group.enrollment_id),
          method: form.method,
          status: 'COMPLETED',
          reference_code: form.reference_code.trim() || null,
          notes: mergedNotes,
          amount_received: groupReceived,
          evidence_name: evidenceName,
          evidence_url: evidenceUrl,
          no_evidence: needsEvidence ? Boolean(form.no_evidence) : false,
          details: group.details,
        });

        if (!firstCreatedPaymentId && response.data?.item?.id) {
          firstCreatedPaymentId = Number(response.data.item.id);
        }

        createdPayments += 1;
      }

      const resultParts = [`Pago registrado (${createdPayments} registro(s)).`];
      if (pendingTotals.remainingDebt > 0) {
        resultParts.push(`Saldo pendiente: S/ ${pendingTotals.remainingDebt.toFixed(2)}.`);
      }
      if (pendingTotals.overpayment > 0) {
        resultParts.push(`Saldo a favor: S/ ${pendingTotals.overpayment.toFixed(2)}.`);
      }

      setMessage(resultParts.join(' '));
      setShowPaymentForm(false);
      resetPaymentForm();
      setPaymentVisibleCount(PAYMENT_INITIAL_LIMIT);
      await loadPayments({ limit: PAYMENT_INITIAL_LIMIT });

      if (firstCreatedPaymentId) {
        await openPaymentReceipt(firstCreatedPaymentId, {
          silent: true,
          format: receiptFormat,
          autoPrint: shouldPrintReceipt,
        });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'No se pudo registrar el pago.');
    } finally {
      submitModeRef.current = 'save';
      setSavingPayment(false);
    }
  };

  const updateStatus = useCallback(
    async (paymentId, status) => {
      if (!canManagePayments) return;

      setMessage('');
      setError('');

      try {
        await yieldToBrowser();
        await api.patch(`/payments/${paymentId}/status`, { status });
        setMessage('Estado de pago actualizado.');
        await loadPayments();
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'No se pudo actualizar el estado del pago.');
      }
    },
    [canManagePayments, loadPayments],
  );

  const paymentTableRows = useMemo(
    () =>
      payments.map((payment) => (
        <tr key={payment.id} className="border-t border-primary-100">
          <td className="py-2 pr-3">#{payment.id}</td>
          <td className="py-2 pr-3">{formatDateTime(payment.payment_date)}</td>
          <td className="py-2 pr-3">{payment.processed_by_name || '-'}</td>
          <td className="py-2 pr-3 font-medium">{payment.student_name}</td>
          <td className="py-2 pr-3">S/ {round2(payment.total_amount).toFixed(2)}</td>
          <td className="py-2 pr-3">S/ {round2(payment.amount_received).toFixed(2)}</td>
          <td className="py-2 pr-3">S/ {round2(payment.overpayment_amount).toFixed(2)}</td>
          <td className="py-2 pr-3">{toPaymentMethodLabel(payment.method)}</td>
          <td className="py-2 pr-3">
            {payment.no_evidence ? (
              <span className="text-xs font-semibold text-amber-700">Sin evidencia (marcado)</span>
            ) : payment.evidence_url ? (
              <a
                href={payment.evidence_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-primary-700 underline"
              >
                {payment.evidence_name || 'Ver evidencia'}
              </a>
            ) : (
              '-'
            )}
          </td>
          <td className="py-2 pr-3">{toPaymentStatusLabel(payment.status)}</td>
          <td className="py-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-primary-200 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => openPaymentReceipt(payment.id)}
              >
                Boleta
              </button>
              <button
                type="button"
                className="rounded-lg border border-primary-200 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => updateStatus(payment.id, 'COMPLETED')}
                disabled={!canManagePayments}
              >
                Completar
              </button>
              <button
                type="button"
                className="rounded-lg border border-accent-200 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => updateStatus(payment.id, 'PENDING')}
                disabled={!canManagePayments}
              >
                Pendiente
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => updateStatus(payment.id, 'REJECTED')}
                disabled={!canManagePayments}
              >
                Rechazar
              </button>
            </div>
          </td>
        </tr>
      )),
    [canManagePayments, openPaymentReceipt, payments, updateStatus],
  );

  if (!canViewPayments && !canManagePayments) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Pagos</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este módulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Pagos simplificados</h1>
          <p className="text-sm text-primary-700">
            Selecciona alumno, valida sus cuotas pendientes y registra pago con cálculo automático.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
            {payments.length} pagos cargados
          </span>
          {canManagePayments ? (
            <button
              type="button"
              onClick={() => {
                if (showPaymentForm) {
                  setShowPaymentForm(false);
                  resetPaymentForm();
                } else {
                  setShowPaymentForm(true);
                }
              }}
              className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800"
            >
              {showPaymentForm ? 'Cerrar formulario' : 'Registrar pago'}
            </button>
          ) : null}
        </div>
      </div>

      {message ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {canManagePayments && canViewEnrollments && showPaymentForm ? (
        <form onSubmit={submitPayment} className="panel-soft space-y-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <select
              className="app-input lg:col-span-2"
              value={form.student_id}
              onFocus={ensureEnrollmentsLoaded}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  student_id: event.target.value,
                  selected_installment_id: ALL_PENDING_INSTALLMENTS,
                  amount_received: '',
                }))
              }
              required
            >
              <option value="">Seleccione alumno</option>
              {studentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.label}
                </option>
              ))}
            </select>

            <select
              className="app-input lg:col-span-2"
              value={form.selected_installment_id}
              onChange={(event) => handleInstallmentSelection(event.target.value)}
              disabled={!form.student_id || loadingPendingSummary}
            >
              <option value={ALL_PENDING_INSTALLMENTS}>Todas las cuotas pendientes</option>
              {pendingInstallmentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="0.01"
              step="0.01"
              className="app-input"
              placeholder="Monto que cancela"
              value={form.amount_received}
              onChange={(event) => setForm((prev) => ({ ...prev, amount_received: event.target.value }))}
              required
            />

            <select
              className="app-input"
              value={form.method}
              onChange={(event) => setForm((prev) => ({ ...prev, method: event.target.value }))}
              required
            >
              <option value="YAPE">Yape</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="QR">QR</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="OTRO">Otro</option>
            </select>

            <input
              className="app-input lg:col-span-2"
              placeholder="Referencia (opcional)"
              value={form.reference_code}
              onChange={(event) => setForm((prev) => ({ ...prev, reference_code: event.target.value }))}
            />

            <input
              className="app-input lg:col-span-2"
              placeholder="Observaciones (opcional)"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />

            <select
              className="app-input"
              value={receiptFormat}
              onChange={(event) => setReceiptFormat(event.target.value)}
            >
              <option value="F1">Boleta Ticketera</option>
              <option value="F2">Boleta A4</option>
            </select>
          </div>

          {form.method !== 'EFECTIVO' ? (
            <div className="grid gap-3 lg:grid-cols-4">
              <label className="app-input flex items-center gap-2 lg:col-span-2">
                <input
                  type="checkbox"
                  checked={form.no_evidence}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      no_evidence: event.target.checked,
                    }))
                  }
                />
                No se tiene evidencias
              </label>

              <input
                type="file"
                accept="image/*,.pdf"
                className="app-input lg:col-span-2"
                onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)}
                disabled={form.no_evidence}
                required={!form.no_evidence}
              />
            </div>
          ) : null}

          {evidenceFile ? <p className="text-xs text-primary-700">Evidencia seleccionada: {evidenceFile.name}</p> : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-primary-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Total pendiente</p>
              <p className="mt-1 text-xl font-semibold text-primary-900">S/ {pendingTotals.totalPending.toFixed(2)}</p>
            </article>
            <article className="rounded-xl border border-primary-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Monto aplicado</p>
              <p className="mt-1 text-xl font-semibold text-primary-900">S/ {pendingTotals.amountApplied.toFixed(2)}</p>
            </article>
            <article className="rounded-xl border border-primary-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Saldo pendiente</p>
              <p className="mt-1 text-xl font-semibold text-primary-900">S/ {pendingTotals.remainingDebt.toFixed(2)}</p>
            </article>
            <article className="rounded-xl border border-primary-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Saldo a favor</p>
              <p className="mt-1 text-xl font-semibold text-primary-900">S/ {pendingTotals.overpayment.toFixed(2)}</p>
            </article>
          </div>

          {loadingPendingSummary ? <p className="text-sm text-primary-700">Cargando cuotas pendientes...</p> : null}

          {selectedPendingItems.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-primary-600">
                    <th className="pb-2 pr-3">Matrícula</th>
                    <th className="pb-2 pr-3">Curso</th>
                    <th className="pb-2 pr-3">Cuota</th>
                    <th className="pb-2 pr-3">Vence</th>
                    <th className="pb-2 pr-3">Pendiente</th>
                    <th className="pb-2">Aplicar</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPendingItems.map((item) => {
                    const allocatedAmount = round2(
                      allocationByInstallment.get(String(item.installment_id)) || 0,
                    );

                    return (
                      <tr key={item.installment_id} className="border-t border-primary-100">
                        <td className="py-2 pr-3">#{item.enrollment_id}</td>
                        <td className="py-2 pr-3">
                          {item.course_name} - {item.campus_name}
                        </td>
                        <td className="py-2 pr-3">
                          #{item.installment_id} {item.concept_name ? `(${item.concept_name})` : ''}
                        </td>
                        <td className="py-2 pr-3">{item.due_date}</td>
                        <td className="py-2 pr-3">S/ {round2(item.pending_amount).toFixed(2)}</td>
                        <td className="py-2 font-semibold">S/ {allocatedAmount.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loadingPendingSummary && form.student_id && selectedPendingItems.length === 0 ? (
            <p className="text-sm text-primary-700">El alumno seleccionado no tiene cuotas pendientes.</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={previewPaymentReceipt}
              disabled={loadingPendingSummary || loadingEnrollments}
              className="rounded-xl border border-primary-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Vista previa boleta
            </button>

            <button
              type="submit"
              onClick={() => {
                submitModeRef.current = 'save';
              }}
              disabled={savingPayment || loadingPendingSummary || loadingEnrollments}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingPayment ? 'Registrando...' : 'Guardar pago'}
            </button>

            <button
              type="submit"
              onClick={() => {
                submitModeRef.current = 'print';
              }}
              disabled={savingPayment || loadingPendingSummary || loadingEnrollments}
              className="rounded-xl border border-accent-300 px-4 py-2 text-sm font-semibold text-accent-800 hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingPayment ? 'Procesando...' : 'Guardar e imprimir'}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPaymentForm(false);
                resetPaymentForm();
              }}
              className="rounded-xl border border-primary-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {canViewPayments ? (
        <article className="card overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Historial y reporte de pagos</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={clearPaymentFilters}
                disabled={
                  loadingPayments ||
                  (statusFilter === 'ALL' && !studentFilter && !campusFilter && !dateFromFilter && !dateToFilter)
                }
                className="rounded-lg border border-primary-200 px-3 py-2 text-sm text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Limpiar filtros
              </button>
              <button
                type="button"
                onClick={exportPaymentsCsv}
                disabled={loadingPayments || exportingPayments}
                className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-sm font-semibold text-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exportingPayments ? 'Exportando...' : 'Exportar Excel'}
              </button>
            </div>
          </div>

          <div className={`mb-3 grid gap-2 ${canViewCampuses ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
            <select
              className="app-input"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPaymentVisibleCount(PAYMENT_INITIAL_LIMIT);
              }}
            >
              <option value="ALL">Todos los estados</option>
              <option value="COMPLETED">Completados</option>
              <option value="PENDING">Pendientes</option>
              <option value="REJECTED">Rechazados</option>
            </select>

            <select
              className="app-input"
              value={studentFilter}
              onFocus={ensureEnrollmentsLoaded}
              onChange={(event) => {
                setStudentFilter(event.target.value);
                setPaymentVisibleCount(PAYMENT_INITIAL_LIMIT);
              }}
            >
              <option value="">Todos los alumnos</option>
              {studentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.label}
                </option>
              ))}
            </select>

            {canViewCampuses ? (
              <select
                className="app-input"
                value={campusFilter}
                onChange={(event) => {
                  setCampusFilter(event.target.value);
                  setPaymentVisibleCount(PAYMENT_INITIAL_LIMIT);
                }}
                disabled={loadingCampuses}
              >
                <option value="">Todas las sedes</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            ) : null}

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary-700">Desde</span>
              <input
                type="date"
                className="app-input"
                value={dateFromFilter}
                onChange={(event) => {
                  setDateFromFilter(event.target.value);
                  setPaymentVisibleCount(PAYMENT_INITIAL_LIMIT);
                }}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary-700">Hasta</span>
              <input
                type="date"
                className="app-input"
                value={dateToFilter}
                onChange={(event) => {
                  setDateToFilter(event.target.value);
                  setPaymentVisibleCount(PAYMENT_INITIAL_LIMIT);
                }}
              />
            </label>
          </div>

          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-primary-600">
                <th className="pb-2 pr-3">ID</th>
                <th className="pb-2 pr-3">Fecha/Hora</th>
                <th className="pb-2 pr-3">Usuario registro</th>
                <th className="pb-2 pr-3">Alumno</th>
                <th className="pb-2 pr-3">Aplicado</th>
                <th className="pb-2 pr-3">Recibido</th>
                <th className="pb-2 pr-3">Saldo favor</th>
                <th className="pb-2 pr-3">Método</th>
                <th className="pb-2 pr-3">Evidencia</th>
                <th className="pb-2 pr-3">Estado</th>
                <th className="pb-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {paymentTableRows}

              {!loadingPayments && payments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-4 text-center text-sm text-primary-600">
                    No se encontraron pagos con los filtros seleccionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap gap-2">
            {hasMorePayments ? (
              <button
                type="button"
                onClick={() => setPaymentVisibleCount((current) => current + PAYMENT_LOAD_STEP)}
                disabled={loadingPayments}
                className="rounded-lg border border-primary-300 px-3 py-2 text-sm font-semibold text-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingPayments ? 'Cargando...' : `Ver ${PAYMENT_LOAD_STEP} pagos más`}
              </button>
            ) : null}
            {paymentVisibleCount > PAYMENT_INITIAL_LIMIT ? (
              <button
                type="button"
                onClick={() => setPaymentVisibleCount(PAYMENT_INITIAL_LIMIT)}
                disabled={loadingPayments}
                className="rounded-lg border border-primary-200 px-3 py-2 text-sm text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ver solo los últimos {PAYMENT_INITIAL_LIMIT}
              </button>
            ) : null}
          </div>
        </article>
      ) : null}
    </section>
  );
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const isAlumnoProfile = (user?.roles || []).length === 1 && (user?.roles || []).includes('ALUMNO');

  if (isAlumnoProfile) {
    return <StudentPaymentsPage />;
  }

  return <StaffPaymentsPage />;
}
