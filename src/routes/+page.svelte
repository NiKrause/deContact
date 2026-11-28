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
    import ExchangeNotices from "#lib/components/ExchangeNotices.svelte";
    import MainNav from "#lib/components/MainNav.svelte";
    import MyCard from "#lib/components/MyCard.svelte";
    import AppInfo from "#lib/components/AppInfo.svelte";
    import { hash } from "./router.js";
    import {
        addingContact,
        editingCard,
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

    // a row picked in the list: its contact goes into the form. Again when Contacts comes
    // back: My card puts our own card into the same form meanwhile, and the contact stays open
    $effect(() => {
        if (place === "contacts" && $selectedRowIds.length > 0) loadContact($selectedRowIds[0])
    })
    // My card shows our own card, or before its first save the empty form for it; only when
    // the place turns to it, so the book changing under an open form leaves it alone
    $effect(() => {
        if (place === "card") untrack(showMyCard)
        // leaving My card closes its form; changes not saved are dropped
        else untrack(() => editingCard.set(false))
    })
    /** a contact picked from the list, or one being added by hand: the form instead of the list */
    const contactOpen = $derived($selectedRowIds.length > 0 || $addingContact);
    /** how many contacts the list shows: with none, the pane beside it has nothing to offer */
    let contactCount = $state(0);
    /** a contact we keep by hand is ours to edit; anybody else's card is theirs, read-only */
    const editable = $derived($addingContact || ($selectedAddr?.owner && $selectedAddr.owner === $orbitdb?.identity?.id));
</script>

<div class="shell">
    <MainNav {place} />
    <main class="content place" class:wide={place === "contacts"} data-testid="place-{place}">
        {#if place === "exchange"}
            <Exchange />
        {:else if place === "contacts"}
            <!-- a phone: the list, or a contact's page instead of it; the open Fold and a
                 desktop: the list on the left and the contact's page beside it (#110) -->
            <div class="contacts" class:open={contactOpen} data-testid="contacts">
                <div class="list-pane" data-testid="contacts-list-pane">
                    <div class="place-head">
                        <h2>{$_("nav.contacts")}</h2>
                        <Button kind="tertiary" size="sm" icon={UserFollow} on:click={newContact}>{$_("contacts.add")}</Button>
                    </div>
                    <ContactList bind:count={contactCount} />
                </div>
                <div class="contact-pane" data-testid="contacts-contact-pane">
                    {#if contactOpen}
                        <!-- back to the list, where it is not beside the page -->
                        <div class="back"><Button kind="ghost" size="sm" icon={ArrowLeft} on:click={closeContact}>{$_("contacts.back")}</Button></div>
                        {#if editable}<ContactForm />{:else}<ContactPage />{/if}
                    {:else if contactCount > 0}
                        <p class="choose" data-testid="contacts-choose">{$_("contacts.choose")}</p>
                    {/if}
                </div>
            </div>
        {:else if place === "card"}
            <div class="place-head"><h2>{$_("nav.card")}</h2></div>
            <MyCard />
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
        <!-- whoever scanned our code has our card, theirs arrived: on every place, at the top -->
        <ExchangeNotices />
        <!-- which build runs, under every place, flush with its column -->
        <AppInfo />
    </main>
</div>

<style>
    /* below Carbon's fixed header, 3rem tall */
    .shell {
        display: flex;
        align-items: flex-start;
        padding-top: 3rem;
    }
    /* a desktop: the place a column of 40rem (Contacts: its two panes) in the middle of the
       room beside the rail, at least 3rem from the rail and from the screen's edge */
    .shell {
        column-gap: 3rem;
        padding-right: 3rem;
    }
    .place {
        flex: 1 1 auto;
        min-width: 0;
        max-width: 40rem;
        margin: 1.5rem auto;
    }
    .place.wide {
        max-width: 62rem;
    }
    .place :global(.app-info) {
        margin: 2rem 0 1rem;
    }
    /* a phone: one pane at a time */
    @media (max-width: 52.49rem) {
        .contacts.open .list-pane,
        .contacts:not(.open) .contact-pane {
            display: none;
        }
    }
    .choose {
        color: var(--cds-text-secondary, #c6c6c6);
    }
    /* from the open Fold on (840 px, where Material's "expanded" width starts): the list on
       the left, kept in view while the page beside it scrolls (above the navigation at the
       bottom on the Fold); the contact's page beside it, as wide as it is elsewhere */
    @media (min-width: 52.5rem) {
        .contacts {
            display: flex;
            align-items: flex-start;
            gap: 1.5rem;
        }
        .list-pane {
            flex: 0 0 18rem;
            position: sticky;
            top: 4rem;
            max-height: calc(100dvh - 9.5rem - env(safe-area-inset-bottom));
            overflow-y: auto;
        }
        .contact-pane {
            flex: 1 1 auto;
            min-width: 0;
            max-width: 40rem;
            /* level with the list's heading */
            padding-top: 0.25rem;
        }
        .back {
            display: none;
        }
    }
    /* a desktop: the rail on the left instead of the navigation at the bottom */
    @media (min-width: 66rem) {
        .contacts {
            gap: 2rem;
        }
        .list-pane {
            flex-basis: 20rem;
            top: 4.5rem;
            max-height: calc(100dvh - 6rem);
        }
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
            padding-right: 0;
        }
        .place,
        .place.wide {
            margin: 1rem;
            max-width: none;
        }
        :global(body:has(.main-nav)) {
            padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));
        }
    }
    /* the open Fold: wide like a tablet, held like a phone (#110). The navigation stays at the
       bottom, under the thumbs; a place is a column in the middle, Contacts its two panes
       across the screen */
    @media (min-width: 52.5rem) and (max-width: 65.98rem) {
        .place {
            max-width: 40rem;
            margin: 1.5rem auto;
        }
        .place.wide {
            max-width: none;
            margin: 1.5rem;
        }
    }
</style>
