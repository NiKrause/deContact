#!/usr/bin/env node
// A production build carries no test hook (#81).
//
//   node scripts/check-production-build.mjs build
//
// Reads every text file of the built site and fails when one names what only a build for
// the end-to-end tests may contain (test-hooks.js). Runs in CI after a production build,
// and on the very directory GitHub Pages publishes (.github/workflows/main.yml).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TEXT, findTestHooks } from './test-hooks.js';

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
console.log(`${dir}: no test hook in ${files.length} files (${scripts} scripts).`);
