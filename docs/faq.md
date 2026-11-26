# FAQ: encryption and privacy

[README](../README.md) · [How it works](how-it-works.md) · [Relays](relays.md) · [Configuration](configuration.md) · [Development](development.md) · **FAQ**

Questions about how deContact encrypts address books and contact requests ([#59](https://github.com/NiKrause/deContact/issues/59)) and what it does not hide. The details are in [How it works → Encryption](how-it-works.md#encryption-sealed-to-the-reader).

- [Who can read my address book?](#who-can-read-my-address-book)
- [Why don't I share a key for my book with my contacts?](#why-dont-i-share-a-key-for-my-book-with-my-contacts)
- [Where does the encryption key come from? Do I have to back it up?](#where-does-the-encryption-key-come-from-do-i-have-to-back-it-up)
- [How does somebody find my key? Is there a key directory?](#how-does-somebody-find-my-key-is-there-a-key-directory)
- [Isn't it bad to sign and decrypt with the same key?](#isnt-it-bad-to-sign-and-decrypt-with-the-same-key)
- [What does a relay see?](#what-does-a-relay-see)
- [Why not OrbitDB's built-in encryption?](#why-not-orbitdbs-built-in-encryption)
- [What do the people who keep a backup of my book see?](#what-do-the-people-who-keep-a-backup-of-my-book-see)
- [Can somebody see who my contacts are?](#can-somebody-see-who-my-contacts-are)
- [Why is there no replication key yet?](#why-is-there-no-replication-key-yet)
- [Are contact requests encrypted?](#are-contact-requests-encrypted)
- [What happens when I remove a contact?](#what-happens-when-i-remove-a-contact)
- [Can a removed contact still write into my book?](#can-a-removed-contact-still-write-into-my-book)
- [Can a contact make their card look like my own?](#can-a-contact-make-their-card-look-like-my-own)
- [What happened to what I wrote before the encryption?](#what-happened-to-what-i-wrote-before-the-encryption)
- [What if I lose my passkeys?](#what-if-i-lose-my-passkeys)

## Who can read my address book?

Only you, on any device where you opened your vault. Every document in your book is sealed to you, whoever writes it: your own card, and the cards your contacts write into it. Contacts, relays and the people who keep a backup of your book hold ciphertext.

Your contacts read your card in **their own** book, where you wrote it, sealed to them.

## Why don't I share a key for my book with my contacts?

Because nobody but you reads your book. A shared key fits a list that several people read, as in simple-todo's `privacy01`: the list's key is handed to every reader and replaced when one leaves. In deContact, Bob writes his card into your book but never reads it. If he had your book's key so that he could encrypt his card, he could also read every other card in your book: all your contacts.

So each card is sealed to its single reader instead. There is no book key, nothing to hand out, and nothing to rotate when somebody leaves.

## Where does the encryption key come from? Do I have to back it up?

It comes from your identity, so there is nothing extra to back up. Your vault holds one root; your Ed25519 `did:key` is derived from it, and the encryption key is that key's X25519 counterpart. Every passkey that opens your vault, and your recovery words, give you the same key on every device. It lives in the page's memory while the app is open, as a key no script can read out, and it is never stored.

## How does somebody find my key? Is there a key directory?

They work it out from your DID: an Ed25519 `did:key` has exactly one X25519 counterpart (the did:key method defines it). So the key is there as soon as somebody has your DID, from a QR code or a link, with nothing to look up first.

That is also why there is no key directory. A directory is something an attacker could put their own key into under your DID; a key that follows from the DID cannot be swapped.

## Isn't it bad to sign and decrypt with the same key?

It is one secret for two jobs, and that has a cost: if your identity's key leaked, an attacker could both sign as you and read what was sealed to you. Using an Ed25519 key's X25519 counterpart for encryption is established practice (the did:key method, libsodium, age), and both keys would come from the same root anyway. What it buys is that no key has to be published, found or trusted separately.

## What does a relay see?

The relay keeps a replica of your book so that updates reach people who were offline, and it checks every entry with the same access controller as the browsers. To do that it needs a few fields in the clear: each document's `_id`, and on a contact's card the contact's DID and the invitation you signed for them. Everything else is ciphertext: names, addresses, phone numbers, email, and the address of the writer's own book.

## Why not OrbitDB's built-in encryption?

OrbitDB can encrypt an entry's whole payload (`encryption.data`). A relay without the key would then see neither the key, the owner nor the invitation of a contact's card, and the access controller would refuse every card a contact writes into your book. deContact therefore seals the card's content in a field of its own and leaves the access controller, and every relay running it, unchanged.

## What do the people who keep a backup of my book see?

What a relay sees: the clear fields above and ciphertext. Your contacts' apps keep a copy of your book as a backup for you, and yours does the same for them, but nobody can read the copy they keep. You can, if you ever need to restore from it.

## Can somebody see who my contacts are?

Partly, yes. The cards are encrypted; the fact that they exist is not. Your book's address follows from your DID, and whoever opens it sees which DIDs wrote into it and when. A contact's card is filed as `contact:<their DID>` and carries the invitation you signed for them. Entry sizes are visible too.

## Why is there no replication key yet?

A replication key (OrbitDB `encryption.replication`) would encrypt whole entries, including the metadata above. But then only peers holding that key could check and keep your book: every relay and every contact keeping a backup would need it. A relay is a third party, so handing it the key would hide little from the relay itself. It would hide something from anybody else who opens your book, so it is planned as a follow-up rather than left out.

## Are contact requests encrypted?

Yes. A request is signed with the sender's DID and then sealed to the recipient. It carries the sender's book address, an invitation and the sender's name, so the recipient's dialog can say who is asking. A peer subscribed to the recipient's topic sees that something was sent to the recipient, when, and from which network peer; not who sent it or what it says. A request sealed for somebody else, or not sealed at all, is dropped.

## What happens when I remove a contact?

Deleting a contact's card under **Contacts** does three things:

- it removes your card from their book;
- it stops your later changes from reaching them;
- it removes their card and the record of their book from yours.

It cannot take back what they already received: the cards you sent them earlier stay readable to them, as anything once shared does.

## Can a removed contact still write into my book?

For now, yes. The invitation you signed for them stays valid, so they could write their card into your book again. Revoking an invitation needs a change of the access controller and an update of the relays that run it, which is planned as a follow-up.

## Can a contact make their card look like my own?

No. A contact writes the content of their card themselves, so it could claim to be "your own address". deContact accepts that flag only on a card whose owner is the book's owner. A sealed card copied to another place in your book, or into another book, does not open there.

## What happened to what I wrote before the encryption?

When the app starts, documents of your own book that were still in the clear are sealed again. The old plaintext entries stay in the book's history, which is an append-only log, and anybody who copied the book before the change has them.

## What if I lose my passkeys?

Your encryption key comes from your vault, so the same thing opens both: any of your passkeys, or your recovery words. Losing all of them means losing your address book, encryption or not. Set up a second passkey or the recovery words under **Settings** ([How it works → Identity](how-it-works.md#identity-passkeys-and-the-vault)).
