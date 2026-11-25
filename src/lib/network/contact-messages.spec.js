import { describe, expect, it } from 'vitest';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { base58btc } from 'multiformats/bases/base58';
import { createInvitation } from '@le-space/orbitdb-access-controller-decontact';
import {
	MAX_CLOCK_SKEW_MS,
	ONBOARDING_TOKEN_TTL_MS,
	REQUEST_ADDRESS,
	createOnboardingToken,
	createOnboardingTokenStore,
	createReplayGuard,
	createSigner,
	openMessage,
	parseOnboardingToken,
	redeemOnboardingToken,
	sealMessage,
	verifyOnboardingToken
} from './contact-messages.js';

const seedOf = (n) => new Uint8Array(32).fill(n);
async function person(n) {
	const seed = seedOf(n);
	const key = await generateKeyPairFromSeed('Ed25519', seed);
	const did = `did:key:${base58btc.encode(new Uint8Array([0xed, 0x01, ...key.publicKey.raw]))}`;
	return { seed, did, signer: await createSigner(seed, did) };
}

const alice = await person(1);
const bob = await person(2);
const carol = await person(3);
const bookOf = (p) => `/orbitdb/zdpu${p.did.slice(-20)}`;

const now = 1_800_000_000_000;

/** a request from `from` to `to`, as their app sends it */
async function request(from, to, extra = {}, options = { now }) {
	const data = { sharedAddress: bookOf(from), invitation: await createInvitation(from.seed, from.did, to.did) };
	return sealMessage(from.signer, { command: REQUEST_ADDRESS, recipient: to.did, data, ...extra }, options);
}

/** change the signed payload without signing again */
function tamper(text, change) {
	const envelope = JSON.parse(text);
	const payload = JSON.parse(envelope.payload);
	change(payload);
	return JSON.stringify({ ...envelope, payload: JSON.stringify(payload) });
}

const memoryStorage = () => {
	const items = new Map();
	return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
};

