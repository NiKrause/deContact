// Carbon's stylesheet without its @font-face rules (vite.config.js). carbon-components-svelte's
// CSS (css/all.css and the single themes) declares IBM Plex as fonts on IBM's CDN,
// 1.www.s81c.com: every visit would ask IBM for them, and the Content-Security-Policy
// (src/lib/csp.js, `font-src 'self'`) refuses them anyway. The app declares the faces it
// shows itself, from its own files (src/lib/fonts.css, static/fonts).

/**
 * Carbon's stylesheets, as Vite names them: a path, and perhaps a query, but not `?raw` or
 * `?url`, which ask for the file as it is (carbon-fonts.spec.js reads it so)
 */
const CARBON_CSS =
	/[\\/]carbon-components-svelte[\\/]css[\\/][^\\/?]+\.css(\?(?!(.*&)?(raw|url)\b).*)?$/;

/** @param {string} id a module's id, as Vite names it @returns {boolean} whether it is one of Carbon's stylesheets */
export const isCarbonStylesheet = (id) => CARBON_CSS.test(id);

/** an @font-face rule: no braces inside it, as in Carbon's minified CSS */
const FONT_FACE = /@font-face\s*\{[^{}]*\}/g;

/**
 * @param {string} css
 * @returns {string} the stylesheet without its @font-face rules
 */
export function withoutFontFaces(css) {
	return css.replace(FONT_FACE, '');
}

/** @returns {import('vite').Plugin} */
export function carbonWithoutFonts() {
	return {
		name: 'decontact:carbon-without-fonts',
		// before Vite's own CSS handling, which would otherwise bundle the rules as they are
		enforce: 'pre',
		transform(code, id) {
			if (!isCarbonStylesheet(id)) return null;
			return { code: withoutFontFaces(code), map: null };
		}
	};
}
