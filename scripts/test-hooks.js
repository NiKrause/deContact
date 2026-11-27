// What only a build for the end-to-end tests may contain (#81), and where a built site
// contains it. Pure, so vitest checks it (test-hooks.spec.js); check-production-build.mjs
// reads the files. Follows Le-Space/belege's scripts/check-production-build.mjs.

/** what a production build must not contain, and why it would be there */
export const FORBIDDEN = [
	{
		// window.__decontactE2E (src/lib/network/e2e-hook.js): a property name, which a
		// minifier keeps as it is
		name: 'the test hook (__decontactE2E)',
		pattern: /__decontactE2E/g
	},
	{
		// the flag itself: where it is left in the bundle, a branch for the tests was kept
		// instead of dropped
		name: 'the test build flag (VITE_E2E)',
		pattern: /VITE_E2E/g
	},
	{
		// the hook's module, as a chunk of its own or by the name of its function
		name: 'the test hook module (e2e-hook)',
		pattern: /e2e-hook|installE2EHook/g
	}
];

/** files of a built site worth reading */
export const TEXT = /\.(m?js|html?|css|json|webmanifest|svg|txt|xml|map)$/;

/**
 * @param {{ path: string, text: string }[]} files the built site's text files, path relative to it
 * @returns {{ file: string, name: string, match: string, count: number }[]}
 */
export function findTestHooks(files) {
	const findings = [];
	for (const { path, text } of files) {
		for (const { name, pattern } of FORBIDDEN) {
			const counts = new Map();
			for (const where of [path, text]) {
				for (const [match] of where.matchAll(pattern)) counts.set(match, (counts.get(match) ?? 0) + 1);
			}
			for (const [match, count] of counts) findings.push({ file: path, name, match, count });
		}
	}
	return findings;
}
