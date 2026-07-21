export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'info';
}) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
