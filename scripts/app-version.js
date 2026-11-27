// The version a build shows (src/lib/components/AppInfo.svelte): one more with every
// deploy. Pure, so vitest checks it (app-version.spec.js); vite.config.js asks git.
//
// Major and minor come from package.json. The patch counts the commits since the tag of
// package.json's version (v0.5.0): every pull request is merged into main as one commit,
// and every push to main is deployed, so it goes up by one per deploy. A new minor
// version in package.json, tagged on its commit, starts the count again.

/**
 * @param {string} packageVersion e.g. "0.5.0"
 * @param {number | undefined} commitsSinceTag undefined: no tag or no history at hand
 *   (a shallow checkout), and the version is package.json's as it is
 */
export function deployVersion(packageVersion, commitsSinceTag) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageVersion ?? '');
	if (!match || !Number.isSafeInteger(commitsSinceTag) || commitsSinceTag < 0) return packageVersion;
	const [, major, minor, patch] = match;
	return `${major}.${minor}.${Number(patch) + commitsSinceTag}`;
}
