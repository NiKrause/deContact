<script>
    /**
     * @component The passkey, offered after the exchange (#97). While the identity is
     * temporary:
     * - as a banner, once a contact's card has arrived: "Keep this contact? Secure it with
     *   a passkey." "Not now" puts it away until another contact arrives or a few minutes
     *   pass (temporary.js offerSecuring); nothing is written meanwhile;
     * - in Settings (`inSettings`), always.
     * Right after securing, the banner offers the other ways back in, short and skippable:
     * recovery words (if the passkey is lost) and the vault file (if the network does not
     * have the vault record).
     */
    import { keepRecoveryWords, draftRecoveryWords, secureWithPasskey, securedNow, session } from '#lib/identity/session.js'
    import { passkeyProblem } from '#lib/identity/passkeys.js'
    import { downloadVaultRecord } from '#lib/identity/vault-file.js'
    import { contactCount, offerSecuring } from '#lib/identity/temporary.js'
    import { myAddressBook } from '../../stores.js'
    import { notify } from '../../utils/utils.js'
    import { _, t } from '#lib/i18n/index.js'
    import RecoveryWordsDraft from './RecoveryWordsDraft.svelte'

    /** inSettings: the offer in Settings, without "Not now"; the banner alone offers the other ways back in */
    let { inSettings = false } = $props()

    let busy = $state(false)
    /** what went wrong, read in the language on screen @type {(() => string) | undefined} */
    let problem = $state()
    /** "Not now": when, and how many contacts there were @type {{ at: number, contacts: number } | undefined} */
    let dismissed = $state()
    let now = $state(Date.now())
    /** new recovery words on screen, not kept yet */
    let draft = $state()
    let wordsKept = $state(false)
    let downloaded = $state(false)

    const temporary = $derived(Boolean($session?.temporary))
    const contacts = $derived(contactCount($myAddressBook, $session?.did))
    const offered = $derived(inSettings ? temporary : offerSecuring({ temporary, contacts, dismissed, now }))
    const safeguards = $derived(!inSettings && $securedNow)

    // the offer comes back by itself: look again now and then while it is put away
    $effect(() => {
        if (!dismissed) return
        const timer = setInterval(() => (now = Date.now()), 10_000)
        return () => clearInterval(timer)
    })

    async function run(action) {
        busy = true
        problem = undefined
        try {
            await action()
        } catch (error) {
            console.log('securing failed:', error?.code ?? error?.name, error?.message)
            problem = () => passkeyProblem(error)
        } finally {
            busy = false
        }
    }

    const secure = () =>
        run(async () => {
            await secureWithPasskey()
            notify(t('notify.secured'))
        })

    function notNow() {
        dismissed = { at: Date.now(), contacts }
        now = Date.now()
        problem = undefined
    }

    const keepWords = () =>
        run(async () => {
            await keepRecoveryWords(draft)
            draft = undefined
            wordsKept = true
            notify(t('notify.wordsKept'))
        })

    function download() {
        downloadVaultRecord()
        downloaded = true
    }
</script>

{#if offered}
    <section class="secure" class:banner={!inSettings} aria-labelledby="secure-title" data-testid={inSettings ? 'secure-settings' : 'secure-offer'}>
        {#if inSettings}
            <h4 id="secure-title">{$_('secure.settingsTitle')}</h4>
            <p class="hint">{$_('secure.settingsText')}</p>
        {:else}
            <h4 id="secure-title">{$_('secure.title', { count: contacts })}</h4>
            <p>{$_('secure.text')}</p>
        {/if}
        <div class="buttons">
            <button class="bx--btn bx--btn--primary bx--btn--sm" disabled={busy} onclick={secure}>{$_('secure.button')}</button>
            {#if !inSettings}
                <button class="bx--btn bx--btn--ghost bx--btn--sm" disabled={busy} onclick={notNow}>{$_('secure.notNow')}</button>
            {/if}
        </div>
        {#if busy}<p role="status">{$_('secure.busy')}</p>{/if}
        {#if problem}<p class="problem" role="alert" data-testid="secure-problem">{problem()}</p>{/if}
    </section>
{:else if safeguards}
    <section class="secure banner" aria-labelledby="secured-title" data-testid="secure-safeguards">
        <h4 id="secured-title">{$_('secure.securedTitle')}</h4>
        <p>{$_('secure.safeguards')}</p>
        {#if draft}
            <RecoveryWordsDraft words={draft} {busy} onkeep={keepWords} oncancel={() => (draft = undefined)} />
        {:else}
            <div class="buttons">
                {#if !wordsKept}
                    <button class="bx--btn bx--btn--tertiary bx--btn--sm" disabled={busy} onclick={() => (draft = draftRecoveryWords())}>{$_('secure.words')}</button>
                {/if}
                <button class="bx--btn bx--btn--tertiary bx--btn--sm" disabled={busy} onclick={download}>{$_('passkeys.download')}</button>
                <button class="bx--btn bx--btn--ghost bx--btn--sm" disabled={busy} onclick={() => securedNow.set(false)}>
                    {wordsKept || downloaded ? $_('secure.done') : $_('secure.skip')}
                </button>
            </div>
        {/if}
        {#if wordsKept}<p role="status">{$_('secure.wordsKept')}</p>{/if}
        {#if downloaded}<p role="status">{$_('secure.downloaded')}</p>{/if}
        {#if problem}<p class="problem" role="alert">{problem()}</p>{/if}
    </section>
{/if}

<style>
    .secure {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: 40rem;
    }
    .banner {
        margin: 1rem 3rem 0;
        padding: 1rem;
        border-left: 3px solid var(--cds-border-interactive, #4589ff);
        background: rgba(69, 137, 255, 0.1);
    }
    .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .hint {
        opacity: 0.75;
    }
    .problem {
        color: var(--cds-text-error, #ff8389);
    }
</style>
