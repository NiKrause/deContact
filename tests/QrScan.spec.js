import { test, expect, chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import qrcode from 'qrcode-generator';
import { newPerson } from './helpers/passkeys.js';
import { invitationLink } from './helpers/onboarding.js';

// Scanning with the camera (QrScanner.svelte, <qr-scanner> of @le-space/libp2p-webrtc-qr).
// Bob's browser has a fake camera that films Alice's invitation QR code: Chromium plays a
// Y4M video drawn from the link (--use-file-for-fake-video-capture). He presses Scan with
// the field empty, the camera reads the code, and the link opens in his app: Alice's card
// arrives.

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', city: 'Beispielort' }
};

/**
 * A Y4M video (4:2:0, a few identical frames) of the QR code of `text`, black on white,
 * centred with its quiet zone: what the fake camera shows.
 */
function qrVideo(text, { width = 1280, height = 720, frames = 10 } = {}) {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	const modules = qr.getModuleCount();
	const quiet = 4;
	const scale = Math.floor((Math.min(width, height) * 0.9) / (modules + 2 * quiet));
	const size = (modules + 2 * quiet) * scale;
	const left = Math.floor((width - size) / 2);
	const top = Math.floor((height - size) / 2);
	const luma = Buffer.alloc(width * height, 235);
	for (let row = 0; row < modules; row++) {
		for (let col = 0; col < modules; col++) {
			if (!qr.isDark(row, col)) continue;
			const y0 = top + (row + quiet) * scale;
			const x0 = left + (col + quiet) * scale;
			for (let y = y0; y < y0 + scale; y++) luma.fill(16, y * width + x0, y * width + x0 + scale);
		}
	}
	const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
	const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma, chroma]);
	return Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`), ...Array(frames).fill(frame)]);
}

test("Bob scans Alice's invitation QR code with the camera", async ({ browser }, testInfo) => {
	test.setTimeout(300000);
	const alice = await newPerson(browser, people.alice);
	let camera, bob;
	try {
		const link = await invitationLink(alice.page);
		const video = testInfo.outputPath('alice-invitation.y4m');
		writeFileSync(video, qrVideo(link));
		camera = await chromium.launch({
			args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`]
		});
		bob = await newPerson(camera, people.bob);

		await test.step('Scan a code on Exchange opens the camera, which reads the code', async () => {
			await bob.page.getByRole('link', { name: 'Exchange' }).click();
			await bob.page.getByRole('button', { name: 'Scan a code' }).click();
			await expect.poll(() => bob.page.evaluate(() => location.hash), { timeout: 60000, message: 'the link opened in his app' })
				.toBe(`#${link.slice(link.indexOf('#') + 1)}`);
			await expect(bob.page.getByTestId('onboarding')).toBeVisible();
		});

		await test.step("Alice's card arrives", async () => {
			await expect(bob.page.getByTestId('inviter-card')).toHaveText(`${people.alice.first} ${people.alice.last} was added to your address book`, {
				timeout: 120000
			});
			expect(alice.saw(`accepted the invitation link of ${bob.did}`)).toBe(true);
		});
	} finally {
		// what each side did with the link: delivered, accepted, answered
		const relevant = (line) => /invitation link|deliver|accepted|sent an invitation|card|temporary/i.test(line);
		console.log(`Bob: ${JSON.stringify((bob?.lines ?? []).filter(relevant).slice(-25), null, 1)}`);
		console.log(`Alice: ${JSON.stringify(alice.lines.filter(relevant).slice(-25), null, 1)}`);
		await Promise.all([alice.close(), bob?.close()].filter(Boolean));
		await camera?.close();
	}
});
