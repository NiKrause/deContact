import { test, expect } from '@playwright/test';
import { newPerson } from './helpers/passkeys.js';
import { DEVICES, size } from './helpers/devices.js';
import { checkEveryWidth } from './helpers/axe.js';
import { shortId } from '../src/lib/network/peer-list.js';

// The header's network state opens a toggletip that names the connected peers and how each
// is reached (lib/network/peer-list.js, PeersStatus.svelte). Two browsers and the suite's
// local relay: with WebRTC allowed the other browser shows as direct WebRTC, with WebRTC off
// (useWebRTC=false) as relayed. Then the keyboard, the mouse, the copy button, axe on the
// open toggletip at every width, and the same list in Settings → Network.

const people = {
	alice: { first: 'Alice', last: 'Wolkenfabrik', city: 'Musterstadt' },
	bob: { first: 'Bob', last: 'Stromwerk', city: 'Beispielort' }
};

for (const webRTC of [true, false]) {
	test(`the header lists the relay and the other browser, ${webRTC ? 'directly over WebRTC' : 'relayed with WebRTC off'}`, async ({ browser }) => {
		test.setTimeout(300000);
		const alice = await newPerson(browser, people.alice, { webRTC });
		const bob = await newPerson(browser, people.bob, { webRTC });
		try {
			const { page } = alice;
			const bobsId = await bob.page.evaluate(() => window.helia.libp2p.peerId.toString());
			const button = page.getByTestId('peers-button');
			// the hidden text names the state for a screen reader, as before
			await expect(button).toHaveAccessibleName(/Swarm connected \(\d+ peers\)/, { timeout: 90000 });
			await expect(button).toHaveAttribute('aria-expanded', 'false');

			await button.click();
			await expect(button).toHaveAttribute('aria-expanded', 'true');
			const tip = page.getByTestId('peers-toggletip');
			await expect(tip).toBeVisible();
			await expect(button).toHaveAttribute('aria-controls', 'peers-toggletip');

			// the relay, over the suite's WebSocket; its address is an IP, which stays off screen
			const relay = tip.locator('[data-testid="peer"][data-kind="relay"]');
			await expect(relay).toHaveCount(1, { timeout: 60000 });
			await expect(relay).toContainText('Relay');
			await expect(relay).toContainText('WebSocket, direct');

			const other = tip.getByTestId('peer').filter({ hasText: shortId(bobsId) });
			await expect(other).toHaveAttribute('data-kind', 'browser', { timeout: 90000 });
			await expect(other).toContainText('Browser');
			const summary = tip.getByTestId('peer-summary');
			if (webRTC) {
				// first reached through the relay, then upgraded: direct WebRTC
				await expect(other).toHaveAttribute('data-transport', 'webrtc', { timeout: 120000 });
				await expect(other).toHaveAttribute('data-relayed', 'false');
				await expect(other.locator('.how')).toHaveText('WebRTC, direct');
				await expect(summary).toHaveText('2 peers: 1 relay, 1 browser (direct, WebRTC)', { timeout: 30000 });
			} else {
				await expect(other).toHaveAttribute('data-relayed', 'true');
				await expect(other.locator('.how')).toContainText(/^relayed through 12D3Koo…\w{4} \(/);
				await expect(summary).toHaveText('2 peers: 1 relay, 1 browser (relayed)', { timeout: 30000 });
				// nothing in the list says WebRTC
				await expect(tip).not.toContainText('WebRTC');
			}
			// another browser's address never shows, nor the relay's IP
			await expect(tip).not.toContainText('127.0.0.1');
			await expect(tip).not.toContainText('/ip4/');

			// the whole id on demand: the copy button
			await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
			await other.getByRole('button', { name: `Copy the full peer id of ${shortId(bobsId)}` }).click();
			await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(bobsId);
			await expect(tip).toBeVisible();

			if (webRTC) {
				await checkEveryWidth(page, 'the open network toggletip');
				// nothing opens it again: open at the end, it was open for each width
				await expect(tip).toBeVisible();
			}

			// Escape closes it (the copy button's own tooltip first, WCAG 1.4.13) and gives the
			// focus back to the button
			await escapeUntilClosed(page);
			await expect(button).toHaveAttribute('aria-expanded', 'false');
			await expect(button).toBeFocused();
			// Enter opens it again, Tab moves into it, to the copy buttons
			await page.keyboard.press('Enter');
			await expect(tip).toBeVisible();
			await page.keyboard.press('Tab');
			await expect(tip.getByRole('button').first()).toBeFocused();
			await escapeUntilClosed(page);
			await expect(button).toBeFocused();
			// Space toggles it as well
			await page.keyboard.press('Space');
			await expect(tip).toBeVisible();
			await page.keyboard.press('Space');
			await expect(tip).toBeHidden();

			// the mouse: resting on it opens it, leaving closes it; a click keeps it open
			await button.hover();
			await expect(tip).toBeVisible();
			await page.mouse.move(10, 400);
			await expect(tip).toBeHidden();
			await button.hover();
			await expect(tip).toBeVisible();
			await button.click();
			await page.mouse.move(10, 400);
			await page.waitForTimeout(600);
			await expect(tip).toBeVisible();
			// a click elsewhere closes it
			await page.mouse.click(10, 400);
			await expect(tip).toBeHidden();

			// on the Fold closed it opens by a tap and fits the screen
			await page.setViewportSize(size(DEVICES[0]));
			await button.click();
			await expect(tip).toBeVisible();
			const box = await tip.boundingBox();
			expect(box.x, 'the toggletip starts on the screen').toBeGreaterThanOrEqual(0);
			expect(box.x + box.width, 'the toggletip ends on the screen').toBeLessThanOrEqual(DEVICES[0].width);
			await button.click();
			await expect(tip).toBeHidden();
			await page.setViewportSize(size(DEVICES.at(-1)));

			// Settings → Network lists the same peers
			await page.getByRole('link', { name: 'Settings' }).click();
			const network = page.getByTestId('network-peers');
			await expect(network.locator('[data-kind="relay"]')).toHaveCount(1);
			await expect(network.getByTestId('peer').filter({ hasText: shortId(bobsId) })).toHaveAttribute(
				'data-relayed',
				String(!webRTC)
			);
			await expect(network.getByTestId('peer-summary')).toHaveText(await summary.textContent());
		} finally {
			// how Alice reached Bob, and how her browser tried: for a failed run
			const label = webRTC ? 'webrtc' : 'relay-only';
			const bobsPeer = await bob.page.evaluate(() => window.helia?.libp2p?.peerId?.toString()).catch(() => undefined);
			const connections = await alice.page
				.evaluate((id) => window.helia.libp2p.getConnections().filter((c) => c.remotePeer.toString() === id).map((c) => `${c.limits ? 'limited ' : ''}${c.remoteAddr}`), bobsPeer)
				.catch(() => []);
			console.log(`[${label}] Alice -> Bob connections: ${JSON.stringify(connections)}`);
			for (const [name, person] of [['Alice', alice], ['Bob', bob]]) {
				const dials = person.lines.filter((line) => /discovered peer|reserved a slot|refused a reservation/.test(line)).map((line) => line.slice(0, 240));
				console.log(`[${label}] ${name}'s dials: ${JSON.stringify([...new Set(dials)].slice(0, 8), null, 1)}`);
			}
			const bobsAddresses = await bob.page.evaluate(() => window.helia.libp2p.getMultiaddrs().map(String)).catch(() => []);
			console.log(`[${label}] Bob listens on: ${JSON.stringify(bobsAddresses)}`);
			await Promise.all([alice.close(), bob.close()]);
		}
	});
}

/** Escape, as often as the open tooltips inside it take (at most three times) */
async function escapeUntilClosed(page) {
	const tip = page.getByTestId('peers-toggletip');
	for (let i = 0; i < 3 && (await tip.isVisible()); i++) {
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	}
	await expect(tip).toBeHidden();
}
