import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.js';

void i18next.use(initReactI18next).init({
    lng: 'de',
    fallbackLng: 'de',
    resources: { de: { translation: de } },
    interpolation: { escapeValue: false }, // React escaped bereits
});

export default i18next;
