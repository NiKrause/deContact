import { describe, expect, it } from 'vitest';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { base58btc } from 'multiformats/bases/base58';
import { base64url } from 'multiformats/bases/base64';
import { createInvitation } from '@le-space/orbitdb-access-controller-decontact';
import { encryptionKeysFromSeed, openSeal, seal } from '../encryption/sealing.js';
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
	return { seed, did, signer: await createSigner(seed, did), keys: await encryptionKeysFromSeed(seed, { did }) };
}

const alice = await person(1);
const bob = await person(2);
const carol = await person(3);
const bookOf = (p) => `/orbitdb/zdpu${p.did.slice(-20)}`;

const now = 1_800_000_000_000;
/** how `me` opens what arrives on its topic */
const as = (me, extra = {}) => ({ me: me.did, keys: me.keys, now, ...extra });

/** a request from `from` to `to`, as their app sends it */
async function request(from, to, extra = {}, options = { now }) {
	const data = { sharedAddress: bookOf(from), invitation: await createInvitation(from.seed, from.did, to.did) };
	return sealMessage(from.signer, { command: REQUEST_ADDRESS, recipient: to.did, data, ...extra }, options);
}

// part of the format (contact-messages.js)
const contextFor = (recipient) => `decontact/request/v1\n${recipient.did}`;

/** the signed message inside, as `to` opens it */
async function unsealed(text, to = alice) {
	const bytes = await openSeal(to.keys, JSON.parse(text).sealed, { context: contextFor(to) });
	return new TextDecoder().decode(bytes);
}

/** a signed message sealed for `to`, as anybody can make one */
async function sealedFor(signedText, to = alice) {
	const sealed = await seal(to.keys.publicKey, new TextEncoder().encode(signedText), { context: contextFor(to) });
	return JSON.stringify({ v: 3, sealed });
}

/** change the signed payload without signing again (and seal it again for Alice) */
async function tamper(text, change) {
	const envelope = JSON.parse(await unsealed(text));
	const payload = JSON.parse(envelope.payload);
	change(payload);
	return sealedFor(JSON.stringify({ ...envelope, payload: JSON.stringify(payload) }));
}

const memoryStorage = () => {
	const items = new Map();
	return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
};