describe('signed requests', () => {
	it('accepts a request signed by its sender', async () => {
		const opened = await openMessage(await request(bob, alice, { nopingpong: true }), { me: alice.did, now });
		expect(opened.ok).toBe(true);
		expect(opened.message).toMatchObject({
			command: REQUEST_ADDRESS,
			sender: bob.did,
			recipient: alice.did,
			timestamp: now,
			nopingpong: true,
			data: { sharedAddress: bookOf(bob) }
		});
	});

	it('rejects a request that names somebody else as sender', async () => {
		// Carol signs, then claims to be Bob
		const forged = tamper(await request(carol, alice), (payload) => (payload.sender = bob.did));
		expect(await openMessage(forged, { me: alice.did, now })).toEqual({
			ok: false,
			reason: 'signature does not match the sender',
			sender: bob.did
		});
	});

	it('rejects a request signed with another key', async () => {
		const signedByCarol = { did: bob.did, sign: carol.signer.sign };
		const data = { sharedAddress: bookOf(bob), invitation: await createInvitation(bob.seed, bob.did, alice.did) };
		const forged = await sealMessage(signedByCarol, { command: REQUEST_ADDRESS, recipient: alice.did, data }, { now });
		expect((await openMessage(forged, { me: alice.did, now })).reason).toBe('signature does not match the sender');
	});

	it('rejects changes to any signed field', async () => {
		const genuine = await request(bob, alice);
		const changes = [
			(p) => (p.data.sharedAddress = bookOf(carol)),
			(p) => (p.timestamp += 1),
			(p) => (p.nonce = 'A'.repeat(22)),
			(p) => (p.onBoardingToken = 'whatever'),
			(p) => (p.nopingpong = true)
		];
		for (const change of changes) {
			expect((await openMessage(tamper(genuine, change), { me: alice.did, now })).reason).toBe('signature does not match the sender');
		}
	});

	it('rejects a request for somebody else', async () => {
		expect((await openMessage(await request(bob, carol), { me: alice.did, now })).reason).toBe('not addressed to us');
	});

	it('rejects a request that is too old or from the future', async () => {
		const old = await request(bob, alice, {}, { now: now - MAX_CLOCK_SKEW_MS - 1 });
		const future = await request(bob, alice, {}, { now: now + MAX_CLOCK_SKEW_MS + 1 });
		expect((await openMessage(old, { me: alice.did, now })).reason).toBe('too old or from the future');
		expect((await openMessage(future, { me: alice.did, now })).reason).toBe('too old or from the future');
		const justInTime = await request(bob, alice, {}, { now: now - MAX_CLOCK_SKEW_MS });
		expect((await openMessage(justInTime, { me: alice.did, now })).ok).toBe(true);
	});

	it("rejects an invitation that is not the sender's for us", async () => {
		const data = { sharedAddress: bookOf(bob), invitation: await createInvitation(bob.seed, bob.did, carol.did) };
		const message = await sealMessage(bob.signer, { command: REQUEST_ADDRESS, recipient: alice.did, data }, { now });
		expect((await openMessage(message, { me: alice.did, now })).reason).toBe('invitation is not from the sender for us');
	});

	it('drops malformed messages without throwing', async () => {
		const genuine = await request(bob, alice);
		const envelope = JSON.parse(genuine);
		const malformed = [
			undefined,
			'',
			'not json',
			'null',
			'[]',
			'"text"',
			'x'.repeat(20_000),
			// the old, unsigned format
			JSON.stringify({ command: REQUEST_ADDRESS, sender: bob.did, recipient: alice.did, data: '{}' }),
			JSON.stringify({ ...envelope, v: 1 }),
			JSON.stringify({ ...envelope, payload: 'not json' }),
			JSON.stringify({ ...envelope, payload: { nested: true } }),
			JSON.stringify({ ...envelope, sig: 42 }),
			JSON.stringify({ ...envelope, sig: 'too short' }),
			tamper(genuine, (p) => (p.command = 'CANCEL_REQUEST')),
			tamper(genuine, (p) => (p.sender = '__proto__')),
			tamper(genuine, (p) => (p.sender = 'did:web:example.com')),
			tamper(genuine, (p) => delete p.recipient),
			tamper(genuine, (p) => (p.timestamp = String(now))),
			tamper(genuine, (p) => (p.nonce = 'short')),
			tamper(genuine, (p) => (p.data = JSON.stringify(p.data))),
			tamper(genuine, (p) => (p.data.sharedAddress = 'https://example.com')),
			tamper(genuine, (p) => (p.data.sharedAddress = `/orbitdb/${'z'.repeat(300)}`)),
			tamper(genuine, (p) => delete p.data.invitation),
			tamper(genuine, (p) => (p.onBoardingToken = { nonce: 'x' })),
			tamper(genuine, (p) => (p.onBoardingToken = 'x'.repeat(600))),
			tamper(genuine, (p) => (p.nopingpong = 'yes'))
		];
		for (const text of malformed) {
			const opened = await openMessage(text, { me: alice.did, now });
			expect(opened.ok, String(text).slice(0, 80)).toBe(false);
		}
	});

	it('only signs for the DID of the seed', async () => {
		await expect(createSigner(bob.seed, alice.did)).rejects.toThrow();
	});
});

describe('replay guard', () => {
	it('lets each message through once', async () => {
		const guard = createReplayGuard();
		const first = (await openMessage(await request(bob, alice), { me: alice.did, now })).message;
		const second = (await openMessage(await request(bob, alice), { me: alice.did, now })).message;
		expect(guard.firstTime(first, now)).toBe(true);
		expect(guard.firstTime(first, now)).toBe(false);
		// a resend is a new message
		expect(guard.firstTime(second, now)).toBe(true);
		// the same nonce from another sender is another message
		expect(guard.firstTime({ ...first, sender: carol.did }, now)).toBe(true);
	});

	it('remembers a message as long as it would be accepted', async () => {
		const guard = createReplayGuard();
		const message = (await openMessage(await request(bob, alice), { me: alice.did, now })).message;
		guard.firstTime(message, now);
		expect(guard.firstTime(message, now + MAX_CLOCK_SKEW_MS)).toBe(false);
	});

	it('stays small', () => {
		const guard = createReplayGuard({ maxEntries: 3 });
		const messages = [1, 2, 3, 4].map((n) => ({ sender: bob.did, nonce: String(n), timestamp: now }));
		for (const message of messages) expect(guard.firstTime(message, now)).toBe(true);
		expect(guard.firstTime(messages[3], now)).toBe(false);
		expect(guard.firstTime(messages[0], now)).toBe(true); // forgotten first
	});
});

