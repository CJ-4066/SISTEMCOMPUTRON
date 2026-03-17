import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, loading, isAuthenticated, mustChangePassword } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  if (isAuthenticated) {
    return <Navigate to={mustChangePassword ? '/change-password' : '/'} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const result = await login(form.email, form.password);
    if (!result.ok) {
      setError(result.message || 'Credenciales inválidas.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-primary-200 bg-white p-7 shadow-soft">
        <p className="text-xs uppercase tracking-[0.2em] text-primary-500">Instituto Computron</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary-900">Ingreso al sistema</h1>
        <p className="mt-1 text-sm text-primary-700">Accede con tu usuario institucional.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium">Correo</label>
            <input
              type="email"
              required
              className="app-input"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="admin@computron.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Contraseña</label>
            <input
              type="password"
              required
              className="app-input"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="********"
            />
          </div>

          {error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Validando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
