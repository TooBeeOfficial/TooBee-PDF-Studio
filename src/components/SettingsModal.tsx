import { useTranslation } from 'react-i18next';
import { X, Moon, Sun } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const languages = [
  { code: 'en', label: 'English' },
  { code: 'el', label: 'Ελληνικά (Greek)' },
  { code: 'tr', label: 'Türkçe (Turkish)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'zh', label: '中文 (Chinese)' }
];

export default function SettingsModal({ isOpen, onClose, theme, toggleTheme }: Props) {
  const { t, i18n } = useTranslation();

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      animation: 'fadeIn 0.2s ease forwards'
    }}>
      <div className="card glass" style={{
        width: '400px',
        maxWidth: '90%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        position: 'relative'
      }}>
        <button 
          onClick={onClose}
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'transparent', border: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          <X size={20} />
        </button>

        <h2 style={{ margin: 0, fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          {t('settings.title')}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
            {t('settings.language')}
          </label>
          <select 
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            style={{
              padding: '0.75rem',
              borderRadius: '0.5rem',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
            {t('settings.theme')}
          </label>
          <button 
            className="btn btn-secondary" 
            onClick={toggleTheme} 
            style={{ justifyContent: 'center', padding: '0.75rem' }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}</span>
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
          <button className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
