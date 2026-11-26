// The app's language, as state (#89): every `t()` reads it, so a switch re-renders what is
// on screen without a reload. English until startLocale() (index.js) picks the language.

/** @typedef {'en' | 'de'} Locale */

/** @type {{ current: Locale }} */
export const locale = $state({ current: 'en' });
