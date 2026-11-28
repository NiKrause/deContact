// Whether a built page holds itself to its Content-Security-Policy (src/lib/csp.js): the policy
// is there, first in <head>, as csp.js writes it, and it lets nothing through that it should
// not: no `unsafe-eval`, no inline script or style without its hash, no host but the allowed
// ones, Trusted Types required. Pure, so vitest checks it (csp-check.spec.js); it reads the
// production build in scripts/check-production-build.mjs and the end-to-end tests' build in
// tests/Csp.spec.js.
import { createHash } from 'node:crypto';
import { ALEPH_API, TRUSTED_TYPES_POLICIES, cspDirectives } from '../src/lib/csp.js';

/** the built pages that carry a policy: each language's page, and the fallback of any other path */
export const PAGES = ['index.html', 'de/index.html', '404.html'];

/** the keywords SvelteKit writes in quotes (its runtime/server/page/csp.js) */
const KEYWORDS = new Set([
	'self',
	'unsafe-eval',
	'unsafe-hashes',
	'unsafe-inline',
	'none',
	'strict-dynamic',
	'report-sample',
	'wasm-unsafe-eval',
	'script'
]);

/** what a hash or a nonce looks like in a policy */
const HASH = /^'(sha256|sha384|sha512|nonce)-[A-Za-z0-9+/_=-]+'$/;

/** a source as it stands in the page: keywords and hashes in quotes */
export const quoted = (/** @type {string} */ source) =>
	KEYWORDS.has(source) || /^(sha\d{3}|nonce)-/.test(source) ? `'${source}'` : source;

