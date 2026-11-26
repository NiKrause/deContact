// Generated images for the photo tests (#87), drawn on a canvas in the browser. A module the
// browser loads (photo.browser.spec.js serves it); no real photos.

export const canvasOf = (width, height) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

export const blobOf = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
export const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());
export const blobOfDataUrl = async (url) => (await fetch(url)).blob();

/** noise, the worst case for an encoder: nothing in it compresses */
export function noise(width, height) {
	const canvas = canvasOf(width, height);
	const context = canvas.getContext('2d');
	const image = context.createImageData(width, height);
	let seed = 4711;
	for (let i = 0; i < image.data.length; i++) {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		image.data[i] = i % 4 === 3 ? 255 : seed & 0xff;
	}
	context.putImageData(image, 0, 0);
	return canvas;
}

/** a made-up portrait: a gradient, a head and shoulders, in the colours given */
export function portrait(width, height, { skin = '#c68642', shirt = '#3b5b92' } = {}) {
	const canvas = canvasOf(width, height);
	const context = canvas.getContext('2d');
	const sky = context.createLinearGradient(0, 0, 0, height);
	sky.addColorStop(0, '#7fb2e5');
	sky.addColorStop(1, '#f2d7b6');
	context.fillStyle = sky;
	context.fillRect(0, 0, width, height);
	context.fillStyle = skin;
	context.beginPath();
	context.arc(width / 2, height * 0.4, Math.min(width, height) * 0.18, 0, 2 * Math.PI);
	context.fill();
	context.fillStyle = shirt;
	context.fillRect(width * 0.25, height * 0.62, width * 0.5, height * 0.38);
	return canvas;
}

/** three bands from top to bottom: red, a blue square in the middle, green */
export function bands(width) {
	const canvas = canvasOf(width, 2 * width);
	const context = canvas.getContext('2d');
	context.fillStyle = '#f00';
	context.fillRect(0, 0, width, width / 2);
	context.fillStyle = '#00f';
	context.fillRect(0, width / 2, width, width);
	context.fillStyle = '#0f0';
	context.fillRect(0, (3 * width) / 2, width, width / 2);
	return canvas;
}

/** the size of an image and the colour of some of its pixels */
export async function look(blob, points = []) {
	const image = await createImageBitmap(blob);
	const canvas = canvasOf(image.width, image.height);
	const context = canvas.getContext('2d');
	context.drawImage(image, 0, 0);
	return {
		width: image.width,
		height: image.height,
		colours: points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data.subarray(0, 3)))
	};
}
