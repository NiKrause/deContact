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
    import { _, t } from '#lib/i18n/index.js'
    import LanguageSwitch from './LanguageSwitch.svelte'

    /** onboarding: somebody opened an invitation link; handedOver: a device link brought a vault record */
    let { onboarding = false, handedOver = false } = $props()

    const supported = passkeysSupported()
    const kept = vaultKeptHere()
    let busy = $state(false)
    /** what went wrong, read in the language on screen @type {(() => string) | undefined} */
    let problem = $state()
    /** a passkey opened nothing here or on the network: ask before making an address book */
    let askNew = $state(false)
    let showWords = $state(false)
    let wordsText = $state('')
    let label = $state('')
    let imported = $state(false)

    async function run(action) {
        busy = true
        problem = undefined
        try {
            await action()
        } catch (error) {
            console.log('unlock failed:', error?.code ?? error?.name, error?.message)
            if (error?.code === 'VAULT_NO_SLOT') askNew = true
            else problem = () => passkeyProblem(error)
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
            notify(t('notify.openedWithWords'))
        })
    const confirmNew = () =>
        run(async () => {
            askNew = false
            await createForPasskey()
        })
    function cancelNew() {
        askNew = false
        forgetPendingPasskey()
        problem = () => t('gate.noneCreated')
    }

    async function importFile(event) {
        const file = event.currentTarget.files?.[0]
        if (!file) return
        const record = parseVaultRecord(await file.text())
        if (!record) {
            problem = () => t('gate.noVault')
            return
        }
        handRecord(record)
        imported = true
        problem = undefined
    }
</script>

<div class="gate" data-testid="passkey-gate">
    <h3>{onboarding ? $_('onboarding.shared') : $_('gate.title')}</h3>

    {#if $legacySeedRemoved}
        <div class="bx--inline-notification bx--inline-notification--info" role="status" data-testid="legacy-reset">
            <div class="bx--inline-notification__details">
                <p class="bx--inline-notification__subtitle">{$_('gate.legacySeedRemoved')}</p>
            </div>
        </div>
    {/if}

    {#if !supported}
        <p class="problem" role="alert">{$_('gate.unsupported')}</p>
    {:else if askNew}
        <div class="choice" role="dialog" aria-labelledby="ask-new" data-testid="ask-new">
            <h4 id="ask-new">{$_('gate.askNewTitle')}</h4>
            <p>{$_('gate.askNewText')}</p>
            <button class="bx--btn bx--btn--primary" disabled={busy} onclick={confirmNew}>{$_('gate.continueWithPasskey')}</button>
            <button class="bx--btn bx--btn--secondary" disabled={busy} onclick={cancelNew}>{$_('common.cancel')}</button>
        </div>
    {:else}
        {#if onboarding}
            <p>{$_('gate.onboardingHint')}</p>
        {/if}
        {#if handedOver || imported}
            <p data-testid="vault-handed-over">{$_('gate.handedOver')}</p>
        {/if}

        {#if kept}
            <button class="bx--btn bx--btn--primary" disabled={busy} onclick={() => unlock(false)}>{$_('gate.unlock')}</button>
            <button class="bx--btn bx--btn--tertiary" disabled={busy} onclick={() => unlock(true)}>{$_('gate.anotherPasskey')}</button>
        {:else}
            <div class="new">
                <label class="bx--label" for="passkey-label">{$_('gate.passkeyName')}</label>
                <input id="passkey-label" class="bx--text-input" placeholder={$_('gate.passkeyNamePlaceholder')} bind:value={label} />
                <button class="bx--btn bx--btn--primary" disabled={busy} onclick={create}>{$_('gate.create')}</button>
            </div>
            <button class="bx--btn bx--btn--tertiary" disabled={busy} onclick={() => unlock(true)}>{$_('gate.signIn')}</button>
        {/if}

        <button class="bx--btn bx--btn--ghost" disabled={busy} onclick={() => (showWords = !showWords)}>{$_('gate.restoreWords')}</button>
        {#if showWords}
            <div class="words">
                <label class="bx--label" for="recovery-words">{$_('gate.wordsLabel')}</label>
                <textarea id="recovery-words" class="bx--text-area" rows="4" autocomplete="off" spellcheck="false" bind:value={wordsText}></textarea>
                <button class="bx--btn bx--btn--primary" disabled={busy || !wordsText.trim()} onclick={restoreWords}>{$_('gate.openWithWords')}</button>
            </div>
        {/if}

        <div class="file">
            <label class="bx--label" for="vault-file">{$_('gate.importFile')}</label>
            <input id="vault-file" type="file" accept="application/json,.json" onchange={importFile} />
        </div>
    {/if}

    {#if busy}<p role="status">{$_('gate.opening')}</p>{/if}
    {#if problem}<p class="problem" role="alert" data-testid="passkey-problem">{problem()}</p>{/if}

    <LanguageSwitch testid="gate-language" />
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
