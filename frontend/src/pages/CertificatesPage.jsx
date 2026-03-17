import CertificateGeneratorLauncher from '../components/certificates/CertificateGeneratorLauncher';

export default function CertificatesPage() {
  return (
    <section className="space-y-3">
      <header className="card animate-rise">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-600">Certificaciones</p>
        <h1 className="text-2xl font-semibold text-primary-900">Generación de certificados</h1>
        <p className="mt-1 text-sm text-primary-700">
          Configura primero los datos del certificado y luego abre el generador con toda la información precargada.
        </p>
      </header>

      <CertificateGeneratorLauncher />
    </section>
  );
}
