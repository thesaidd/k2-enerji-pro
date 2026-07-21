import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Sayfa bulunamadı"
      description="Aradığınız ekran taşınmış veya bu bağlantı artık geçerli değil."
      action={
        <Link className="button primary" to="/">
          Gösterge paneline dön
        </Link>
      }
    />
  );
}
