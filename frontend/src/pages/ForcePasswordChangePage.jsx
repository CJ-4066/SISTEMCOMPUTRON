import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ForcePasswordChangePage() {
  const { user, mustChangePassword, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    new_password: '',
    confirm_password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (form.new_password.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (form.new_password !== form.confirm_password) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    setSaving(true);
    try {
      const result = await changePassword({ newPassword: form.new_password });
      if (!result.ok) {
        setError(result.message || 'No se pudo actualizar la contraseña.');
        return;
      }

      navigate('/', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-primary-200 bg-white p-7 shadow-soft">
        <p className="text-xs uppercase tracking-[0.2em] text-primary-500">Primer ingreso</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary-900">Cambia tu contraseña</h1>
        <p className="mt-2 text-sm text-primary-700">
          Tu usuario <strong>{user.email}</strong> fue creado con una contraseña temporal. Debes definir una nueva
          clave para continuar.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium">Nueva contraseña</label>
            <input
              type="password"
              required
              className="app-input"
              value={form.new_password}
              onChange={(event) => setForm((prev) => ({ ...prev, new_password: event.target.value }))}
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Confirmar contraseña</label>
            <input
              type="password"
              required
              className="app-input"
              value={form.confirm_password}
              onChange={(event) => setForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
              placeholder="Repite la nueva contraseña"
            />
          </div>

          {error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
            <button
              type="button"
              onClick={logout}
              disabled={saving}
              className="rounded-xl border border-primary-300 px-4 py-2.5 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Salir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
