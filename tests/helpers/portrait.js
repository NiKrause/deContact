/**
 * A made-up portrait as a JPEG, drawn on a canvas of `page`: a gradient, a head and
 * shoulders. Nobody's photo: the tests and the screenshots of the README use it (#87, #110).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ sky?: [string, string], skin?: string, hair?: string, shirt?: string }} colours
 * @returns {Promise<Uint8Array>}
 */
export async function madeUpPortrait(page, colours = {}) {
	const { sky = ['#7fb2e5', '#f2d7b6'], skin = '#c68642', hair, shirt = '#3b5b92' } = colours;
	const bytes = await page.evaluate(
		async ({ sky, skin, hair, shirt }) => {
			const canvas = document.createElement('canvas');
			canvas.width = 1200;
			canvas.height = 1600;
			const context = canvas.getContext('2d');
			const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
			gradient.addColorStop(0, sky[0]);
			gradient.addColorStop(1, sky[1]);
			context.fillStyle = gradient;
			context.fillRect(0, 0, canvas.width, canvas.height);
			if (hair) {
				context.fillStyle = hair;
				context.beginPath();
				context.arc(600, 600, 250, Math.PI, 2 * Math.PI);
				context.fill();
			}
			context.fillStyle = skin;
			context.beginPath();
			context.arc(600, 640, 216, 0, 2 * Math.PI);
			context.fill();
			context.fillStyle = shirt;
			context.fillRect(300, 990, 600, 610);
			const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
			return Array.from(new Uint8Array(await blob.arrayBuffer()));
		},
		{ sky, skin, hair, shirt }
	);
	return Uint8Array.from(bytes);
}