describe('signed requests', () => {
	it('accepts a request signed by its sender', async () => {
		const opened = await openMessage(await request(bob, alice, { nopingpong: true }), as(alice));
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
		const forged = await tamper(await request(carol, alice), (payload) => (payload.sender = bob.did));
		expect(await openMessage(forged, as(alice))).toEqual({
			ok: false,
			reason: 'signature does not match the sender',
			sender: bob.did
		});
	});

	it('rejects a request signed with another key', async () => {
		const signedByCarol = { did: bob.did, sign: carol.signer.sign };
		const data = { sharedAddress: bookOf(bob), invitation: await createInvitation(bob.seed, bob.did, alice.did) };
		const forged = await sealMessage(signedByCarol, { command: REQUEST_ADDRESS, recipient: alice.did, data }, { now });
		expect((await openMessage(forged, as(alice))).reason).toBe('signature does not match the sender');
	});

	it('rejects changes to any signed field', async () => {
		const genuine = await request(bob, alice, { from: { firstName: 'Bob' } });
		const changes = [
			(p) => (p.data.sharedAddress = bookOf(carol)),
			(p) => (p.timestamp += 1),
			(p) => (p.nonce = 'A'.repeat(22)),
			(p) => (p.onBoardingToken = 'whatever'),
			(p) => (p.nopingpong = true),
			(p) => Object.assign(p, { onBoardingToken: 'whatever', twoWay: true }),
			(p) => (p.from.firstName = 'Carol')
		];
		for (const change of changes) {
			expect((await openMessage(await tamper(genuine, change), as(alice))).reason).toBe('signature does not match the sender');
		}
	});

	it('rejects a request for somebody else', async () => {
		// Bob's request for Carol, which Carol seals again for Alice
		const forwarded = await sealedFor(await unsealed(await request(bob, carol), carol), alice);
		expect((await openMessage(forwarded, as(alice))).reason).toBe('not addressed to us');
	});

	it('rejects a request that is too old or from the future', async () => {
		const old = await request(bob, alice, {}, { now: now - MAX_CLOCK_SKEW_MS - 1 });
		const future = await request(bob, alice, {}, { now: now + MAX_CLOCK_SKEW_MS + 1 });
		expect((await openMessage(old, as(alice))).reason).toBe('too old or from the future');
		expect((await openMessage(future, as(alice))).reason).toBe('too old or from the future');
		const justInTime = await request(bob, alice, {}, { now: now - MAX_CLOCK_SKEW_MS });
		expect((await openMessage(justInTime, as(alice))).ok).toBe(true);
	});

	it("rejects an invitation that is not the sender's for us", async () => {
		const data = { sharedAddress: bookOf(bob), invitation: await createInvitation(bob.seed, bob.did, carol.did) };
		const message = await sealMessage(bob.signer, { command: REQUEST_ADDRESS, recipient: alice.did, data }, { now });
		expect((await openMessage(message, as(alice))).reason).toBe('invitation is not from the sender for us');
	});

	it('drops malformed messages without throwing', async () => {
		const genuine = await request(bob, alice);
		const envelope = JSON.parse(await unsealed(genuine));
		const outer = JSON.parse(genuine);
		const malformed = [
			undefined,
			'',
			'not json',
			'null',
			'[]',
			'"text"',
			'x'.repeat(30_000),
			// the old, unsigned format
			JSON.stringify({ command: REQUEST_ADDRESS, sender: bob.did, recipient: alice.did, data: '{}' }),
			JSON.stringify({ ...outer, v: 2 }),
			JSON.stringify({ ...outer, sealed: { ...outer.sealed, v: 2 } }),
			JSON.stringify({ ...outer, sealed: 'text' }),
			await sealedFor('not json'),
			await sealedFor('x'.repeat(17_000)),
			await sealedFor(JSON.stringify({ ...envelope, v: 1 })),
			await sealedFor(JSON.stringify({ ...envelope, payload: 'not json' })),
			await sealedFor(JSON.stringify({ ...envelope, payload: { nested: true } })),
			await sealedFor(JSON.stringify({ ...envelope, sig: 42 })),
			await sealedFor(JSON.stringify({ ...envelope, sig: 'too short' })),
			await tamper(genuine, (p) => (p.command = 'CANCEL_REQUEST')),
			await tamper(genuine, (p) => (p.sender = '__proto__')),
			await tamper(genuine, (p) => (p.sender = 'did:web:example.com')),
			await tamper(genuine, (p) => delete p.recipient),
			await tamper(genuine, (p) => (p.timestamp = String(now))),
			await tamper(genuine, (p) => (p.nonce = 'short')),
			await tamper(genuine, (p) => (p.data = JSON.stringify(p.data))),
			await tamper(genuine, (p) => (p.data.sharedAddress = 'https://example.com')),
			await tamper(genuine, (p) => (p.data.sharedAddress = `/orbitdb/${'z'.repeat(300)}`)),
			await tamper(genuine, (p) => delete p.data.invitation),
			await tamper(genuine, (p) => (p.onBoardingToken = { nonce: 'x' })),
			await tamper(genuine, (p) => (p.onBoardingToken = 'x'.repeat(600))),
			await tamper(genuine, (p) => (p.nopingpong = 'yes')),
			await tamper(genuine, (p) => (p.twoWay = 'yes')),
			await tamper(genuine, (p) => (p.from = 'Bob')),
			await tamper(genuine, (p) => (p.from = { street: 'Example Street 1' })),
			await tamper(genuine, (p) => (p.from = { firstName: 42 })),
			await tamper(genuine, (p) => (p.from = { firstName: 'x'.repeat(201) }))
		];
		for (const text of malformed) {
			const opened = await openMessage(text, as(alice));
			expect(opened.ok, String(text).slice(0, 80)).toBe(false);
		}
	});

	it('only signs for the DID of the seed', async () => {
		await expect(createSigner(bob.seed, alice.did)).rejects.toThrow();
	});
});

