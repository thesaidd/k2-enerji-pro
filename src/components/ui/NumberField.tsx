import type { InputHTMLAttributes } from 'react';
import { finite } from './format';

export function NumberField({
  label,
  unit,
  hint,
  error,
  value,
  onValue,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  label: string;
  unit: string;
  hint?: string;
  error?: string;
  value: number | undefined;
  onValue: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-with-unit">
        <input
          {...props}
          type="number"
          value={value ?? ''}
          onChange={(event) => onValue(finite(event.target.value))}
        />
        <em>{unit}</em>
      </div>
      {hint && <small>{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
