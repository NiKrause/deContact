import { describe, expect, it } from 'vitest';
import { appUrl, appUrlIn } from './app-url.js';

const at = (href) => ({ href });

describe('appUrl', () => {
	it('is the page the app runs at, under a base path', () => {
		expect(appUrl(at('https://example.github.io/deContact/'), '')).toBe(
			'https://example.github.io/deContact/'
		);
		expect(
			appUrl(
				at('https://example.github.io/deContact/#/onboarding/did:key:z6Mk?onBoardingToken=1.x'),
				''
			)
		).toBe('https://example.github.io/deContact/');
		expect(appUrl(at('https://example.github.io/deContact/index.html?x=1'), '')).toBe(
			'https://example.github.io/deContact/'
		);
	});

	it('is the page the app runs at, at the root', () => {
		expect(appUrl(at('http://localhost:4431/'), undefined)).toBe('http://localhost:4431/');
		expect(appUrl(at('http://localhost:4431/#/settings'), undefined)).toBe(
			'http://localhost:4431/'
		);
	});

	it('takes the address a build names, with or without a trailing slash', () => {
		expect(appUrl(at('http://localhost:5173/'), 'https://contacts.example.com')).toBe(
			'https://contacts.example.com/'
		);
		expect(appUrl(at('http://localhost:5173/'), 'https://contacts.example.com/app/')).toBe(
			'https://contacts.example.com/app/'
		);
	});

	it('gives a hash route of the app for an invitation link', () => {
		const link = `${appUrl(at('https://example.github.io/deContact/'), '')}#/onboarding/did:key:z6Mk`;
		expect(new URL(link).pathname).toBe('/deContact/');
		expect(new URL(link).hash).toBe('#/onboarding/did:key:z6Mk');
	});

	it('is the app\'s address on the page of a language too', () => {
		expect(appUrl(at('https://example.github.io/deContact/de/'), '')).toBe('https://example.github.io/deContact/');
		expect(appUrl(at('https://example.github.io/deContact/de/#/onboarding/did:key:z6Mk'), '')).toBe(
			'https://example.github.io/deContact/'
		);
		expect(appUrl(at('http://localhost:4431/de/'), undefined)).toBe('http://localhost:4431/');
		// a folder that only ends in "de" is no language page
		expect(appUrl(at('https://example.com/made/'), '')).toBe('https://example.com/made/');
	});

	it('gives the page of the language on screen for an invitation link', () => {
		expect(appUrlIn('de', at('https://example.github.io/deContact/'), '')).toBe('https://example.github.io/deContact/de/');
		expect(appUrlIn('en', at('https://example.github.io/deContact/de/'), '')).toBe('https://example.github.io/deContact/');
		expect(appUrlIn('de', at('http://localhost:5173/'), 'https://contacts.example.com')).toBe('https://contacts.example.com/de/');
		expect(appUrlIn('fr', at('https://example.github.io/deContact/'), '')).toBe('https://example.github.io/deContact/');
	});
});
