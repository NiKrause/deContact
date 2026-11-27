import { describe, expect, it } from 'vitest';
import { deployVersion } from './app-version.js';

describe('the version of a build (app-version.js)', () => {
	it('goes up by one with every commit on main since the tag of package.json', () => {
		expect(deployVersion('0.5.0', 0)).toBe('0.5.0');
		expect(deployVersion('0.5.0', 1)).toBe('0.5.1');
		expect(deployVersion('0.5.0', 24)).toBe('0.5.24');
		// a patch already counted in package.json is counted on from
		expect(deployVersion('1.2.3', 4)).toBe('1.2.7');
	});

	it("is package.json's as it is without a tag or history to count", () => {
		expect(deployVersion('0.5.0', undefined)).toBe('0.5.0');
		expect(deployVersion('0.5.0', Number.NaN)).toBe('0.5.0');
		expect(deployVersion('0.5.0-beta.1', 3)).toBe('0.5.0-beta.1');
	});
});
