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
    <div className={`status-banner status-banner--${type}`}>
      <Icon size={14} className="status-banner__icon" />
      <span>{message}</span>
    </div>
  );
}
