import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import * as svelteParser from 'svelte-eslint-parser';

import { looksGerman, rule } from '../../../eslint/no-german.js';

// German only from the German catalogue (#89): the rule eslint/no-german.js over every
// script and component in src/, the way `eslint` would run it, so CI fails on German text
// anywhere else. Tests are left out: they may well check German on screen.

// every script and component in src/, as text (node:fs is polyfilled away under Vite)
/** @type {Record<string, string>} */
const sources = import.meta.glob(['/src/**/*.{js,svelte}', '!**/*.spec.js'], {
	query: '?raw',
	import: 'default',
	eager: true
});

/** @param {string} code @param {string} filename */
function germanIn(code, filename) {
	const linter = new Linter();
	linter.defineRule('decontact/no-german', rule);
	linter.defineParser('svelte-eslint-parser', svelteParser);
	return linter.verify(
		code,
		{
			...(filename.endsWith('.svelte') ? { parser: 'svelte-eslint-parser' } : {}),
			parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
			rules: { 'decontact/no-german': 'error' }
		},
		{ filename }
	);
}

describe('no German outside de.js (#89)', () => {
	it('src/ has German only in the German catalogue', () => {
		const files = Object.keys(sources).filter((file) => file !== '/src/lib/i18n/de.js');
		expect(files.length).toBeGreaterThan(30);
		expect(files).toContain('/src/lib/i18n/en.js');
		const found = files.flatMap((file) =>
			germanIn(sources[file], file).map((problem) => `${file}:${problem.line} ${problem.message.slice(0, 100)}`)
		);
		expect(found).toEqual([]);
	});

	it('flags German in a script, in markup and in an attribute; not English', () => {
		expect(germanIn("notify('Kontakt gespeichert')", 'a.js')).toHaveLength(1);
		expect(germanIn('const x = `Waiting for ${name}`', 'a.js')).toHaveLength(0);
		expect(germanIn('const x = `Warte auf das Handy von ${name}`', 'a.js')).toHaveLength(1);
		expect(germanIn('<p>Deine Kontaktdaten</p>', 'A.svelte')).toHaveLength(1);
		expect(germanIn('<input placeholder="E-Mail eingeben …" aria-label="Straße" />', 'A.svelte')).toHaveLength(2);
		expect(germanIn('<button title="Speichern">x</button>', 'A.svelte')).toHaveLength(1);
		expect(germanIn("<script>const a = 'Save only'</script><p>Your contact details</p>", 'A.svelte')).toEqual([]);
		// on purpose, said where it stands
		expect(
			germanIn("// eslint-disable-next-line decontact/no-german -- a test\nconst a = 'Mit Passkey entsperren'", 'a.js')
		).toEqual([]);
	});

	it('sees German text, not English or a key', () => {
		for (const text of ['Nur speichern', 'Gegenseitig austauschen', '„{x}“', 'Bitte versuch es noch einmal', 'Einstellungen'])
			expect(looksGerman(text), text).toBe(true);
		for (const text of ['Save only', 'Two-way exchange', 'Deutsch', 'English', 'the build dir', 'MIT License', 'request canceled', 'deContact'])
			expect(looksGerman(text), text).toBe(false);
	});
});
