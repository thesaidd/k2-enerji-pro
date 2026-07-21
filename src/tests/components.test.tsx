import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricCard } from '../components/ui/MetricCard';
import { EmptyState } from '../components/ui/EmptyState';
import { FileText } from 'lucide-react';

describe('temel arayüz bileşenleri', () => {
  it('metrik kartını erişilebilir metinle gösterir', () => {
    render(
      <MetricCard label="EPSAŞ net kârı" value="₺100.000,00" detail="%5,00" tone="positive" />,
    );
    expect(screen.getByText('EPSAŞ net kârı')).toBeInTheDocument();
    expect(screen.getByText('₺100.000,00')).toBeInTheDocument();
  });

  it('boş durumda sonraki adımı açıklar', () => {
    render(
      <EmptyState
        icon={FileText}
        title="Henüz teklif yok"
        description="İlk teklifinizi oluşturun."
        action={<button>Teklif oluştur</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Teklif oluştur' })).toBeVisible();
  });
});
