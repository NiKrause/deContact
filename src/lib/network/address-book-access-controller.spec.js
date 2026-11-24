import { describe, expect, it } from 'vitest';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { base58btc } from 'multiformats/bases/base58';
import AddressBookAccessController, {
	contactKey,
	createInvitation,
	mayWrite,
	publicKeyFromDid,
	type,
	verifyInvitation
} from './address-book-access-controller.js';

const seedOf = (n) => new Uint8Array(32).fill(n);
async function didOf(seed) {
	const key = await generateKeyPairFromSeed('Ed25519', seed);
	return `did:key:${base58btc.encode(new Uint8Array([0xed, 0x01, ...key.publicKey.raw]))}`;
}

const alice = { seed: seedOf(1) };
const bob = { seed: seedOf(2) };
const mallory = { seed: seedOf(3) };
alice.did = await didOf(alice.seed);
bob.did = await didOf(bob.seed);
mallory.did = await didOf(mallory.seed);

const card = (did, invitation, extra = {}) => ({
	op: 'PUT',
	key: contactKey(did),
	value: { _id: contactKey(did), owner: did, firstName: 'Bob', lastName: 'Stromwerk', invitation, ...extra }
});

describe('invitations', () => {
	it('reads the Ed25519 key from a did:key', () => {
		expect(publicKeyFromDid(alice.did)).not.toBeNull();
		expect(publicKeyFromDid('did:web:example.com')).toBeNull();
		expect(publicKeyFromDid(undefined)).toBeNull();
	});

	it('verifies for the invitee and nobody else', async () => {
		const invitation = await createInvitation(alice.seed, alice.did, bob.did);
		expect(await verifyInvitation(invitation, { owner: alice.did, invitee: bob.did })).toBe(true);
		expect(await verifyInvitation(invitation, { owner: alice.did, invitee: mallory.did })).toBe(false);
		expect(await verifyInvitation({ ...invitation, invitee: mallory.did }, { owner: alice.did, invitee: mallory.did })).toBe(false);
	});

	it('cannot be made for somebody else with your own seed', async () => {
		await expect(createInvitation(mallory.seed, alice.did, mallory.did)).rejects.toThrow(/does not belong/);
		const forged = { ...(await createInvitation(mallory.seed, mallory.did, mallory.did)), owner: alice.did };
		expect(await verifyInvitation(forged, { owner: alice.did, invitee: mallory.did })).toBe(false);
	});
});

describe('mayWrite', () => {
	it('lets the owner write anything', async () => {
		expect(await mayWrite({ owner: alice.did, writer: alice.did, payload: { op: 'PUT', key: 'x', value: { _id: 'x' } } })).toBe(true);
		expect(await mayWrite({ owner: alice.did, writer: alice.did, payload: { op: 'DEL', key: 'x' } })).toBe(true);
	});

	it('lets an invited contact put their own card', async () => {
		const invitation = await createInvitation(alice.seed, alice.did, bob.did);
		expect(await mayWrite({ owner: alice.did, writer: bob.did, payload: card(bob.did, invitation) })).toBe(true);
	});

	it('refuses a card without, or with somebody else\'s, invitation', async () => {
		expect(await mayWrite({ owner: alice.did, writer: bob.did, payload: card(bob.did, undefined) })).toBe(false);
		const forMallory = await createInvitation(alice.seed, alice.did, mallory.did);
		expect(await mayWrite({ owner: alice.did, writer: bob.did, payload: card(bob.did, forMallory) })).toBe(false);
	});

	it('refuses anything but their own card, even when invited', async () => {
		const invitation = await createInvitation(alice.seed, alice.did, bob.did);
		// Alice's own card
		const overwrite = { op: 'PUT', key: 'alice-card', value: { _id: 'alice-card', owner: bob.did, invitation } };
		expect(await mayWrite({ owner: alice.did, writer: bob.did, payload: overwrite })).toBe(false);
		// a card under Bob's key that claims to be Mallory's
		expect(await mayWrite({ owner: alice.did, writer: bob.did, payload: card(bob.did, invitation, { owner: mallory.did }) })).toBe(false);
		// Mallory's card, written by Bob
		expect(await mayWrite({ owner: alice.did, writer: bob.did, payload: card(mallory.did, invitation) })).toBe(false);
		// deleting another document
		expect(await mayWrite({ owner: alice.did, writer: bob.did, payload: { op: 'DEL', key: 'alice-card' } })).toBe(false);
	});

	it('lets a contact delete their own card', async () => {
		expect(await mayWrite({ owner: alice.did, writer: bob.did, payload: { op: 'DEL', key: contactKey(bob.did) } })).toBe(true);
	});
});

describe('AddressBookAccessController', () => {
	const memoryStorage = () => {
		const blocks = new Map();
		return { put: async (hash, bytes) => blocks.set(hash, bytes), get: async (hash) => blocks.get(hash) };
	};
	const identitiesWith = (ids) => ({
		getIdentity: async (hash) => (ids[hash] ? { id: ids[hash] } : undefined),
		verifyIdentity: async () => true
	});

	it('keeps the owner in its manifest and applies the rule to entries', async () => {
		const storage = memoryStorage();
		const identities = identitiesWith({ a: alice.did, b: bob.did, m: mallory.did });
		const created = await AddressBookAccessController({ storage })({ orbitdb: { identity: { id: alice.did } }, identities });
		expect(created.address.startsWith(`/${type}/`)).toBe(true);
		expect(created.owner).toBe(alice.did);

		// a second peer opens the book by address: the owner comes from the manifest
		const opened = await AddressBookAccessController({ storage })({
			orbitdb: { identity: { id: bob.did } },
			identities,
			address: created.address
		});
		expect(opened.owner).toBe(alice.did);

		const invitation = await createInvitation(alice.seed, alice.did, bob.did);
		expect(await opened.canAppend({ identity: 'a', payload: { op: 'PUT', key: 'x', value: { _id: 'x' } } })).toBe(true);
		expect(await opened.canAppend({ identity: 'b', payload: card(bob.did, invitation) })).toBe(true);
		expect(await opened.canAppend({ identity: 'm', payload: card(mallory.did, undefined) })).toBe(false);
		expect(await opened.canAppend({ identity: 'unknown', payload: card(bob.did, invitation) })).toBe(false);
	});

	it('refuses a writer whose identity does not verify', async () => {
		const identities = { getIdentity: async () => ({ id: alice.did }), verifyIdentity: async () => false };
		const ac = await AddressBookAccessController({ storage: memoryStorage() })({ orbitdb: { identity: { id: alice.did } }, identities });
		expect(await ac.canAppend({ identity: 'a', payload: { op: 'PUT', key: 'x', value: { _id: 'x' } } })).toBe(false);
	});
});
