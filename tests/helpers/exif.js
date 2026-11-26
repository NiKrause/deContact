// Generated test images with EXIF metadata, and a look for metadata in an image file (#87).
// Pure functions on bytes: the Vitest browser tests and the Playwright tests share them.
// No real photos and no real places: the place below is made up.

/** the made-up place the EXIF block names, besides its GPS coordinates */
export const MADE_UP_PLACE = 'Made-up place 4711, Musterstadt';

const ascii = (text) => Uint8Array.from(text, (c) => c.charCodeAt(0));

/**
 * A JPEG with an EXIF block (APP1) right after its start: an image description naming
 * MADE_UP_PLACE and a GPS block with a latitude and a longitude, as a phone camera writes.
 *
 * @param {Uint8Array} jpeg a JPEG without EXIF, e.g. from a canvas
 * @returns {Uint8Array}
 */
export function withExif(jpeg, { description = MADE_UP_PLACE, latitude = [52, 31, 12], longitude = [13, 24, 36] } = {}) {
	if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
	// TIFF, big-endian: header, IFD0 (description, GPS pointer), GPS IFD, then their values
	const text = ascii(`${description}\0`);
	const ifd0 = 8;
	const gps = ifd0 + 2 + 2 * 12 + 4;
	const values = gps + 2 + 4 * 12 + 4;
	const textAt = values;
	const latitudeAt = textAt + text.length + (text.length % 2);
	const longitudeAt = latitudeAt + 24;
	const tiff = new Uint8Array(longitudeAt + 24);
	const view = new DataView(tiff.buffer);
	tiff.set(ascii('MM'), 0);
	view.setUint16(2, 42);
	view.setUint32(4, ifd0);
	const entry = (at, tag, type, count, value) => {
		view.setUint16(at, tag);
		view.setUint16(at + 2, type);
		view.setUint32(at + 4, count);
		if (typeof value === 'number') view.setUint32(at + 8, value);
		else tiff.set(value, at + 8);
	};
	const ASCII = 2, LONG = 4, RATIONAL = 5;
	view.setUint16(ifd0, 2);
	entry(ifd0 + 2, 0x010e, ASCII, text.length, textAt); // ImageDescription
	entry(ifd0 + 14, 0x8825, LONG, 1, gps); // GPSInfo
	view.setUint32(ifd0 + 26, 0);
	view.setUint16(gps, 4);
	entry(gps + 2, 0x0001, ASCII, 2, ascii('N\0')); // GPSLatitudeRef
	entry(gps + 14, 0x0002, RATIONAL, 3, latitudeAt); // GPSLatitude
	entry(gps + 26, 0x0003, ASCII, 2, ascii('E\0')); // GPSLongitudeRef
	entry(gps + 38, 0x0004, RATIONAL, 3, longitudeAt); // GPSLongitude
	view.setUint32(gps + 50, 0);
	tiff.set(text, textAt);
	latitude.forEach((part, i) => (view.setUint32(latitudeAt + 8 * i, part), view.setUint32(latitudeAt + 8 * i + 4, 1)));
	longitude.forEach((part, i) => (view.setUint32(longitudeAt + 8 * i, part), view.setUint32(longitudeAt + 8 * i + 4, 1)));

	const app1 = new Uint8Array(4 + 6 + tiff.length);
	app1.set([0xff, 0xe1, (app1.length - 2) >> 8, (app1.length - 2) & 0xff]);
	app1.set(ascii('Exif\0\0'), 4);
	app1.set(tiff, 10);
	const out = new Uint8Array(jpeg.length + app1.length);
	out.set(jpeg.subarray(0, 2));
	out.set(app1, 2);
	out.set(jpeg.subarray(2), 2 + app1.length);
	return out;
}

const indexOf = (bytes, needle) => {
	outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
		return i;
	}
	return -1;
};

/**
 * The metadata an image file carries, as names: 'EXIF', 'XMP', and 'place' where the
 * made-up place or the EXIF signature appears anywhere in its bytes. Knows JPEG and WebP.
 *
 * @param {Uint8Array} bytes
 * @returns {{ type: 'jpeg' | 'webp' | 'other', metadata: string[] }}
 */
export function metadataOf(bytes) {
	const metadata = new Set();
	if (indexOf(bytes, ascii(MADE_UP_PLACE)) !== -1 || indexOf(bytes, ascii('Exif\0\0')) !== -1) metadata.add('place');
	const text = (from, length) => String.fromCharCode(...bytes.subarray(from, from + length));
	if (bytes[0] === 0xff && bytes[1] === 0xd8) {
		// segments up to the start of the scan: APP1 holds EXIF or XMP
		for (let at = 2; at + 4 <= bytes.length && bytes[at] === 0xff; ) {
			const marker = bytes[at + 1];
			if (marker === 0xda) break;
			const length = (bytes[at + 2] << 8) | bytes[at + 3];
			if (marker === 0xe1) metadata.add(text(at + 4, 4) === 'Exif' ? 'EXIF' : 'XMP');
			at += 2 + length;
		}
		return { type: 'jpeg', metadata: [...metadata] };
	}
	if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
		// chunks: EXIF and 'XMP ', announced by the flags of VP8X
		for (let at = 12; at + 8 <= bytes.length; ) {
			const id = text(at, 4);
			const size = bytes[at + 4] | (bytes[at + 5] << 8) | (bytes[at + 6] << 16) | (bytes[at + 7] << 24);
			if (id === 'EXIF') metadata.add('EXIF');
			if (id === 'XMP ') metadata.add('XMP');
			if (id === 'VP8X') {
				if (bytes[at + 8] & 0x08) metadata.add('EXIF');
				if (bytes[at + 8] & 0x04) metadata.add('XMP');
			}
			at += 8 + size + (size % 2);
		}
		return { type: 'webp', metadata: [...metadata] };
	}
	return { type: 'other', metadata: [...metadata] };
}

/** the bytes of a data URL */
export function bytesOfDataUrl(url) {
	const base64 = url.slice(url.indexOf(',') + 1);
	const binary = atob(base64);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
