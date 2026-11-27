// No German outside the German catalogue (#89): text people read comes from src/lib/i18n,
// in both languages, and German only from de.js. Adapted from Le-Space/belege
// (app/eslint/no-german.js). Flags a string literal, a template's text, or Svelte markup text
// and attribute values that look German: an umlaut or ß, a German quotation mark „, or a
// common German word.
//
// German on purpose says so where it stands:
// `// eslint-disable-next-line decontact/no-german -- why`.
//
// src/lib/i18n/no-german.spec.js runs this rule over src/ with ESLint's Linter, so the unit
// tests (and CI) fail on German text outside de.js.

const MARKS = /[äöüÄÖÜß„]/;
// common German words; each also with a capital first letter ("Nur speichern"), never all
// capitals ("MIT")
const WORD_LIST = [
	// small words
	'und', 'oder', 'nicht', 'nur', 'kein', 'keine', 'keinen', 'ist', 'sind', 'wird', 'werden',
	'wurde', 'wurden', 'mit', 'für', 'auf', 'bei', 'nach', 'noch', 'schon', 'auch', 'vom', 'zum',
	'zur', 'eine', 'einen', 'einem', 'einer', 'bitte', 'dein', 'deine', 'deinen', 'deinem',
	'deiner', 'dich', 'diese', 'dieser', 'dieses', 'jetzt', 'gegenseitig',
	// the app's own words
	'kontakt', 'kontakte', 'kontaktdaten', 'adresse', 'adressbuch', 'anfrage', 'einladung',
	'einladungslink', 'gerät', 'geräte', 'tresor', 'sprache', 'einstellungen', 'vorname',
	'nachname', 'kategorie', 'fehler', 'hinweis', 'seite',
	// what buttons say
	'speichern', 'teilen', 'senden', 'anfordern', 'austauschen', 'anlegen', 'entfernen',
	'abbrechen', 'weiter', 'eingeben', 'einrichten', 'ersetzen', 'herunterladen', 'aktualisieren',
	'verbinden', 'verbunden'
];
const WORDS = new RegExp(
	`(?:^|[^\\p{L}])(?:${WORD_LIST.map((word) => `[${word[0]}${word[0].toUpperCase()}]${word.slice(1)}`).join('|')})(?=$|[^\\p{L}])`,
	'u'
);

/** One lowercase word, like a kind or a key: data, not text. */
const IDENTIFIER = /^[\p{Ll}][\p{L}\d_-]*$/u;

/**
 * Whether a text looks German.
 *
 * @param {string} text
 */
export const looksGerman = (text) =>
	!IDENTIFIER.test(text.trim()) && (MARKS.test(text) || WORDS.test(text));

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
	meta: {
		type: 'problem',
		docs: { description: 'German text belongs in src/lib/i18n/de.js (#89)' },
		messages: {
			german:
				'German text outside the catalogue: “{{text}}”. Use t() with a key in en.js and de.js.'
		},
		schema: []
	},
	create(context) {
		/** @param {any} node @param {unknown} value */
		const check = (node, value) => {
			const text = String(value ?? '');
			if (!text.trim() || !looksGerman(text)) return;
			context.report({ node, messageId: 'german', data: { text: text.trim().slice(0, 60) } });
		};
		return {
			/** @param {any} node */
			Literal(node) {
				if (typeof node.value !== 'string') return;
				const p = node.parent;
				if (p?.type === 'ImportDeclaration' || p?.type === 'ExportNamedDeclaration') return;
				if (p?.type === 'Property' && p.key === node) return;
				check(node, node.value);
			},
			/** @param {any} node */
			TemplateElement(node) {
				check(node, node.value.cooked);
			},
			/** @param {any} node */
			SvelteText(node) {
				check(node, node.value);
			},
			/** @param {any} node */
			SvelteLiteral(node) {
				check(node, node.value);
			}
		};
	}
};

export default { rules: { 'no-german': rule } };
