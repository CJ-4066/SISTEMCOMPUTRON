import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = 'Confirmar', 
  cancelText = 'Cancelar', 
  type = 'danger' 
}) {
  if (!isOpen) return null;

  const colorClasses = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-400 text-white',
    primary: 'bg-primary-700 hover:bg-primary-800 focus:ring-primary-600 text-white',
  }[type] || 'bg-primary-700 text-white';

  const iconColor = {
    danger: 'text-red-600 bg-red-50',
    warning: 'text-amber-600 bg-amber-50',
    primary: 'text-primary-700 bg-primary-50',
  }[type] || 'text-primary-700 bg-primary-50';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 bg-primary-950/40 backdrop-blur-[2px]"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 shadow-2xl border border-primary-100"
        >
          {/* Close button */}
          <button
            onClick={onCancel}
            className="absolute right-4 top-4 rounded-full p-2 text-primary-400 hover:bg-primary-50 hover:text-primary-600 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col items-center text-center">
            {/* Icon */}
            <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${iconColor}`}>
              <AlertTriangle size={32} />
            </div>

            {/* Title */}
            <h3 className="mb-2 text-xl font-bold text-primary-900">
              {title}
            </h3>

            {/* Message */}
            <p className="mb-8 text-sm text-primary-600 leading-relaxed">
              {message}
            </p>

            {/* Buttons */}
            <div className="flex w-full gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-2xl border border-primary-200 bg-white py-3 text-sm font-bold text-primary-700 transition hover:bg-primary-50 active:scale-95"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`flex-1 rounded-2xl py-3 text-sm font-bold shadow-lg transition active:scale-95 ${colorClasses}`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
