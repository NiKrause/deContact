<script>
    /**
     * The app's four places (#110), each at its own address: Exchange (#/), Contacts
     * (#/contacts), My card (#/card) and Settings (#/settings), reached through MainNav.
     */
    import { Button, ToastNotification } from "carbon-components-svelte";
    import ArrowLeft from "carbon-icons-svelte/lib/ArrowLeft.svelte";
    import UserFollow from "carbon-icons-svelte/lib/UserFollow.svelte";
    import ContactForm from "#lib/components/ContactForm.svelte";
    import ContactList from "#lib/components/ContactList.svelte";
    import ContactPage from "#lib/components/ContactPage.svelte";
    import Settings from "#lib/components/Settings.svelte";
    import Exchange from "#lib/components/Exchange.svelte";
    import MainNav from "#lib/components/MainNav.svelte";
    import { hash } from "./router.js";
    import {
        addingContact,
        showNotification,
        notificationMessage,
        notificationKind,
        selectedRowIds,
        selectedAddr,
        orbitdb
    } from "../stores.js";
    import { closeContact, loadContact, newContact, showMyCard } from "../operations.js";
    import { untrack } from "svelte";
    import { _ } from "#lib/i18n/index.js";

    /** the place on screen, from the address */
    const PLACES = { "/contacts": "contacts", "/card": "card", "/settings": "settings" };
    const place = $derived(PLACES[$hash] ?? "exchange");

    // a row picked in the list: its contact goes into the form
    $effect(() => {
        if ($selectedRowIds.length > 0) loadContact($selectedRowIds[0])
    })
    // My card shows our own card, or before its first save the empty form for it; only when
    // the place turns to it, so the book changing under an open form leaves it alone
    $effect(() => {
        if (place === "card") untrack(showMyCard)
    })
    /** a contact picked from the list, or one being added by hand: the form instead of the list */
    const contactOpen = $derived($selectedRowIds.length > 0 || $addingContact);
    /** a contact we keep by hand is ours to edit; anybody else's card is theirs, read-only */
    const editable = $derived($addingContact || ($selectedAddr?.owner && $selectedAddr.owner === $orbitdb?.identity?.id));
</script>

<div class="shell">
    <MainNav {place} />
    <main class="content place" data-testid="place-{place}">
        {#if place === "exchange"}
            <Exchange />
        {:else if place === "contacts"}
            {#if contactOpen}
                <Button kind="ghost" size="sm" icon={ArrowLeft} on:click={closeContact}>{$_("contacts.back")}</Button>
                {#if editable}<ContactForm />{:else}<ContactPage />{/if}
            {:else}
                <div class="place-head">
                    <h2>{$_("nav.contacts")}</h2>
                    <Button kind="tertiary" size="sm" icon={UserFollow} on:click={newContact}>{$_("contacts.add")}</Button>
                </div>
                <ContactList />
            {/if}
        {:else if place === "card"}
            <div class="place-head"><h2>{$_("nav.card")}</h2></div>
            <ContactForm />
        {:else}
            <div class="place-head"><h2>{$_("nav.settings")}</h2></div>
            <Settings />
        {/if}
        {#if $showNotification}
            <ToastNotification class="toast"
                               kind={$notificationKind}
                               title={$_(`toast.${$notificationKind}`)}
                               subtitle={$notificationMessage}
                               closeButtonDescription={$_('toast.close')} />
        {/if}
    </main>
</div>

<style>
    /* below Carbon's fixed header, 3rem tall */
    .shell {
        display: flex;
        align-items: flex-start;
        padding-top: 3rem;
    }
    .place {
        flex: 1 1 auto;
        min-width: 0;
        max-width: 60rem;
        margin: 1.5rem 3rem;
    }
    .place-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem 1rem;
        margin-bottom: 1.5rem;
    }
    .place-head h2 {
        font-size: 1.75rem;
    }
    :global(.bx--btn, input) {
        margin-bottom: 1rem;
    }
    :global(.place-head .bx--btn) {
        margin-bottom: 0;
    }
    /* a phone and the open Fold: one column, a 16 px gutter, room for the navigation below */
    @media (max-width: 65.98rem) {
        .shell {
            display: block;
        }
        .place {
            margin: 1rem;
            max-width: none;
        }
        :global(body:has(.main-nav)) {
            padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));
        }
    }
</style>
