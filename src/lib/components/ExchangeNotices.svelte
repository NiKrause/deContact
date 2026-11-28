<script>
    /**
     * @component What became of the code we showed (link-outcomes.js), said at the top of the
     * screen, where the person looks once the QR dialog closed by itself:
     * - "Bob Stromwerk has your business card" once their app took the code (until the name
     *   is known: "Your business card was received"); it goes after GIVEN_MS;
     * - for a two-way code, a second one, "Bob Stromwerk's business card is in your contacts",
     *   once theirs arrived, with a link to it. It stays until it is closed or followed: a
     *   notice with something to do has no timer (WCAG 2.2.1).
     * A phone with a vibration motor gives a short buzz. A screen reader hears them through
     * the live region they are in. No more than MAX at a time, the newest on top.
     */
    import { onMount } from "svelte";
    import { ToastNotification } from "carbon-components-svelte";
    import { onLinkOutcome } from "#lib/network/p2p-operations.js";
    import { selectedRowIds } from "../../stores.js";
    import { _ } from "#lib/i18n/index.js";

    const GIVEN_MS = 8000;
    const MAX = 3;
    /** what each event feels like in the hand: one buzz when the code worked, two when theirs arrived */
    const VIBRATION = { given: 200, complete: [100, 80, 100] };

    /** @type {Array<{ key: number, kind: 'given' | 'complete', token: string, name?: string, id?: string }>} */
    let notices = $state([]);
    let next = 0;

    onMount(() => onLinkOutcome((event) => {
        if (event.kind !== "given" && event.kind !== "complete") return;
        notices = [{ key: ++next, kind: event.kind, token: event.token, name: event.name, id: event.id }, ...notices].slice(0, MAX);
        vibrate(VIBRATION[event.kind]);
    }));

    /** where the device can (a phone's browser, mostly) and is allowed to */
    function vibrate(pattern) {
        try {
            navigator.vibrate?.(pattern);
        } catch {
            // no vibration here: the notice says it
        }
    }

    const remove = (key) => (notices = notices.filter((notice) => notice.key !== key));

    /** the link: their card, on Contacts */
    function open(notice) {
        if (notice.id) selectedRowIds.set([notice.id]);
        remove(notice.key);
    }

    /** @param {{ kind: string, name?: string }} notice */
    const title = (tr, notice) =>
        notice.kind === "given"
            ? (notice.name ? tr("exchangeDone.given", { name: notice.name }) : tr("exchangeDone.givenNameless"))
            : (notice.name ? tr("exchangeDone.complete", { name: notice.name }) : tr("exchangeDone.completeNameless"));
</script>

<!-- the live region is there before anything is said in it; each notice in it is no region of its own -->
<div class="exchange-notices" role="status" data-testid="exchange-notices">
    {#each notices as notice (notice.key)}
        <ToastNotification
            role="none"
            kind="success"
            timeout={notice.kind === "given" ? GIVEN_MS : 0}
            pauseOnHover
            title={title($_, notice)}
            closeButtonDescription={$_("toast.close")}
            data-testid="exchange-notice-{notice.kind}"
            on:close={() => remove(notice.key)}>
            {#if notice.kind === "complete" && notice.id}
                <a class="open" href="#/contacts" data-testid="exchange-notice-open" onclick={() => open(notice)}>{$_("exchangeDone.open")}</a>
            {/if}
        </ToastNotification>
    {/each}
</div>

<style>
    /* below the header, at the right; under a dialog, which a notice must not cover */
    .exchange-notices {
        position: fixed;
        top: 3.5rem;
        right: 1rem;
        z-index: 7000;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: calc(100% - 2rem);
    }
    .exchange-notices :global(.bx--toast-notification) {
        margin: 0;
    }
    .open {
        display: inline-block;
        margin-bottom: 1rem;
    }
    /* a phone: across the screen, 16 px in from its edges */
    @media (max-width: 41.98rem) {
        .exchange-notices {
            left: 1rem;
        }
        .exchange-notices :global(.bx--toast-notification) {
            width: 100%;
            max-width: none;
        }
    }
</style>