describe('invitation link tokens', () => {
	it('verifies a token of the inviter until it expires', async () => {
		const token = await createOnboardingToken(alice.signer, { requestAddress: false, now });
		expect(token.expiresAt).toBe(now + ONBOARDING_TOKEN_TTL_MS);
		expect(parseOnboardingToken(token.text)).toMatchObject({ nonce: token.nonce, expiresAt: token.expiresAt, requestAddress: false });
		expect(await verifyOnboardingToken(token.text, { inviter: alice.did, now })).toMatchObject({ ok: true });
		expect(await verifyOnboardingToken(token.text, { inviter: alice.did, now: token.expiresAt })).toEqual({
			ok: false,
			reason: 'has expired'
		});
	});

	it("rejects somebody else's token and changed tokens", async () => {
		const token = await createOnboardingToken(alice.signer, { requestAddress: false, now });
		const [v, nonce, expiresAt, requestAddress, sig] = token.text.split('.');
		const changed = [
			[v, nonce, expiresAt + '0', requestAddress, sig],
			[v, nonce, expiresAt, '1', sig],
			[v, 'B'.repeat(22), expiresAt, requestAddress, sig]
		].map((parts) => parts.join('.'));
		for (const text of changed) {
			expect((await verifyOnboardingToken(text, { inviter: alice.did, now })).reason).toBe('is not signed by us');
		}
		expect((await verifyOnboardingToken(token.text, { inviter: carol.did, now })).reason).toBe('is not signed by us');
		const carols = await createOnboardingToken(carol.signer, { now });
		expect((await verifyOnboardingToken(carols.text, { inviter: alice.did, now })).reason).toBe('is not signed by us');
	});

	it('rejects malformed tokens', async () => {
		const token = await createOnboardingToken(alice.signer, { now });
		const [, ...rest] = token.text.split('.');
		for (const text of [undefined, '', 'mytoken', 'a'.repeat(140), ['2', ...rest].join('.'), token.text + '.x', { text: token.text }]) {
			expect((await verifyOnboardingToken(text, { inviter: alice.did, now })).reason).toBe('is malformed');
		}
	});

	it('works for the first invitee only', async () => {
		const store = createOnboardingTokenStore(memoryStorage());
		const token = await createOnboardingToken(alice.signer, { now });
		store.issued(token, now);
		const redeem = (invitee, at = now) => redeemOnboardingToken(token.text, { inviter: alice.did, invitee, store, now: at });

		expect(await redeem(bob.did)).toEqual({ ok: true, requestAddress: true });
		// Bob's app resends its request until it is answered
		expect(await redeem(bob.did, now + 1000)).toEqual({ ok: true, requestAddress: true });
		expect(await redeem(carol.did)).toEqual({ ok: false, reason: 'was already used' });
		expect(await redeem(bob.did, token.expiresAt)).toEqual({ ok: false, reason: 'has expired' });
	});

	it('expires an unused token', async () => {
		const store = createOnboardingTokenStore(memoryStorage());
		const token = await createOnboardingToken(alice.signer, { now });
		store.issued(token, now);
		const later = now + ONBOARDING_TOKEN_TTL_MS + 1;
		expect(await redeemOnboardingToken(token.text, { inviter: alice.did, invitee: bob.did, store, now: later })).toEqual({
			ok: false,
			reason: 'has expired'
		});
	});

	it('accepts only tokens issued on this device', async () => {
		const store = createOnboardingTokenStore(memoryStorage());
		const token = await createOnboardingToken(alice.signer, { now });
		expect(await redeemOnboardingToken(token.text, { inviter: alice.did, invitee: bob.did, store, now })).toEqual({
			ok: false,
			reason: 'was not issued on this device'
		});
	});

	it('keeps tokens across reloads and forgets expired ones', async () => {
		const storage = memoryStorage();
		const token = await createOnboardingToken(alice.signer, { now });
		const short = await createOnboardingToken(alice.signer, { now, ttlMs: 1000 });
		createOnboardingTokenStore(storage).issued(token, now);
		createOnboardingTokenStore(storage).issued(short, now);
		createOnboardingTokenStore(storage).redeem(token, bob.did, now);

		const reloaded = createOnboardingTokenStore(storage);
		expect(reloaded.redeem(token, carol.did, now + 1)).toEqual({ ok: false, reason: 'was already used' });
		reloaded.issued(await createOnboardingToken(alice.signer, { now: now + 2000 }), now + 2000);
		expect(Object.keys(JSON.parse(storage.getItem('onboardingTokens')))).not.toContain(short.nonce);
	});

	it('starts over when the stored tokens are unreadable', async () => {
		const storage = memoryStorage();
		storage.setItem('onboardingTokens', '{broken');
		const store = createOnboardingTokenStore(storage);
		const token = await createOnboardingToken(alice.signer, { now });
		store.issued(token, now);
		expect(store.redeem(token, bob.did, now)).toEqual({ ok: true });
	});
});
