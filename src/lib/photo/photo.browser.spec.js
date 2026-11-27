// A contact's photo (#87), made by a real browser: the canvas scales and encodes it, so the
// size cap and the missing EXIF are checked on Chromium's real output. A unit test, run by
// Playwright without the app or a relay (playwright.unit.config.js): an empty page on a
// made-up origin, which gets photo.js and the test helpers from disk and nothing else.
// Generated images only.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { metadataOf } from '../../../tests/helpers/exif.js';
import { MAX_PHOTO_BYTES, MAX_THUMBNAIL_BYTES, PHOTO_SIDE, THUMBNAIL_SIDE } from './photo.js';

const ORIGIN = 'http://photo.test';
/** what the page may load: path -> file of this repository */
const MODULES = {
	'/photo.js': '../../../src/lib/photo/photo.js',
	'/exif.js': '../../../tests/helpers/exif.js',
	'/images.js': '../../../tests/helpers/images.js'
};

test.beforeEach(async ({ page }) => {
	await page.route(`${ORIGIN}/**`, async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>photo</title>' });
		if (!MODULES[path]) return route.fulfill({ status: 404, body: '' });
		route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(MODULES[path], import.meta.url), 'utf8') });
	});
	await page.goto(`${ORIGIN}/`);
});

const bytes = (list) => Uint8Array.from(list);

test('a large image of noise becomes a 256×256 WebP within the size cap', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const { photoFromFile, isPhoto } = await import('/photo.js');
		const { blobOf, blobOfDataUrl, bytesOf, look, noise } = await import('/images.js');
		const original = await blobOf(noise(1600, 1200), 'image/jpeg', 0.95);
		const photo = await photoFromFile(new File([original], 'noise.jpg', { type: 'image/jpeg' }));
		const blob = await blobOfDataUrl(photo);
		return { originalSize: original.size, prefix: photo.slice(0, 23), shown: isPhoto(photo), bytes: Array.from(await bytesOf(blob)), ...(await look(blob)) };
	});
	expect(result.originalSize).toBeGreaterThan(10 * MAX_PHOTO_BYTES);
	expect(result.prefix).toBe('data:image/webp;base64,');
	expect(result.shown).toBe(true);
	expect(result.bytes.length).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
	expect([result.width, result.height]).toEqual([PHOTO_SIDE, PHOTO_SIDE]);
});

test('the photo has no EXIF: the place and the GPS coordinates of the original are gone', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const { photoFromFile } = await import('/photo.js');
		const { withExif } = await import('/exif.js');
		const { blobOf, blobOfDataUrl, bytesOf, portrait } = await import('/images.js');
		const original = withExif(await bytesOf(await blobOf(portrait(1200, 1600), 'image/jpeg', 0.9)));
		const photo = await photoFromFile(new File([original], 'portrait.jpg', { type: 'image/jpeg' }));
		return { original: Array.from(original), photo: Array.from(await bytesOf(await blobOfDataUrl(photo))) };
	});
	// the browser read the tagged file, and the tags were in it
	expect(metadataOf(bytes(result.original))).toEqual({ type: 'jpeg', metadata: ['place', 'EXIF'] });
	expect(metadataOf(bytes(result.photo))).toEqual({ type: 'webp', metadata: [] });
	expect(result.photo.length).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
});

test('where the browser gives no WebP, a JPEG within the cap and without EXIF', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const { photoFromFile, isPhoto } = await import('/photo.js');
		const { withExif } = await import('/exif.js');
		const { blobOf, blobOfDataUrl, bytesOf, noise } = await import('/images.js');
		const original = withExif(await bytesOf(await blobOf(noise(1000, 1000), 'image/jpeg', 0.95)));
		const photo = await photoFromFile(new File([original], 'noise.jpg', { type: 'image/jpeg' }), { types: ['image/jpeg'] });
		return { prefix: photo.slice(0, 23), shown: isPhoto(photo), photo: Array.from(await bytesOf(await blobOfDataUrl(photo))) };
	});
	expect(result.prefix).toBe('data:image/jpeg;base64,');
	expect(result.shown).toBe(true);
	expect(metadataOf(bytes(result.photo))).toEqual({ type: 'jpeg', metadata: [] });
	expect(result.photo.length).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
});

test('a portrait is cropped to its centre square', async ({ page }) => {
	const { width, height, colours } = await page.evaluate(async () => {
		const { photoFromFile } = await import('/photo.js');
		const { bands, blobOf, blobOfDataUrl, look } = await import('/images.js');
		const photo = await photoFromFile(new File([await blobOf(bands(300), 'image/png')], 'tall.png', { type: 'image/png' }));
		return look(await blobOfDataUrl(photo), [[8, 8], [128, 128], [247, 247]]);
	});
	expect([width, height]).toEqual([PHOTO_SIDE, PHOTO_SIDE]);
	// only the blue middle, nothing of the red above or the green below
	for (const [red, green, blue] of colours) {
		expect(blue).toBeGreaterThan(200);
		expect(red + green).toBeLessThan(80);
	}
});

test('a transparent image is put on white', async ({ page }) => {
	const { colours } = await page.evaluate(async () => {
		const { photoFromFile } = await import('/photo.js');
		const { blobOf, blobOfDataUrl, canvasOf, look } = await import('/images.js');
		const photo = await photoFromFile(new File([await blobOf(canvasOf(64, 64), 'image/png')], 'empty.png', { type: 'image/png' }));
		return look(await blobOfDataUrl(photo), [[128, 128]]);
	});
	expect(Math.min(...colours[0])).toBeGreaterThan(240);
});

test('a file that is not an image is refused', async ({ page }) => {
	const refused = await page.evaluate(async () => {
		const { photoFromFile } = await import('/photo.js');
		try {
			await photoFromFile(new File([new TextEncoder().encode('not an image at all')], 'fake.jpg', { type: 'image/jpeg' }));
			return false;
		} catch {
			return true;
		}
	});
	expect(refused).toBe(true);
});

test("a request's thumbnail of a card's photo: 64×64, within its cap, accepted by isThumbnail (#110)", async ({ page }) => {
	const result = await page.evaluate(async () => {
		const { photoFromFile, thumbnailOf, isThumbnail } = await import('/photo.js');
		const { blobOf, blobOfDataUrl, bytesOf, look, noise } = await import('/images.js');
		// the worst case for its size: a card's photo of noise
		const photo = await photoFromFile(new File([await blobOf(noise(1600, 1200), 'image/jpeg', 0.95)], 'noise.jpg', { type: 'image/jpeg' }));
		const thumbnail = await thumbnailOf(photo);
		const blob = await blobOfDataUrl(thumbnail);
		return {
			prefix: thumbnail.slice(0, 23),
			accepted: isThumbnail(thumbnail),
			length: thumbnail.length,
			bytes: (await bytesOf(blob)).length,
			none: await thumbnailOf(undefined),
			notAPhoto: await thumbnailOf('https://example.com/photo.webp'),
			...(await look(blob))
		};
	});
	expect(result.prefix).toBe('data:image/webp;base64,');
	expect(result.accepted).toBe(true);
	expect(result.bytes).toBeLessThanOrEqual(MAX_THUMBNAIL_BYTES);
	expect(result.length).toBeLessThan(8 * 1024);
	expect([result.width, result.height]).toEqual([THUMBNAIL_SIDE, THUMBNAIL_SIDE]);
	expect(result.none).toBeUndefined();
	expect(result.notAPhoto).toBeUndefined();
});