describe('two-way exchange (#86)', () => {
	it("asks for an invitation with the link's token, signed like every request", async () => {
		const token = await createOnboardingToken(alice.signer, { now });
		const opened = await openMessage(await request(bob, alice, { onBoardingToken: token.text, twoWay: true }), as(alice));
		expect(opened.ok).toBe(true);
		expect(opened.message).toMatchObject({ sender: bob.did, onBoardingToken: token.text, twoWay: true });
		// without the flag the field is left out, as nopingpong is
		const plain = await openMessage(await request(bob, alice, { onBoardingToken: token.text, twoWay: false }), as(alice));
		expect(plain.message).not.toHaveProperty('twoWay');
	});

	it('needs an invitation link', async () => {
		const data = { sharedAddress: bookOf(bob), invitation: await createInvitation(bob.seed, bob.did, alice.did) };
		await expect(sealMessage(bob.signer, { command: REQUEST_ADDRESS, recipient: alice.did, data, twoWay: true }, { now })).rejects.toThrow();
		// made by hand, signed and sealed: dropped all the same
		const token = await createOnboardingToken(alice.signer, { now });
		const genuine = await request(bob, alice, { onBoardingToken: token.text, twoWay: true });
		const envelope = JSON.parse(await unsealed(genuine));
		const payload = JSON.parse(envelope.payload);
		delete payload.onBoardingToken;
		const text = JSON.stringify(payload);
		const sig = base64url.baseEncode(await bob.signer.sign(new TextEncoder().encode(`decontact/message/v2\n${text}`)));
		const forged = await sealedFor(JSON.stringify({ v: 2, payload: text, sig }));
		expect(await openMessage(forged, as(alice))).toEqual({
			ok: false,
			reason: 'two-way exchange without an invitation link',
			sender: bob.did
		});
	});

	it("is answered by the inviter's invitation, which names the link it answers", async () => {
		const token = await createOnboardingToken(alice.signer, { now });
		// Alice's device answers Bob: her book, an invitation for him, no ping-pong
		const answer = await openMessage(await request(alice, bob, { onBoardingToken: token.text, nopingpong: true }), as(bob));
		expect(answer.ok).toBe(true);
		expect(answer.message).toMatchObject({ sender: alice.did, nopingpong: true, onBoardingToken: token.text });
		expect(answer.message).not.toHaveProperty('twoWay');
		// Bob checks that the token is Alice's, against the DID in the link
		expect(await verifyOnboardingToken(answer.message.onBoardingToken, { inviter: alice.did, now })).toMatchObject({ ok: true });
	});
});

describe('sealed requests (#59, finding 3 of #58)', () => {
	it('show a peer on the topic nothing of the sender, their book or their name', async () => {
		const text = await request(bob, alice, { from: { firstName: 'Bob', lastName: 'Stromwerk', city: 'Example City' } });
		for (const plain of [bob.did, bookOf(bob), 'Stromwerk', 'Example City', REQUEST_ADDRESS]) {
			expect(text).not.toContain(plain);
		}
		expect(await openMessage(text, as(carol))).toEqual({ ok: false, reason: 'not sealed for us' });
	});

	it('open for the recipient only, with its key', async () => {
		const text = await request(bob, alice);
		expect((await openMessage(text, as(alice))).ok).toBe(true);
		expect(await openMessage(text, { me: alice.did, now })).toEqual({ ok: false, reason: 'no key to open it' });
		// Carol's key, under Alice's name
		expect((await openMessage(text, { me: alice.did, keys: carol.keys, now })).reason).toBe('not sealed for us');
	});

	it('drop a request that was signed but not sealed', async () => {
		const signedOnly = await unsealed(await request(bob, alice));
		expect(await openMessage(signedOnly, as(alice))).toEqual({ ok: false, reason: 'not a sealed deContact message' });
	});

	it("carry the sender's name, and nothing else of the card", async () => {
		const card = { firstName: 'Bob', lastName: 'Stromwerk', city: 'Example City', street: 'Example Street 1', email: 'bob@example.com', own: true };
		const opened = await openMessage(await request(bob, alice, { from: card }), as(alice));
		expect(opened.message.from).toEqual({ firstName: 'Bob', lastName: 'Stromwerk', city: 'Example City' });
		expect((await openMessage(await request(bob, alice, { from: { firstName: '' } }), as(alice))).message.from).toBeUndefined();
	});

	it('can only be made for a did:key', async () => {
		const data = { sharedAddress: bookOf(bob), invitation: await createInvitation(bob.seed, bob.did, alice.did) };
		await expect(sealMessage(bob.signer, { command: REQUEST_ADDRESS, recipient: 'did:web:example.com', data })).rejects.toThrow();
	});
});

