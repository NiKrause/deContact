/**
 * Recovery words: 24 words on paper that open the vault when no passkey is at hand.
 *
 * The format is BIP39 (256 random bits, a checksum, 24 words of the English list), as
 * deContact's seed phrase was and as Le-Space/belege's recovery words are, so one set of
 * words means the same in both. The words are the vault's recovery slot (vault.js), not
 * the identity: they are made here, never chosen by a person, shown once and never
 * stored. What is kept is a slot in the vault, sealed under a key derived from BIP39's
 * seed for the words (PBKDF2-HMAC-SHA512, 2048 rounds, salt "mnemonic", no passphrase).
 */
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from 'bip39'

/** 256 bits and an 8-bit checksum, 11 bits a word */
export const WORD_COUNT = 24

/** new recovery words from the browser's random source */
export function newRecoveryWords() {
    return generateMnemonic(256).split(' ')
}

/**
 * The words in what a person typed or pasted: case, numbering ("1." or "1)"), commas and
 * line breaks do not matter.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function normalizeWords(text) {
    return String(text ?? '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[0-9]+[.)]?/g, ' ')
        .split(/[^a-z]+/)
        .filter(Boolean)
}

/** whether these are 24 recovery words with a checksum that holds (a word misread from paper fails it, but for 1 in 256) */
export function checkWords(words) {
    return Array.isArray(words) && words.length === WORD_COUNT && validateMnemonic(words.join(' '))
}

/**
 * BIP39's seed for the words: what the recovery slot's key is derived from.
 *
 * @param {string[]} words
 * @returns {Promise<Uint8Array>} 64 bytes
 */
export async function seedFromWords(words) {
    if (!checkWords(words)) throw new Error('These are not 24 valid recovery words.')
    return new Uint8Array(await mnemonicToSeed(words.join(' ')))
}
