import qrcode from 'qrcode-generator';

/**
 * A Y4M video (4:2:0, `fps` frames a second) of the QR code of `text`, black on white, with its
 * quiet zone: what a fake camera shows (Chromium's --use-file-for-fake-video-capture).
 *
 * `approach` frames come first, with the code half out of the picture on the left, as while
 * the phone is still being held up: nothing to read yet (the screen tour photographs the
 * scanner then). The code is centred in the `frames` after them. Chromium plays the file in
 * a loop.
 *
 * @param {string} text
 * @param {{ width?: number, height?: number, fps?: number, frames?: number, approach?: number }} options
 */
export function qrVideo(text, { width = 1280, height = 720, fps = 10, frames = 10, approach = 0 } = {}) {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	const modules = qr.getModuleCount();
	const quiet = 4;
	const scale = Math.floor((Math.min(width, height) * 0.9) / (modules + 2 * quiet));
	const size = (modules + 2 * quiet) * scale;
	const top = Math.floor((height - size) / 2);
	const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
	/** one frame with the code's left edge at x = left (it may lie outside the picture) */
	const frameAt = (left) => {
		const luma = Buffer.alloc(width * height, 235);
		for (let row = 0; row < modules; row++) {
			for (let col = 0; col < modules; col++) {
				if (!qr.isDark(row, col)) continue;
				const y0 = top + (row + quiet) * scale;
				const x0 = left + (col + quiet) * scale;
				const from = Math.max(0, x0);
				const to = Math.min(width, x0 + scale);
				if (to <= from) continue;
				for (let y = y0; y < y0 + scale; y++) luma.fill(16, y * width + from, y * width + to);
			}
		}
		return Buffer.concat([Buffer.from('FRAME\n'), luma, chroma, chroma]);
	};
	const centred = frameAt(Math.floor((width - size) / 2));
	const halfOut = frameAt(Math.floor(-size / 2));
	return Buffer.concat([
		Buffer.from(`YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg\n`),
		...Array(approach).fill(halfOut),
		...Array(frames).fill(centred)
	]);
}