describe('replay guard', () => {
	it('lets each message through once', async () => {
		const guard = createReplayGuard();
		const first = (await openMessage(await request(bob, alice), as(alice))).message;
		const second = (await openMessage(await request(bob, alice), as(alice))).message;
		expect(guard.firstTime(first, now)).toBe(true);
		expect(guard.firstTime(first, now)).toBe(false);
		// a resend is a new message
		expect(guard.firstTime(second, now)).toBe(true);
		// the same nonce from another sender is another message
		expect(guard.firstTime({ ...first, sender: carol.did }, now)).toBe(true);
	});

	it('remembers a message as long as it would be accepted', async () => {
		const guard = createReplayGuard();
		const message = (await openMessage(await request(bob, alice), as(alice))).message;
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
		const token = await createOnboardingToken(alice.signer, { twoWay: false, now });
		expect(token.expiresAt).toBe(now + ONBOARDING_TOKEN_TTL_MS);
		expect(parseOnboardingToken(token.text)).toMatchObject({ nonce: token.nonce, expiresAt: token.expiresAt, twoWay: false });
		expect(await verifyOnboardingToken(token.text, { inviter: alice.did, now })).toMatchObject({ ok: true });
		expect(await verifyOnboardingToken(token.text, { inviter: alice.did, now: token.expiresAt })).toEqual({
			ok: false,
			reason: 'has expired'
		});
	});

	it("rejects somebody else's token and changed tokens", async () => {
		const token = await createOnboardingToken(alice.signer, { twoWay: false, now });
		const [v, nonce, expiresAt, twoWay, sig] = token.text.split('.');
		const changed = [
			[v, nonce, expiresAt + '0', twoWay, sig],
			// nobody can turn a two-way exchange on (or off) after Alice signed
			[v, nonce, expiresAt, '1', sig],
			[v, 'B'.repeat(22), expiresAt, twoWay, sig]
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

		expect(await redeem(bob.did)).toEqual({ ok: true, twoWay: true });
		// Bob's app resends its request until it is answered
		expect(await redeem(bob.did, now + 1000)).toEqual({ ok: true, twoWay: true });
		expect(await redeem(carol.did)).toEqual({ ok: false, reason: 'was already used' });
		expect(await redeem(bob.did, token.expiresAt)).toEqual({ ok: false, reason: 'has expired' });
	});

	it('says whether a two-way exchange is allowed, on by default', async () => {
		const store = createOnboardingTokenStore(memoryStorage());
		const twoWay = await createOnboardingToken(alice.signer, { now });
		const oneWay = await createOnboardingToken(alice.signer, { twoWay: false, now });
		expect(twoWay.twoWay).toBe(true);
		expect(twoWay.text.split('.')[3]).toBe('1');
		expect(oneWay.text.split('.')[3]).toBe('0');
		for (const token of [twoWay, oneWay]) store.issued(token, now);
		const redeem = (token) => redeemOnboardingToken(token.text, { inviter: alice.did, invitee: bob.did, store, now });
		expect(await redeem(twoWay)).toEqual({ ok: true, twoWay: true });
		expect(await redeem(oneWay)).toEqual({ ok: true, twoWay: false });
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
