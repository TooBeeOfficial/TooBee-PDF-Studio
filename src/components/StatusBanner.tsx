import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import './StatusBanner.css';

type BannerType = 'success' | 'error' | 'info';

interface Props {
  type: BannerType;
  message: string;
}

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

export default function StatusBanner({ type, message }: Props) {
  const Icon = icons[type];
  return (
    // Errors interrupt; successes and notices wait for a pause. Without this a
    // screen-reader user never learns that an operation finished.
    <div
      className={`status-banner status-banner--${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={14} className="status-banner__icon" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
