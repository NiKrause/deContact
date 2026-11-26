# @le-space/orbitdb-access-controller-decontact

OrbitDB access controller `decontact-address-book`, used by [deContact](https://github.com/NiKrause/deContact) address books.

- The owner may write anything. That is every device whose OrbitDB identity carries the owner's DID.
- Anybody else may write only their own contact card:
  - the key is `contact:<their DID>`;
  - `owner` is set to their DID;
  - the card carries an invitation that the owner signed with the key of their `did:key`.
- A contact may also delete their own card.

The owner's DID is kept in the controller's manifest. Every peer that registers this controller therefore checks entries the same way, including a relay that replicates the books. It runs in the browser and in Node.

```js
import { useAccessController } from '@orbitdb/core'
import AddressBookAccessController, { contactKey, createInvitation } from '@le-space/orbitdb-access-controller-decontact'

useAccessController(AddressBookAccessController)
const book = await orbitdb.open('/myAddressBook/…', { type: 'documents', AccessController: AddressBookAccessController() })

// invite Bob: he may then put { _id: contactKey(bob), owner: bob, invitation, … } into the book
const invitation = await createInvitation(ownerSigner, ownerDid, bobDid)
```

`createInvitation` takes the owner's key as a signer, `{ did, sign(bytes) }` (deContact passes the
Ed25519 identity of its passkey vault, `createSecretSigner` of
`@le-space/orbitdb-identity-provider-webauthn-did`), or as the 32-byte seed of the `did:key`. Either
way the signer's DID must be the owner's. `verifyInvitation` only reads the key out of the owner's
`did:key`, so it does not care which of the two made the invitation.

## On an orbitdb-relay

```bash
RELAY_ACCESS_CONTROLLERS=@le-space/orbitdb-access-controller-decontact orbitdb-relay
```

Install the package next to orbitdb-relay, so the package name resolves from there.
