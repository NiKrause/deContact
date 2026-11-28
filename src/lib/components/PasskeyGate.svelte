<script>
    /**
     * @component The first screen while the vault is shut (#60): unlock with a passkey,
     * create a new address book, or restore one with a passkey, the recovery words, a
     * device link or a vault file. A passkey that opens nothing is never given a new
     * address book without asking.
     *
     * Its look (#110, Phase 4): the name, the icon and what deContact is come first, with why
     * it asks for a passkey; then one primary button (unlock, or create on a first start), and
     * the other ways below it, quieter. One column: a tile in the middle of a wide screen,
     * the screen's width on a phone (+layout.svelte puts the version line under it).
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
    import { FileUploaderButton } from 'carbon-components-svelte'
    import { asset } from '$app/paths'

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

    const create = () =>
        run(async () => {
            await createAddressBook({ label: label.trim() || 'deContact' })
            // a new address book has no card yet: My card, with why (#110)
            if (!onboarding) window.location.hash = '#/card'
        })
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

    /** Carbon's file button hands over the files it was given @param {CustomEvent<readonly File[]>} event */
    async function importFile(event) {
        const file = event.detail?.[0]
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
    <!-- what this is, before anything is asked (#110) -->
    <div class="brand">
        <img src={asset('favicon.svg')} alt="" width="56" height="56" />
        <div>
            <p class="name">deContact</p>
            <p class="tagline">{$_('gate.tagline')}</p>
        </div>
    </div>
    <h1 class="title">{onboarding ? $_('onboarding.shared') : $_('gate.title')}</h1>
    <p class="lead" data-testid="gate-lead">{$_('gate.lead')} {$_('gate.why')}</p>
    <!-- once a blocking dialog on the first visit; now a line here, every time (#110) -->
    <p class="experimental" data-testid="experimental-note">{$_('gate.experimental')}</p>

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
            <h2 id="ask-new" class="choice-title">{$_('gate.askNewTitle')}</h2>
            <p>{$_('gate.askNewText')}</p>
            <button class="bx--btn bx--btn--primary" disabled={busy} onclick={confirmNew}>{$_('gate.continueWithPasskey')}</button>
            <button class="bx--btn bx--btn--secondary" disabled={busy} onclick={cancelNew}>{$_('common.cancel')}</button>
        </div>
    {:else}
        {#if onboarding}
            <p>{$_('gate.onboardingHint')}</p>
        {/if}
        {#if handedOver || imported}
            <p class="handed-over" data-testid="vault-handed-over">{$_('gate.handedOver')}</p>
        {/if}

        <!-- the one primary action: unlock what this browser keeps, or a first address book -->
        {#if kept}
            <button class="bx--btn bx--btn--primary main" disabled={busy} onclick={() => unlock(false)}>{$_('gate.unlock')}</button>
        {:else}
            <div class="new">
                <label class="bx--label" for="passkey-label">{$_('gate.passkeyName')}</label>
                <input id="passkey-label" class="bx--text-input" placeholder={$_('gate.passkeyNamePlaceholder')} bind:value={label} />
                <button class="bx--btn bx--btn--primary main" disabled={busy} onclick={create}>{$_('gate.create')}</button>
            </div>
        {/if}

        <!-- the other ways, quieter: another passkey, the recovery words, a vault file -->
        <div class="other" role="group" aria-labelledby="other-ways">
            <p class="bx--label" id="other-ways">{$_('gate.otherWays')}</p>
            <button class="bx--btn bx--btn--ghost" disabled={busy} onclick={() => unlock(true)}>{$_(kept ? 'gate.anotherPasskey' : 'gate.signIn')}</button>
            <button class="bx--btn bx--btn--ghost" disabled={busy} aria-expanded={showWords} onclick={() => (showWords = !showWords)}>{$_('gate.restoreWords')}</button>
            {#if showWords}
                <div class="words">
                    <label class="bx--label" for="recovery-words">{$_('gate.wordsLabel')}</label>
                    <textarea id="recovery-words" class="bx--text-area" rows="4" autocomplete="off" spellcheck="false" bind:value={wordsText}></textarea>
                    <button class="bx--btn bx--btn--primary" disabled={busy || !wordsText.trim()} onclick={restoreWords}>{$_('gate.openWithWords')}</button>
                </div>
            {/if}
            <FileUploaderButton
                id="vault-file"
                kind="ghost"
                accept={['application/json', '.json']}
                labelText={$_('gate.chooseFile')}
                disableLabelChanges
                disabled={busy}
                on:change={importFile} />
        </div>
    {/if}

    {#if busy}<p role="status">{$_('gate.opening')}</p>{/if}
    {#if problem}<p class="problem" role="alert" data-testid="passkey-problem">{problem()}</p>{/if}

    <LanguageSwitch testid="gate-language" />
</div>

<style>
    /* one column: a tile in the middle of a wide screen (#110) */
    .gate {
        box-sizing: border-box;
        width: 100%;
        max-width: 30rem;
        margin: 0 auto;
        padding: 2rem;
        background: var(--cds-layer-01, #262626);
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    /* a phone: the screen's width, with the 16 px of the page around it, no tile */
    @media (max-width: 41.98rem) {
        .gate {
            max-width: none;
            padding: 0;
            background: none;
        }
    }
    .brand {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .brand img {
        flex: none;
        border-radius: 12px;
    }
    .name {
        font-size: 1.5rem;
        font-weight: 600;
        line-height: 1.2;
    }
    .tagline,
    .experimental {
        color: var(--cds-text-secondary, #c6c6c6);
        font-size: 0.875rem;
    }
    .title {
        font-size: 1.75rem;
        line-height: 1.25;
        margin-top: 0.5rem;
    }
    .choice-title {
        font-size: 1.25rem;
    }
    .lead {
        line-height: 1.5;
    }
    .new,
    .words,
    .choice,
    .other {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    /* the primary button spans the column; Carbon's own width stops at 20rem */
    .main,
    .choice .bx--btn {
        width: 100%;
        max-width: none;
    }
    .other {
        align-items: flex-start;
        margin-top: 0.5rem;
    }
    /* the quieter ways start where the text does: no padding of their own on the left */
    .other :global(.bx--btn--ghost) {
        padding-left: 0;
        padding-right: 0.5rem;
        min-height: 3rem;
    }
    .words {
        align-self: stretch;
    }
    .problem {
        color: var(--cds-text-error, #ff8389);
    }
    .gate :global(.bx--btn) {
        margin: 0;
    }
</style>
