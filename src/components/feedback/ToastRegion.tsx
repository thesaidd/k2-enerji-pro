import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { useAppStore } from '../../app/store/useAppStore';

const icons = { success: CheckCircle2, error: CircleAlert, warning: TriangleAlert, info: Info };

export function ToastRegion() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);
  return (
    <div className="toast-region" aria-live="polite" aria-label="Bildirimler">
      {toasts.map((toast) => {
        const Icon = icons[toast.tone];
        return (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <Icon size={20} />
            <div>
              <strong>{toast.title}</strong>
              {toast.detail && <p>{toast.detail}</p>}
            </div>
            <button
              className="icon-button"
              aria-label="Bildirimi kapat"
              onClick={() => dismiss(toast.id)}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
