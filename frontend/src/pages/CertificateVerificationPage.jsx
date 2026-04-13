import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, Calendar, MapPin, Loader2, XCircle, Home, CheckCircle2 } from 'lucide-react';

export default function CertificateVerificationPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [certificate, setCertificate] = useState(null);

  useEffect(() => {
    const abortController = new AbortController();

    const verifyCertificate = async () => {
      try {
        setLoading(true);
        setError('');
        // We use full normal axios since it's a public route and our api wrapper expects auth
        // Wait, if it's public we can just call it via /api
        const response = await axios.get(`/api/certificates/verify/${token}`, {
          signal: abortController.signal,
        });
        
        setCertificate(response.data.item);
      } catch (err) {
        if (!axios.isCancel(err)) {
          setError(err.response?.data?.message || 'No se pudo verificar este certificado. Compruébelo o póngase en contacto con administración.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      verifyCertificate();
    }

    return () => abortController.abort();
  }, [token]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '--/--/----';
    const date = new Date(`${dateStr}T00:00:00`);
    if (isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4 py-12 flex flex-col justify-center items-center">
      <div className="w-full max-w-lg">
        
        <div className="text-center mb-8">
           <div className="inline-flex items-center justify-center bg-white p-3 rounded-2xl shadow-sm mb-4">
             <span className="text-4xl font-black tracking-tight text-primary-900" style={{ fontFamily: '"Bebas Neue", sans-serif' }}>
                COMPUTRON
             </span>
           </div>
           <h1 className="text-2xl font-bold text-primary-900">Validación de Certificados</h1>
           <p className="text-primary-600 mt-2">Sistema oficial de credenciales y certificaciones</p>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl p-10 shadow-xl border border-primary-100 flex flex-col items-center justify-center space-y-4 text-primary-700">
            <Loader2 className="w-10 h-10 animate-spin text-accent-500" />
            <p className="font-medium animate-pulse">Verificando firma criptográfica...</p>
          </div>
        ) : error || !certificate ? (
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-red-100 text-center">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
               <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Certificado Inválido</h2>
            <p className="text-gray-600 mb-8">{error || 'El token provisto no existe en nuestra base de datos.'}</p>
            <Link to="/" className="inline-flex items-center justify-center gap-2 bg-primary-700 hover:bg-primary-800 text-white font-medium px-6 py-3 rounded-xl transition-colors w-full">
              <Home className="w-5 h-5" />
              Ir al inicio
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-xl border border-primary-100 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-accent-200 to-accent-100 rounded-bl-full opacity-50 -z-10" />
            
            <div className="p-8 pb-0">
               <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full font-semibold text-sm mb-6 border border-emerald-100">
                 <CheckCircle2 className="w-5 h-5 text-emerald-600" /> 
                 Certificado Oficial Válido
               </div>

               <h2 className="text-3xl font-bold text-gray-900 mb-1 leading-tight" style={{ fontFamily: '"Libre Baskerville", serif' }}>
                 {certificate.student_name}
               </h2>
               <p className="text-sm font-medium text-gray-500 mb-8">
                 Documento: {certificate.student_document || 'N/A'}
               </p>

               <div className="space-y-5">
                  <div>
                    <span className="text-xs font-bold tracking-wider text-gray-400 mb-1 block uppercase">Curso / Programa</span>
                    <p className="text-lg font-semibold text-primary-900">{certificate.course_name}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs font-bold tracking-wider text-gray-400 mb-1 block uppercase">Modalidad</span>
                      <p className="font-semibold text-gray-800">{certificate.modality || 'No especificada'}</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold tracking-wider text-gray-400 mb-1 block uppercase">Horas</span>
                      <p className="font-semibold text-gray-800">{certificate.hours_academic ? `${certificate.hours_academic} Académicas` : 'N/A'}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-gray-400 mb-1 uppercase">
                         <Calendar className="w-3.5 h-3.5" /> Culminación
                      </span>
                      <p className="font-semibold text-gray-800">{formatDate(certificate.end_date)}</p>
                    </div>
                    <div>
                      <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-gray-400 mb-1 uppercase">
                         <MapPin className="w-3.5 h-3.5" /> Sede Emisora
                      </span>
                      <p className="font-semibold text-gray-800">{certificate.city || 'Principal'}</p>
                    </div>
                  </div>
               </div>
            </div>

            <div className="mt-8 bg-gray-50 border-t border-gray-100 p-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
               <div>
                 <span className="text-xs text-gray-500 font-medium block">Código Único de Verificación</span>
                 <p className="font-mono bg-white border border-gray-200 px-3 py-1 rounded inline-block mt-1 font-bold text-gray-800 text-sm">
                   {certificate.certificate_code}
                 </p>
               </div>
               
               <div className="flex-shrink-0">
                  <ShieldCheck className="w-10 h-10 text-primary-200" />
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
