/**
 * Whether a resent contact request was answered already: a pure rule, without app state
 * (answered.spec.js); p2p-operations.js asks it before the request dialog.
 *
 * Bob's app resends his request until Alice's card has arrived in his book: a pubsub
 * message may be missed, and nothing else would deliver it again. When Alice answered but
 * her card is still on its way, a resend must not ask her a second time.
 *
 * - A resend names the request it repeats: `resentOf`, the timestamp of Bob's request,
 *   by Bob's clock (contact-messages.js).
 * - Alice remembers the timestamp of the last request of Bob's she answered in the dialog,
 *   by Bob's clock as well, so the two compare whatever the clocks of their devices say.
 * - A resend of that request, or of an earlier one, asks nobody. A request Bob made anew
 *   (he scanned again, or he asks back) carries no `resentOf` and is always asked; so is a
 *   resend whose request never reached Alice.
 *
 * @param {{ resentOf?: unknown, answered?: number }} state
 *   resentOf: from the request; answered: the timestamp of the sender's request we answered
 */
export function answeredBefore({ resentOf, answered }) {
    return Number.isSafeInteger(resentOf) && Number.isSafeInteger(answered) && answered >= resentOf
}
