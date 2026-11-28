#!/usr/bin/env node
// A production build carries no test hook (#81), and every page holds itself to its
// Content-Security-Policy, without the end-to-end tests' relay (src/lib/csp.js).
//
//   node scripts/check-production-build.mjs build
//
// Reads every text file of the built site and fails when one names what only a build for
// the end-to-end tests may contain (test-hooks.js), when a page's policy is missing or lets
// through more than it should (csp-check.js), or when a file names IBM's CDN, which the
// fonts no longer come from (src/lib/fonts.css). Runs in CI after a production build, and on
// the very directory GitHub Pages publishes (.github/workflows/main.yml).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TEXT, findTestHooks } from './test-hooks.js';
import { PAGES, policyProblems } from './csp-check.js';

const dir = process.argv[2];
if (!dir) {
	console.error('usage: node scripts/check-production-build.mjs <build directory>');
	process.exit(2);
}

const filesIn = (folder) =>
	readdirSync(folder).flatMap((name) => {
		const path = join(folder, name);
		return statSync(path).isDirectory() ? filesIn(path) : [path];
	});

const files = filesIn(dir)
	.filter((file) => TEXT.test(file))
	.map((file) => ({ path: relative(dir, file), text: readFileSync(file, 'utf8') }));
const scripts = files.filter(({ path }) => /\.m?js$/.test(path)).length;
// an empty or wrong directory must not pass for a clean build
if (scripts === 0) {
	console.error(`${dir}: no script found - is this the built site?`);
	process.exit(2);
}

const findings = findTestHooks(files);
for (const { file, name, match, count } of findings) {
	console.error(`${file}: ${name}: ${match}${count > 1 ? ` (${count} times)` : ''}`);
}
if (findings.length > 0) {
	console.error(`\n${dir}: this build contains the end-to-end tests' hook. A production build must not.`);
	process.exit(1);
}

let refused = 0;
for (const page of PAGES) {
	const file = files.find(({ path }) => path.split('\\').join('/') === page);
	const problems = file ? policyProblems(file.text) : ['missing'];
	for (const problem of problems) console.error(`${page}: ${problem}`);
	refused += problems.length;
}
// the fonts are the app's own (src/lib/fonts.css): no page asks IBM's CDN for them
const ibm = files.filter(({ text }) => /s81c\.com/.test(text)).map(({ path }) => path);
for (const path of ibm) console.error(`${path}: names IBM's CDN (s81c.com)`);
if (refused > 0 || ibm.length > 0) {
	console.error(`\n${dir}: a page's Content-Security-Policy does not hold (src/lib/csp.js, scripts/csp-check.js).`);
	process.exit(1);
}
console.log(
	`${dir}: no test hook in ${files.length} files (${scripts} scripts); ${PAGES.join(', ')} hold their policy.`
);
