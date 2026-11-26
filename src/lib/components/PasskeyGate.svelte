<script>
    /**
     * @component The first screen while the vault is shut (#60): unlock with a passkey,
     * create a new address book, or restore one with a passkey, the recovery words, a
     * device link or a vault file. A passkey that opens nothing is never given a new
     * address book without asking.
     */
    import {
        createAddressBook,
        createForPasskey,
        forgetPendingPasskey,
        handRecord,
        legacySeedRemoved,
        unlockWithPasskey,
        unlockWithWords,
        vaultKeptHere
    } from '#lib/identity/session.js'
    import { passkeyProblem, passkeysSupported } from '#lib/identity/passkeys.js'
    import { parseVaultRecord } from '#lib/identity/vault.js'
    import { notify } from '../../utils/utils.js'

    /** onboarding: somebody opened an invitation link; handedOver: a device link brought a vault record */
    let { onboarding = false, handedOver = false } = $props()

    const supported = passkeysSupported()
    const kept = vaultKeptHere()
    let busy = $state(false)
    let problem = $state('')
    /** a passkey opened nothing here or on the network: ask before making an address book */
    let askNew = $state(false)
    let showWords = $state(false)
    let wordsText = $state('')
    let label = $state('')
    let imported = $state(false)

    async function run(action) {
        busy = true
        problem = ''
        try {
            await action()
        } catch (error) {
            console.log('unlock failed:', error?.code ?? error?.name, error?.message)
            if (error?.code === 'VAULT_NO_SLOT') askNew = true
            else problem = passkeyProblem(error)
        } finally {
            busy = false
        }
    }

    const create = () => run(() => createAddressBook({ label: label.trim() || 'deContact' }))
    const unlock = (any = false) => run(() => unlockWithPasskey({ any }))
    const restoreWords = () =>
        run(async () => {
            await unlockWithWords(wordsText)
            wordsText = ''
            notify('opened with the recovery words - add a passkey for this device in Settings')
        })
    const confirmNew = () =>
        run(async () => {
            askNew = false
            await createForPasskey()
        })
    function cancelNew() {
        askNew = false
        forgetPendingPasskey()
        problem = 'No address book was created. Open a device link, import a vault file or use your recovery words.'
    }

    async function importFile(event) {
        const file = event.currentTarget.files?.[0]
        if (!file) return
        const record = parseVaultRecord(await file.text())
        if (!record) {
            problem = 'This file holds no deContact vault.'
            return
        }
        handRecord(record)
        imported = true
        problem = ''
    }
</script>

<div class="gate" data-testid="passkey-gate">
    <h3>{onboarding ? 'Contact data have been shared with you' : 'Your deContact address book'}</h3>

    {#if $legacySeedRemoved}
        <div class="bx--inline-notification bx--inline-notification--info" role="status" data-testid="legacy-reset">
            <div class="bx--inline-notification__details">
                <p class="bx--inline-notification__subtitle">
                    deContact now opens your identity with a passkey. The seed phrase stored in this browser was removed;
                    its DID and address book are not carried over.
                </p>
            </div>
        </div>
    {/if}

    {#if !supported}
        <p class="problem" role="alert">This browser cannot use passkeys.</p>
    {:else if askNew}
        <div class="choice" role="dialog" aria-labelledby="ask-new" data-testid="ask-new">
            <h4 id="ask-new">This passkey opens no address book we could find</h4>
            <p>
                If you created your deContact address book with this passkey, continue: the same identity and address book
                come back from the network. Otherwise cancel, and open a device link, import a vault file or use your
                recovery words.
            </p>
            <button class="bx--btn bx--btn--primary" disabled={busy} onclick={confirmNew}>Continue with this passkey</button>
            <button class="bx--btn bx--btn--secondary" disabled={busy} onclick={cancelNew}>Cancel</button>
        </div>
    {:else}
        {#if onboarding}
            <p>Create a passkey to open your own address book, then the contact data arrive.</p>
        {/if}
        {#if handedOver || imported}
            <p data-testid="vault-handed-over">
                A vault from another device is at hand: open it with one of its passkeys or with the recovery words.
            </p>
        {/if}

        {#if kept}
            <button class="bx--btn bx--btn--primary" disabled={busy} onclick={() => unlock(false)}>Unlock with passkey</button>
            <button class="bx--btn bx--btn--tertiary" disabled={busy} onclick={() => unlock(true)}>Use another passkey</button>
        {:else}
            <div class="new">
                <label class="bx--label" for="passkey-label">Name of the new passkey (optional)</label>
                <input id="passkey-label" class="bx--text-input" placeholder="e.g. Laptop" bind:value={label} />
                <button class="bx--btn bx--btn--primary" disabled={busy} onclick={create}>Create a new address book</button>
            </div>
            <button class="bx--btn bx--btn--tertiary" disabled={busy} onclick={() => unlock(true)}>
                Sign in with an existing passkey
            </button>
        {/if}

        <button class="bx--btn bx--btn--ghost" disabled={busy} onclick={() => (showWords = !showWords)}>Restore with recovery words</button>
        {#if showWords}
            <div class="words">
                <label class="bx--label" for="recovery-words">Your 24 recovery words</label>
                <textarea id="recovery-words" class="bx--text-area" rows="4" autocomplete="off" spellcheck="false" bind:value={wordsText}></textarea>
                <button class="bx--btn bx--btn--primary" disabled={busy || !wordsText.trim()} onclick={restoreWords}>Open with recovery words</button>
            </div>
        {/if}

        <div class="file">
            <label class="bx--label" for="vault-file">Or import a vault file from another device</label>
            <input id="vault-file" type="file" accept="application/json,.json" onchange={importFile} />
        </div>
    {/if}

    {#if busy}<p role="status">Opening the vault…</p>{/if}
    {#if problem}<p class="problem" role="alert" data-testid="passkey-problem">{problem}</p>{/if}
</div>

<style>
    .gate {
        margin: 3rem;
        max-width: 40rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .new,
    .words,
    .file,
    .choice {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .problem {
        color: #fa4d56;
    }
</style>
