import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  label?: string;
  placeholder?: string;
  id?: string;
  borderColor?: string;
}

export default function PasswordInput({
  value, onChange, onKeyDown, label, placeholder = 'Enter password…', id, borderColor,
}: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      {label && <label className="pw-label" htmlFor={id}>{label}</label>}
      <div className="pw-wrapper">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="pw-input"
          style={borderColor ? { borderColor } : undefined}
        />
        <button
          type="button"
          className="pw-toggle"
          onClick={() => setShow(v => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
