import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Monitor, Moon, Sun } from 'lucide-react';
import { usePrefsStore, type ThemeChoice, type PerfTier } from '../store/usePrefsStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
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

export default function SettingsModal({ isOpen, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const themeChoice = usePrefsStore(s => s.themeChoice);
  const setTheme = usePrefsStore(s => s.setTheme);
  const perf = usePrefsStore(s => s.perf);
  const setPerf = usePrefsStore(s => s.setPerf);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Remember what was focused before opening so it can be restored on close.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Trap focus inside the panel.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const themes: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: 'system', label: t('settings.themeSystem'), icon: Monitor },
    { value: 'light', label: t('settings.themeLight'), icon: Sun },
    { value: 'dark', label: t('settings.themeDark'), icon: Moon },
  ];

  const tiers: { value: PerfTier; label: string; hint: string }[] = [
    { value: 'full', label: t('settings.perfFull'), hint: t('settings.perfFullHint') },
    { value: 'light', label: t('settings.perfLight'), hint: t('settings.perfLightHint') },
    { value: 'minimal', label: t('settings.perfMinimal'), hint: t('settings.perfMinimalHint') },
  ];

  const activeHint = tiers.find(x => x.value === perf)?.hint ?? '';

  return (
    <div
      className="modal-scrim"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="modal-head">
          <h2 id="settings-title">{t('settings.title')}</h2>
          <button
            ref={closeRef}
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label={t('settings.close')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="field">
          <label htmlFor="settings-language">{t('settings.language')}</label>
          <select
            id="settings-language"
            className="select"
            value={i18n.language}
            onChange={e => i18n.changeLanguage(e.target.value)}
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label id="settings-theme-label">{t('settings.theme')}</label>
          <div className="segmented" role="group" aria-labelledby="settings-theme-label">
            {themes.map(option => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                aria-pressed={themeChoice === option.value}
              >
                <option.icon size={14} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label id="settings-perf-label">{t('settings.performance')}</label>
          <div className="segmented" role="group" aria-labelledby="settings-perf-label">
            {tiers.map(tier => (
              <button
                key={tier.value}
                onClick={() => setPerf(tier.value)}
                aria-pressed={perf === tier.value}
              >
                {tier.label}
              </button>
            ))}
          </div>
          <p className="hint">{activeHint}</p>
        </div>

        <div className="field">
          <label>{t('settings.shortcuts')}</label>
          <dl className="shortcuts">
            <div><dt>{t('settings.scTools')}</dt><dd><kbd>Alt</kbd><kbd>1</kbd>–<kbd>9</kbd></dd></div>
            <div><dt>{t('settings.scDashboard')}</dt><dd><kbd>Alt</kbd><kbd>0</kbd></dd></div>
            <div><dt>{t('settings.scSettings')}</dt><dd><kbd>Ctrl</kbd><kbd>,</kbd></dd></div>
            <div><dt>{t('settings.scTheme')}</dt><dd><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>L</kbd></dd></div>
          </dl>
        </div>

        <div className="field">
          <label>{t('settings.shortcutsPreview')}</label>
          <dl className="shortcuts">
            <div><dt>{t('settings.scZoom')}</dt><dd><kbd>Shift</kbd>/<kbd>Ctrl</kbd>+{t('settings.scWheel')} · <kbd>Ctrl</kbd><kbd>+</kbd><kbd>−</kbd></dd></div>
            <div><dt>{t('settings.scZoomReset')}</dt><dd><kbd>Ctrl</kbd><kbd>0</kbd></dd></div>
            <div><dt>{t('settings.scPage')}</dt><dd><kbd>PgUp</kbd><kbd>PgDn</kbd></dd></div>
            <div><dt>{t('settings.scNudge')}</dt><dd><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd></dd></div>
            <div><dt>{t('settings.scDeleteSel')}</dt><dd><kbd>Del</kbd></dd></div>
          </dl>
        </div>

        <button className="btn btn-primary btn-block" onClick={onClose}>
          {t('settings.close')}
        </button>
      </div>
    </div>
  );
}
