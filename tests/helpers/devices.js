/**
 * The reference devices of #110, in CSS pixels, portrait: every screen must work on them,
 * and the screen tour (Screens.spec.js) and the axe check (Accessibility.spec.js) run at
 * exactly these. Until they are measured on the devices themselves (innerWidth ×
 * innerHeight), the widths are the narrowest phone so far (#98), a common Android phone, the
 * open Fold's inner screen and a desktop; the heights are those of similar devices. The
 * measured values go here.
 */
export const DEVICES = [
	{ name: 'Galaxy Z Fold 2, closed', width: 344, height: 882 },
	{ name: 'Galaxy A57', width: 412, height: 915 },
	{ name: 'Galaxy Z Fold 2, open', width: 884, height: 1104 },
	{ name: 'Desktop', width: 1280, height: 800 }
];

/** light and dark (#110): the app follows the system's setting, which a test emulates */
export const LOOKS = /** @type {const} */ (['light', 'dark']);

/** @param {{ width: number, height: number }} device */
export const size = ({ width, height }) => ({ width, height });
