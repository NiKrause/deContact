import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { install, installPrompt, isIos, keepInstallPrompt } from './install.js';

describe('installing deContact (#146)', () => {
	it("keeps Chrome's prompt instead of its banner, and uses it once", async () => {
		let prevented = false;
		let prompted = 0;
		const event = {
			preventDefault: () => (prevented = true),
			prompt: async () => prompted++,
			userChoice: Promise.resolve({ outcome: 'accepted' })
		};
		keepInstallPrompt(event);
		expect(prevented).toBe(true);
		expect(get(installPrompt)).toBe(event);
		expect(await install(get(installPrompt))).toBe(true);
		expect(prompted).toBe(1);
		expect(get(installPrompt)).toBeUndefined();
		expect(await install(get(installPrompt))).toBe(false);
	});

	it('knows an iPhone and an iPad, also one that says it is a Mac', () => {
		expect(isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
		expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
		expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
		expect(isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-A576B)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false);
	});
});
