import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
  icon: Icon,
  footer,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent';
  icon?: LucideIcon;
  footer?: ReactNode;
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-label">
        {Icon && <Icon size={17} aria-hidden="true" />}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
      {footer && <div className="metric-footer">{footer}</div>}
    </article>
  );
}
