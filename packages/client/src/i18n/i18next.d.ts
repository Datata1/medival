import type de from './de.js';

declare module 'i18next' {
    interface CustomTypeOptions {
        resources: { translation: typeof de };
    }
}
