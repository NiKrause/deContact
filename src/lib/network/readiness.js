/**
 * Whether this device is ready to exchange (#110): the steps "Show my code" shows while the
 * app and the network get ready, and the status line of Exchange. A pure rule
 * (readiness.spec.js); the stores come from p2p-operations.js and the QR dialog.
 *
 * Each step is 'done', 'waiting' or 'problem':
 * - book: the address book is open (unlocked with the passkey, or the temporary identity);
 * - network: this device's libp2p runs, so its peer id is known (it goes into the code);
 * - relay: a relay is connected (a bootstrap or Aleph relay, RELAY_TAGS);
 * - reachable: the relay holds a reservation for this device: a /p2p-circuit address, through
 *   which the other phone reaches this one even when WebRTC is blocked;
 * - link: the invitation link is signed (its one-time token, #86); a contact address needs none;
 * - card: our card has a name, or at least an email, else the other person gets an empty card.
 *
 * The code itself needs book, network, link and card. Relay and reachable may come later: the
 * other phone keeps resending until it is answered, so holding the code back on bad
 * conference Wi-Fi would stop the exchange entirely. After LATE_AFTER_MS they turn from
 * waiting into a problem, and the dialog says so.
 */

export const STEPS = ['book', 'network', 'relay', 'reachable', 'link', 'card']
/** the steps the code itself needs */
export const NEEDED_FOR_CODE = ['book', 'network', 'link', 'card']
/** how long relay and reachable may take before they count as a problem */
export const LATE_AFTER_MS = 10_000

/** whether a card names its owner: a first or last name, or an email */
export function hasName(card) {
	return ['firstName', 'lastName', 'email'].some((field) => typeof card?.[field] === 'string' && card[field].trim() !== '')
}

/**
 * @param {{ bookOpen: boolean, network: { started?: boolean, relays?: number, reachable?: boolean },
 *   linkSigned?: boolean, ownCard?: object, late?: boolean }} state
 *   linkSigned: undefined where no link is needed (a contact address); late: LATE_AFTER_MS passed
 * @returns {{ steps: Record<string, 'done' | 'waiting' | 'problem'>, codeReady: boolean, allDone: boolean, notReachable: boolean }}
 */
export function readinessOf({ bookOpen, network = {}, linkSigned, ownCard, late = false }) {
	const waitingOr = (ok, lateProblem = false) => (ok ? 'done' : lateProblem && late ? 'problem' : 'waiting');
	const steps = {
		book: waitingOr(bookOpen),
		network: waitingOr(Boolean(network.started)),
		relay: waitingOr((network.relays ?? 0) > 0, true),
		reachable: waitingOr(Boolean(network.reachable), true),
		link: linkSigned === undefined ? 'done' : waitingOr(linkSigned),
		card: hasName(ownCard) ? 'done' : 'problem'
	};
	const codeReady = NEEDED_FOR_CODE.every((step) => steps[step] === 'done');
	const allDone = STEPS.every((step) => steps[step] === 'done');
	return { steps, codeReady, allDone, notReachable: codeReady && !allDone && late };
}
