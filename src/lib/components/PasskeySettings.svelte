<script>
    /**
     * @component The passkeys and recovery words of the vault (#60): add and remove
     * passkeys, set up the recovery words, and hand the vault record to another device
     * (link, QR code, file). Every slot opens the same root, so every passkey writes as
     * the same DID.
     */
    import QrCode from 'svelte-qrcode'
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

    let busy = $state(false)
    let problem = $state('')
    let label = $state('')
    /** the slot whose removal waits for a second click */
    let removing = $state()
    /** new words on screen, not kept yet */
    let draft = $state()
    let wroteDown = $state(false)
    let link = $state('')

    const hasWords = $derived($session?.slots.some((slot) => slot.words) ?? false)

    async function run(action) {
        busy = true
        problem = ''
        try {
            await action()
        } catch (error) {
            console.log('vault change failed:', error?.code ?? error?.name, error?.message)
            problem = passkeyProblem(error)
        } finally {
            busy = false
        }
    }

    const add = () =>
        run(async () => {
            await addNewPasskey({ label: label.trim() || 'deContact' })
            label = ''
            notify('added a passkey: it opens the same address book')
        })

    const remove = (kid) =>
        run(async () => {
            removing = undefined
            await removeVaultSlot(kid)
            notify('removed from the vault')
        })

    function startWords() {
        draft = draftRecoveryWords()
        wroteDown = false
    }
    const keepWords = () =>
        run(async () => {
            await keepRecoveryWords(draft)
            draft = undefined
            notify('the recovery words now open the vault')
        })

    const base64url = (text) =>
        btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    function showLink() {
        const page = `${location.origin}${location.pathname}`
        // in the fragment: it never leaves the browser that opens the link
        link = `${page}#/link?vault=${base64url(vaultRecordText())}`
    }

    function download() {
        const blob = new Blob([vaultRecordText()], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'decontact-vault.json'
        a.click()
        URL.revokeObjectURL(a.href)
    }
</script>

<section class="passkeys" data-testid="passkey-settings">
    <h4>Passkeys and recovery words</h4>
    <p class="hint">Each of them opens the same vault, and with it the same identity and address book.</p>

    <ul class="slots">
        {#each $session?.slots ?? [] as slot (slot.kid)}
            <li data-testid="vault-slot" data-kid={slot.kid}>
                <span>{slot.label}{slot.current ? ' (opened this session)' : ''}</span>
                {#if slot.addedAt}<span class="when">added {new Date(slot.addedAt).toLocaleDateString()}</span>{/if}
                {#if !slot.current}
                    {#if removing === slot.kid}
                        <button class="bx--btn bx--btn--danger bx--btn--sm" disabled={busy} onclick={() => remove(slot.kid)}>Really remove {slot.label}</button>
                        <button class="bx--btn bx--btn--ghost bx--btn--sm" onclick={() => (removing = undefined)}>Keep</button>
                    {:else}
                        <button class="bx--btn bx--btn--ghost bx--btn--sm" disabled={busy} onclick={() => (removing = slot.kid)}>Remove {slot.label}</button>
                    {/if}
                {/if}
            </li>
        {/each}
    </ul>

    <div class="row">
        <label class="bx--label" for="new-passkey-label">Name of the new passkey (optional)</label>
        <input id="new-passkey-label" class="bx--text-input" placeholder="e.g. Security key" bind:value={label} />
        <button class="bx--btn bx--btn--primary bx--btn--sm" disabled={busy} onclick={add}>Add a passkey</button>
    </div>

    {#if draft}
        <div class="words" data-testid="recovery-words">
            <p>Write these 24 words down, in this order, and keep them safe. They are shown only now and are not stored anywhere.</p>
            <ol>
                {#each draft as word, i (i)}<li>{word}</li>{/each}
            </ol>
            <label><input type="checkbox" bind:checked={wroteDown} /> I have written the words down</label>
            <button class="bx--btn bx--btn--primary bx--btn--sm" disabled={busy || !wroteDown} onclick={keepWords}>Keep these recovery words</button>
            <button class="bx--btn bx--btn--ghost bx--btn--sm" onclick={() => (draft = undefined)}>Cancel</button>
        </div>
    {:else}
        <button class="bx--btn bx--btn--tertiary bx--btn--sm" disabled={busy} onclick={startWords}>
            {hasWords ? 'Replace the recovery words' : 'Set up recovery words'}
        </button>
    {/if}

    <div class="row">
        <button class="bx--btn bx--btn--tertiary bx--btn--sm" disabled={busy} onclick={showLink}>Link another device</button>
        <button class="bx--btn bx--btn--ghost bx--btn--sm" disabled={busy} onclick={download}>Download vault file</button>
    </div>
    {#if link}
        <p class="hint">
            Open this link on the other device, then unlock there with one of the passkeys or the recovery words. The vault
            record holds no secret.
        </p>
        <input class="bx--text-input" readonly value={link} aria-label="Device link" data-testid="device-link" />
        {#if link.length < 2900}<QrCode value={link} />{/if}
    {/if}

    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
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
    .row,
    .words {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: 40rem;
    }
    .words ol {
        columns: 3;
        padding-left: 1.5rem;
        list-style: decimal;
    }
    .problem {
        color: #fa4d56;
    }
</style>
