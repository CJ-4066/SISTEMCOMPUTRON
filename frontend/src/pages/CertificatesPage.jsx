import { useMemo } from 'react';

export default function CertificatesPage() {
  const certificateVersion = useMemo(() => `2026-03-05-${Date.now()}`, []);
  const certificateUrl = useMemo(() => `/certificado.html?v=${certificateVersion}`, [certificateVersion]);

  const openGenerator = () => {
    window.open(certificateUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="space-y-3">
      <header className="card animate-rise">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-600">Certificaciones</p>
        <h1 className="text-2xl font-semibold text-primary-900">Generación de certificados</h1>
        <p className="mt-1 text-sm text-primary-700">
          Si dentro del sistema se visualiza pequeño, ábrelo en una nueva pestaña para trabajar en tamaño completo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openGenerator}
            className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            Abrir generador en nueva pestaña
          </button>
        </div>
      </header>
    </section>
  );
}
