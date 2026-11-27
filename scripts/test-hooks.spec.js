import { describe, expect, it } from 'vitest';
import { findTestHooks } from './test-hooks.js';

describe('a production build without test hooks (#81)', () => {
	it('finds nothing in a clean build', () => {
		const files = [
			{ path: 'index.html', text: '<script type="module" src="./_app/immutable/entry/start.js"></script>' },
			{ path: '_app/immutable/chunks/p2p.js', text: 'window.mydb=e;if(void 0==="true"){}' }
		];
		expect(findTestHooks(files)).toEqual([]);
	});

	it('finds the global, the flag and the module, in a file or its name', () => {
		const findings = findTestHooks([
			{ path: '_app/immutable/chunks/a.js', text: 'window.__decontactE2E={put:t};window.__decontactE2E.all' },
			{ path: '_app/immutable/chunks/b.js', text: 'import.meta.env.VITE_E2E' },
			{ path: '_app/immutable/chunks/e2e-hook.Bx3k.js', text: 'export{n as installE2EHook}' }
		]);
		expect(findings).toEqual([
			{ file: '_app/immutable/chunks/a.js', name: 'the test hook (__decontactE2E)', match: '__decontactE2E', count: 2 },
			{ file: '_app/immutable/chunks/b.js', name: 'the test build flag (VITE_E2E)', match: 'VITE_E2E', count: 1 },
			{ file: '_app/immutable/chunks/e2e-hook.Bx3k.js', name: 'the test hook module (e2e-hook)', match: 'e2e-hook', count: 1 },
			{ file: '_app/immutable/chunks/e2e-hook.Bx3k.js', name: 'the test hook module (e2e-hook)', match: 'installE2EHook', count: 1 }
		]);
	});
});
