import { resolveReconciliationStatus } from '../../domain/profitability/reconciliation';
import { formatMoney } from './format';
import { StatusBadge } from './StatusBadge';

export function ReconciliationStatusView({
  label,
  profitDifference,
  cashDifference,
}: {
  label: string;
  profitDifference: unknown;
  cashDifference: unknown;
}) {
  const status = resolveReconciliationStatus(profitDifference, cashDifference);

  return (
    <div data-reconciliation-status={status}>
      <strong>{label}</strong>{' '}
      <StatusBadge
        tone={status === 'reconciled' ? 'positive' : status === 'difference' ? 'warning' : 'neutral'}
      >
        {status === 'reconciled'
          ? 'Mutabık'
          : status === 'difference'
            ? 'Mutabakat farkı'
            : 'Mutabakat hesaplanmadı'}
      </StatusBadge>
      {status === 'not_calculated' ? (
        <small>
          Eski snapshot — mutabakat bilgisi hesaplanmamış. Kaynak kayıt değiştirilmeden yeni bir
          versiyon oluşturarak güncel motorla yeniden hesaplayabilirsiniz.
        </small>
      ) : (
        <small>
          Tahakkuk farkı {formatMoney(profitDifference as number)} · Nakit farkı{' '}
          {formatMoney(cashDifference as number)}
        </small>
      )}
    </div>
  );
}
