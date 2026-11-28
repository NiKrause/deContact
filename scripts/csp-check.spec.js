import { describe, expect, it } from 'vitest';
import { cspDirectives } from '../src/lib/csp.js';
import { policyOf, policyProblems, quoted, sha256 } from './csp-check.js';

const START = 'import("./_app/immutable/entry/start.js");';

/** a policy as SvelteKit writes it, from src/lib/csp.js, with `change` applied */
function policy({ localRelay = false, change = (/** @type {any} */ d) => d } = {}) {
	const directives = change(structuredClone(cspDirectives({ localRelay })));
	directives['script-src'] = [...directives['script-src'], sha256(START).slice(1, -1)];
	return Object.entries(directives)
		.map(([directive, sources]) => [directive, ...sources.map(quoted)].join(' '))
		.join('; ');
}

/** a built page: the policy first in <head>, a data block, SvelteKit's start script */
const page = ({ csp = policy(), head = '', body = '', start = START } = {}) => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<!-- first: the policy -->
		${csp === null ? '' : `<meta http-equiv="content-security-policy" content="${csp}">`}
		<link href="./_app/immutable/entry/start.js" rel="modulepreload">
		<link href="./_app/immutable/assets/0.css" rel="stylesheet">
		<script src="./theme.js"></script>
		<script type="application/ld+json">{"@type":"WebApplication"}</script>
		${head}
	</head>
	<body>
		<div class="app"><script>${start}</script>${body}</div>
	</body>
</html>`;

describe('policyOf', () => {
	it('reads the meta tag, by directive', () => {
		expect(policyOf(page())?.['script-src']).toEqual(["'self'", sha256(START)]);
		expect(policyOf(page({ csp: null }))).toBeNull();
	});
});

describe('policyProblems', () => {
	it('finds nothing in a page as SvelteKit builds it', () => {
		expect(policyProblems(page())).toEqual([]);
		expect(
			policyProblems(page({ csp: policy({ localRelay: true }) }), { localRelay: true })
		).toEqual([]);
	});

	it('finds a page without a policy, or with the policy after what it should hold', () => {
		expect(policyProblems(page({ csp: null }))).toEqual(['no Content-Security-Policy meta tag']);
		const late = page().replace(
			/(\t\t<meta http-equiv[^\n]*\n)([\s\S]*?<script src="\.\/theme\.js"><\/script>\n)/,
			'$2$1'
		);
		expect(policyProblems(late)).toEqual([
			expect.stringMatching(/^before the policy in <head>: <link .*<script src="\.\/theme\.js">$/)
		]);
	});

	it("finds the end-to-end tests' relay in a production build", () => {
		expect(policyProblems(page({ csp: policy({ localRelay: true }) }))).toEqual([
			'connect-src also allows ws://127.0.0.1:* ws://localhost:*',
			'connect-src names a host that is not allowed: ws://127.0.0.1:*',
			'connect-src names a host that is not allowed: ws://localhost:*',
			'a production build allows a relay on this machine'
		]);
	});

	it('finds eval, inline code and other hosts allowed', () => {
		const loose = policy({
			change: (d) => ({
				...d,
				'script-src': [
					...d['script-src'],
					'unsafe-eval',
					'unsafe-inline',
					'https://cdn.example.com'
				],
				'font-src': [...d['font-src'], 'https://1.www.s81c.com'],
				'img-src': [...d['img-src'], 'https:']
			})
		});
		expect(policyProblems(page({ csp: loose }))).toEqual([
			"script-src also allows 'unsafe-eval' 'unsafe-inline' https://cdn.example.com",
			'img-src also allows https:',
			'font-src also allows https://1.www.s81c.com',
			"'unsafe-eval' is allowed",
			"script-src allows 'unsafe-inline'",
			'script-src names a host that is not allowed: https://cdn.example.com',
			'font-src names a host that is not allowed: https://1.www.s81c.com',
			'img-src allows the scheme https:'
		]);
	});

	it('finds Trusted Types not required, or another policy allowed', () => {
		const without = policy({
			change: (d) => {
				delete d['require-trusted-types-for'];
				return { ...d, 'trusted-types': [...d['trusted-types'], 'default'] };
			}
		});
		expect(policyProblems(page({ csp: without }))).toEqual([
			'require-trusted-types-for is missing',
			'trusted-types also allows default',
			'Trusted Types are not required',
			'trusted-types allows more than svelte-trusted-html, sveltekit-trusted-url: svelte-trusted-html sveltekit-trusted-url default'
		]);
	});

	it('finds an inline script or style without its hash, an event handler, a file from another host', () => {
		const html = page({
			head: '<script>window.injected = 1</script><style>body{color:red}</style><link rel="stylesheet" href="https://1.www.s81c.com/plex.css">',
			body: '<div style="color: red" onclick="steal()"></div><script src="https://cdn.example.com/x.js"></script>'
		});
		expect(policyProblems(html)).toEqual([
			'an inline script without its hash in script-src: window.injected = 1…',
			'a script from another host: https://cdn.example.com/x.js',
			'an inline <style> without its hash: body{color:red}…',
			'a style attribute without its hash: color: red',
			'an event handler in the markup: onclick on <div>',
			'a stylesheet from another host: https://1.www.s81c.com/plex.css'
		]);
	});

	it('finds a start script that is not the one named by the hash', () => {
		expect(policyProblems(page({ start: `${START} fetch("https://example.com")` }))).toEqual([
			expect.stringMatching(/^an inline script without its hash in script-src: import/)
		]);
	});
});
