/**
 * The vault record as a file to keep (#60): Settings offers it, and so does the offer
 * right after a temporary identity was secured (#97). The record is public; it holds no
 * secret.
 */
import { vaultRecordText } from './session.js'

export const VAULT_FILE_NAME = 'decontact-vault.json'

/** the browser saves the open vault's record as a file */
export function downloadVaultRecord() {
    const blob = new Blob([vaultRecordText()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = VAULT_FILE_NAME
    a.click()
    URL.revokeObjectURL(a.href)
}
