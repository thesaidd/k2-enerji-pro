import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { useAppStore } from '../../app/store/useAppStore';

export function SaveStatus() {
  const status = useAppStore((state) => state.saveStatus);
  const lastSavedAt = useAppStore((state) => state.lastSavedAt);
  if (status === 'saving')
    return (
      <span className="save-status saving">
        <LoaderCircle size={14} className="spin" /> Kaydediliyor…
      </span>
    );
  if (status === 'dirty')
    return (
      <span className="save-status dirty">
        <CircleAlert size={14} /> Kaydedilmemiş değişiklikler var
      </span>
    );
  if (status === 'error')
    return (
      <span className="save-status error">
        <CircleAlert size={14} /> Kayıt başarısız
      </span>
    );
  if (status === 'saved')
    return (
      <span className="save-status saved">
        <Check size={14} /> Kaydedildi{' '}
        {lastSavedAt ? `· ${new Date(lastSavedAt).toLocaleTimeString('tr-TR')}` : ''}
      </span>
    );
  return <span className="save-status">Yerel çalışma alanı</span>;
}