/** @param {string} text @returns {string} the hash of a text, as a policy names it */
export const sha256 = (text) =>
	`'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/**
 * @param {string} html
 * @returns {Record<string, string[]> | null} the policy of the page's meta tag, by directive
 */
export function policyOf(html) {
	const meta = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"\s*\/?>/i.exec(
		html
	);
	if (!meta) return null;
	return Object.fromEntries(
		meta[1]
			.split(';')
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => {
				const [directive, ...sources] = part.split(/\s+/);
				return [directive.toLowerCase(), sources];
			})
	);
}

/** @param {string} tag @param {string} name */
const attribute = (tag, name) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1];

/** @param {string} html @returns {{ tag: string, text: string }[]} the page's <script> elements */
const scriptsOf = (html) =>
	[...html.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script>/gi)].map(([, tag, text]) => ({
		tag,
		text
	}));

/** a script the browser runs: no data block such as `application/ld+json` */
const runs = (/** @type {string} */ tag) => {
	const type = attribute(tag, 'type')?.toLowerCase();
	return (
		type === undefined ||
		type === '' ||
		type === 'module' ||
		/^(text|application)\/(java|ecma)script$/.test(type)
	);
};

/**
 * What is wrong with a built page and its policy; nothing, if it holds.
 *
 * @param {string} html the page, as built
 * @param {{ localRelay?: boolean }} [options] localRelay: the end-to-end tests' build, which
 *   may dial its relay on this machine; a production build may not
 * @returns {string[]}
 */
export function policyProblems(html, { localRelay = false } = {}) {
	const problems = [];
	const policy = policyOf(html);
	if (!policy) return ['no Content-Security-Policy meta tag'];
	if ((html.match(/http-equiv="content-security-policy"/gi) ?? []).length > 1)
		problems.push('more than one policy');

	// the policy holds only what comes after it: nothing in <head> before it loads or runs
	const head =
		/<head>([\s\S]*?)<meta\s+http-equiv="content-security-policy"/i.exec(html)?.[1] ?? '';
	const before = head
		.replace(/<!--[\s\S]*?-->/g, '')
		.match(/<(?!meta\s+(charset|name="viewport"))[a-z][^>]*>/gi);
	if (before) problems.push(`before the policy in <head>: ${before.join(' ')}`);

	// as src/lib/csp.js writes it, and SvelteKit's start script by its hash
	const expected = cspDirectives({ localRelay });
	for (const [directive, sources] of Object.entries(expected)) {
		const actual = policy[directive];
		if (!actual) {
			problems.push(`${directive} is missing`);
			continue;
		}
		const extra = actual.filter((source) => !sources.map(quoted).includes(source));
		const missing = sources.map(quoted).filter((source) => !actual.includes(source));
		const allowedExtra =
			directive === 'script-src' ? extra.filter((source) => !HASH.test(source)) : extra;
		if (allowedExtra.length) problems.push(`${directive} also allows ${allowedExtra.join(' ')}`);
		if (missing.length) problems.push(`${directive} lacks ${missing.join(' ')}`);
	}
	for (const directive of Object.keys(policy)) {
		if (!(directive in expected)) problems.push(`${directive} is not in src/lib/csp.js`);
	}

	// the rules themselves, whatever csp.js says
	const all = Object.values(policy).flat();
	if (all.includes("'unsafe-eval'")) problems.push("'unsafe-eval' is allowed");
	for (const directive of ['default-src', 'script-src', 'style-src', 'style-src-attr']) {
		if (policy[directive]?.includes("'unsafe-inline'"))
			problems.push(`${directive} allows 'unsafe-inline'`);
	}
	if (policy['script-src']?.some((source) => /^\*|^https?:$|^data:|^blob:/.test(source))) {
		problems.push(`script-src allows another origin: ${policy['script-src'].join(' ')}`);
	}
	const hosts = new Set([
		ALEPH_API,
		...(localRelay ? ['ws://127.0.0.1:*', 'ws://localhost:*'] : [])
	]);
	for (const [directive, sources] of Object.entries(policy)) {
		for (const source of sources) {
			const host =
				/^[a-z][a-z0-9+.-]*:\/\/|^\*/i.test(source) ||
				/^[a-z0-9.-]+\.[a-z]{2,}(:|\/|$)/i.test(source);
			if (host && !hosts.has(source))
				problems.push(`${directive} names a host that is not allowed: ${source}`);
		}
	}
	if (!localRelay && /\bws:|127\.0\.0\.1|localhost/.test(all.join(' '))) {
		problems.push('a production build allows a relay on this machine');
	}
	const schemes = { 'img-src': ['data:'], 'connect-src': ['wss:'] };
	for (const [directive, sources] of Object.entries(policy)) {
		for (const source of sources.filter((it) => /^[a-z][a-z0-9+.-]*:$/i.test(it))) {
			if (!schemes[directive]?.includes(source))
				problems.push(`${directive} allows the scheme ${source}`);
		}
	}
	if (policy['require-trusted-types-for']?.join(' ') !== "'script'")
		problems.push('Trusted Types are not required');
	const policies = policy['trusted-types'] ?? [];
	if (policies.some((name) => !TRUSTED_TYPES_POLICIES.includes(name))) {
		problems.push(
			`trusted-types allows more than ${TRUSTED_TYPES_POLICIES.join(', ')}: ${policies.join(' ')}`
		);
	}

	// every inline script and style is named by its hash; no event handler in the markup
	const markup = html.replace(/<!--[\s\S]*?-->/g, '');
	for (const { tag, text } of scriptsOf(markup)) {
		const src = attribute(tag, 'src');
		if (src !== undefined) {
			if (/^(https?:)?\/\//i.test(src)) problems.push(`a script from another host: ${src}`);
			continue;
		}
		if (runs(tag) && !policy['script-src']?.includes(sha256(text))) {
			problems.push(
				`an inline script without its hash in script-src: ${text.trim().slice(0, 60)}…`
			);
		}
	}
	for (const [, text] of markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
		if (!(policy['style-src'] ?? policy['default-src'])?.includes(sha256(text))) {
			problems.push(`an inline <style> without its hash: ${text.trim().slice(0, 60)}…`);
		}
	}
	for (const [, value] of markup.matchAll(/<[a-z][^>]*\sstyle\s*=\s*"([^"]*)"/gi)) {
		if (!policy['style-src-attr']?.includes(sha256(value)))
			problems.push(`a style attribute without its hash: ${value}`);
	}
	for (const [, tag, handler] of markup.matchAll(/<([a-z][a-z0-9-]*)[^>]*\s(on[a-z]+)\s*=/gi)) {
		problems.push(`an event handler in the markup: ${handler} on <${tag}>`);
	}
	// what the page loads itself: the app's own files only
	for (const [tag] of markup.matchAll(/<link\b[^>]*>/gi)) {
		const rel = attribute(tag, 'rel') ?? '';
		const href = attribute(tag, 'href') ?? '';
		if (
			/stylesheet|preload|modulepreload|icon|manifest/i.test(rel) &&
			/^(https?:)?\/\//i.test(href)
		) {
			problems.push(`a ${rel} from another host: ${href}`);
		}
	}
	return problems;
}
