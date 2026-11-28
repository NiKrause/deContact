#!/usr/bin/env node
/**
 * The screens the README shows (#110): copies a few pictures of the screen tour
 * (tests/Screens.spec.js) at a phone's width into docs/screens/, and the install dialog's
 * screenshots (src/lib/web-manifest.js) into static/screenshots/. Run the tour first:
 *
 *   pnpm exec playwright test tests/Screens.spec.js
 *   node scripts/readme-screens.mjs
 *
 * The tour's people and portraits are made up (Alice Wolkenfabrik, Bob Stromwerk, Carol
 * Beispiel); nothing here is anybody's data.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { SCREENSHOTS, screenshotFile } from '../src/lib/web-manifest.js';

/** the phone width of the tour's reference devices (Galaxy A57) */
const WIDTH = 412;
const FROM = process.env.SCREENS_DIR || path.join('test-results', 'screens');
const TO = path.join('docs', 'screens');

/** the tour's screen → the README's file */
const SCREENS = {
	'05-qr-dialog': 'show-my-code',
	'15-scan': 'scan-a-code',
	'11-request-dialog': 'request',
	'09-invitee-card-arrived': 'invitation',
	'12-contacts': 'contacts',
	'04c-my-card-saved': 'my-card'
};

mkdirSync(TO, { recursive: true });
const missing = [];
for (const [screen, name] of Object.entries(SCREENS)) {
	const from = path.join(FROM, `${screen}-${WIDTH}.png`);
	if (!existsSync(from)) {
		missing.push(from);
		continue;
	}
	copyFileSync(from, path.join(TO, `${name}.png`));
	console.log(`${from} → ${path.join(TO, `${name}.png`)}`);
}
// the install dialog's screenshots: the tour writes them under the same names
mkdirSync(path.join('static', 'screenshots'), { recursive: true });
for (const shot of SCREENSHOTS) {
	const from = path.join(FROM, screenshotFile(shot));
	if (!existsSync(from)) {
		missing.push(from);
		continue;
	}
	copyFileSync(from, path.join('static', screenshotFile(shot)));
	console.log(`${from} → ${path.join('static', screenshotFile(shot))}`);
}
if (missing.length > 0) {
	console.error(`missing, run the tour first (tests/Screens.spec.js):\n  ${missing.join('\n  ')}`);
	process.exit(1);
}
