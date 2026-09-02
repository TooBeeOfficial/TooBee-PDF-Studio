import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import el from './locales/el.json';
import tr from './locales/tr.json';
import es from './locales/es.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';

const SUPPORTED_LANGUAGES = ['en', 'el', 'tr', 'es', 'it', 'ja', 'zh'];
const LANGUAGE_STORAGE_KEY = 'toobee-language';

// Respect a language the user explicitly picked in Settings; otherwise default
// to the OS/browser locale (falling back to English if we don't support it).
function detectInitialLanguage(): string {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved;
  } catch { /* localStorage unavailable */ }

  const systemLang = (navigator.language || 'en').toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(systemLang) ? systemLang : 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      el: { translation: el },
      tr: { translation: tr },
      es: { translation: es },
      it: { translation: it },
      ja: { translation: ja },
      zh: { translation: zh }
    },
    lng: detectInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

i18n.on('languageChanged', (lng) => {
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, lng); } catch { /* localStorage unavailable */ }
});

export default i18n;
