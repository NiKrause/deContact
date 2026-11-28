<script>
    /**
     * @component The passkeys and recovery words of the vault (#60): add and remove
     * passkeys, set up the recovery words, and hand the vault record to another device
     * (link, QR code, file). Every slot opens the same root, so every passkey writes as
     * the same DID.
     */
    import QrCodeImage from './QrCodeImage.svelte'
    import {
        addNewPasskey,
        draftRecoveryWords,
        keepRecoveryWords,
        removeVaultSlot,
        session,
        vaultRecordText
    } from '#lib/identity/session.js'
    import { passkeyProblem } from '#lib/identity/passkeys.js'
    import { notify } from '../../utils/utils.js'
    import { _, formatDate, t } from '#lib/i18n/index.js'
    import { appUrl } from '#lib/app-url.js'
    import { downloadVaultRecord } from '#lib/identity/vault-file.js'
    import RecoveryWordsDraft from './RecoveryWordsDraft.svelte'

    let busy = $state(false)
    /** what went wrong, read in the language on screen @type {(() => string) | undefined} */
    let problem = $state()
    let label = $state('')
    /** the slot whose removal waits for a second click */
    let removing = $state()
    /** new words on screen, not kept yet */
    let draft = $state()
    let link = $state('')

    const hasWords = $derived($session?.slots.some((slot) => slot.words) ?? false)
    /** the slot of the recovery words has a stored English label (vault.js WORDS_LABEL): shown in the language on screen */
    const labelOf = (slot) => (slot.words ? t('passkeys.recoveryWords') : slot.label)

    async function run(action) {
        busy = true
        problem = undefined
        try {
            await action()
        } catch (error) {
            console.log('vault change failed:', error?.code ?? error?.name, error?.message)
            problem = () => passkeyProblem(error)
        } finally {
            busy = false
        }
    }

    const add = () =>
        run(async () => {
            await addNewPasskey({ label: label.trim() || 'deContact' })
            label = ''
            notify(t('notify.passkeyAdded'))
        })

    const remove = (kid) =>
        run(async () => {
            removing = undefined
            await removeVaultSlot(kid)
            notify(t('notify.slotRemoved'))
        })

    function startWords() {
        draft = draftRecoveryWords()
    }
    const keepWords = () =>
        run(async () => {
            await keepRecoveryWords(draft)
            draft = undefined
            notify(t('notify.wordsKept'))
        })

    const base64url = (text) =>
        btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    function showLink() {
        // in the fragment: it never leaves the browser that opens the link
        link = `${appUrl()}#/link?vault=${base64url(vaultRecordText())}`
    }
</script>

<section class="passkeys" data-testid="passkey-settings">
    <h4>{$_('passkeys.title')}</h4>
    <p class="hint">{$_('passkeys.hint')}</p>

    <ul class="slots">
        {#each $session?.slots ?? [] as slot (slot.kid)}
            <li data-testid="vault-slot" data-kid={slot.kid}>
                <span>{slot.current ? $_('passkeys.openedNow', { label: labelOf(slot) }) : labelOf(slot)}</span>
                {#if slot.addedAt}<span class="when">{$_('passkeys.added', { date: formatDate(slot.addedAt) })}</span>{/if}
                {#if !slot.current}
                    {#if removing === slot.kid}
                        <button class="bx--btn bx--btn--danger bx--btn--sm" disabled={busy} onclick={() => remove(slot.kid)}>{$_('passkeys.reallyRemove', { label: labelOf(slot) })}</button>
                        <button class="bx--btn bx--btn--ghost bx--btn--sm" onclick={() => (removing = undefined)}>{$_('passkeys.keep')}</button>
                    {:else}
                        <button class="bx--btn bx--btn--ghost bx--btn--sm" disabled={busy} onclick={() => (removing = slot.kid)}>{$_('passkeys.remove', { label: labelOf(slot) })}</button>
                    {/if}
                {/if}
            </li>
        {/each}
    </ul>

    <div class="row">
        <label class="bx--label" for="new-passkey-label">{$_('passkeys.name')}</label>
        <input id="new-passkey-label" class="bx--text-input" placeholder={$_('passkeys.namePlaceholder')} bind:value={label} />
        <button class="bx--btn bx--btn--primary bx--btn--sm" disabled={busy} onclick={add}>{$_('passkeys.add')}</button>
    </div>

    {#if draft}
        <RecoveryWordsDraft words={draft} {busy} onkeep={keepWords} oncancel={() => (draft = undefined)} />
    {:else}
        <button class="bx--btn bx--btn--tertiary bx--btn--sm" disabled={busy} onclick={startWords}>
            {hasWords ? $_('passkeys.replaceWords') : $_('passkeys.setUpWords')}
        </button>
    {/if}

    <div class="row">
        <button class="bx--btn bx--btn--tertiary bx--btn--sm" disabled={busy} onclick={showLink}>{$_('passkeys.linkDevice')}</button>
        <button class="bx--btn bx--btn--ghost bx--btn--sm" disabled={busy} onclick={downloadVaultRecord}>{$_('passkeys.download')}</button>
    </div>
    {#if link}
        <p class="hint">{$_('passkeys.linkHint')}</p>
        <input class="bx--text-input" readonly value={link} aria-label={$_('passkeys.deviceLink')} data-testid="device-link" />
        {#if link.length < 2900}<QrCodeImage value={link} label={$_('passkeys.deviceLinkQr')} />{/if}
    {/if}

    {#if problem}<p class="problem" role="alert">{problem()}</p>{/if}
</section>

<style>
    .passkeys {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 40px;
    }
    .slots li {
        display: flex;
        gap: 1rem;
        align-items: center;
    }
    .when,
    .hint {
        opacity: 0.75;
    }
    .row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: 40rem;
    }
    .problem {
        color: var(--cds-text-error, #ff8389);
    }
</style>
