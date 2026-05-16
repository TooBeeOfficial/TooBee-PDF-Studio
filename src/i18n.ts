import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import el from './locales/el.json';
import tr from './locales/tr.json';
import es from './locales/es.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';

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
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
