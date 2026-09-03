import { useEffect, useRef, useState } from 'react';

/**
 * A numeric readout you can click and type into.
 *
 * Sliders are quick for approximate values and hopeless for exact ones, and a
 * zoom percentage is often something you know precisely. This shows the value
 * as plain text until clicked, then becomes a small field.
 *
 * While the field is open it is a real <input>, which both shortcut hooks treat
 * as a typing target — so typing "0" adjusts the value instead of jumping to
 * the dashboard, and the arrow keys step the number rather than turning pages.
 *
 *   Enter / blur   commit
 *   Escape         cancel and keep the previous value
 *   ↑ / ↓          step (Shift for ten times the step)
 */

interface Props {
  /** Value in display units — percent for zoom, points for a size. */
  value: number;
  onCommit: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shown after the number, e.g. '%', 'px', '°'. */
  suffix?: string;
  /** Accessible name; also used for the click-to-type tooltip. */
  label: string;
  width?: number;
  className?: string;
}

export default function ValueInput({
  value, onCommit, min, max, step = 1, suffix = '', label, width = 52, className = '',
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against blur firing after Escape has already closed the field.
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const begin = () => {
    cancelled.current = false;
    setDraft(String(value));
    setEditing(true);
  };

  const commit = () => {
    if (cancelled.current) return;
    setEditing(false);
    // Accept a comma as the decimal separator: several of the app's locales
    // use it, and number keypads emit it.
    const parsed = parseFloat(draft.replace(',', '.'));
    if (!isFinite(parsed)) return;
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (next !== value) onCommit(next);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`value-input ${className}`}
        style={{ minWidth: width }}
        onClick={begin}
        title={`${label} — click to type a value`}
      >
        <span className="num">{value}{suffix}</span>
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className={`value-field num ${className}`}
      style={{ width }}
      value={draft}
      inputMode="decimal"
      aria-label={label}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        // Stop the page-level shortcut handlers from also seeing these keys.
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelled.current = true;
          setEditing(false);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const current = parseFloat(draft.replace(',', '.'));
          const base = isFinite(current) ? current : value;
          const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 10 : step);
          setDraft(String(Math.round((base + delta) * 100) / 100));
        }
      }}
    />
  );
}
