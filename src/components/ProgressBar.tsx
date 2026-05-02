import './ProgressBar.css';

interface Props {
  value: number;    // 0–100
  label?: string;
  detail?: string;
}

export default function ProgressBar({ value, label, detail }: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="progress-root">
      {(label || detail) && (
        <div className="progress-header">
          {label && <span>{label}</span>}
          {detail && <span>{detail}</span>}
        </div>
      )}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
