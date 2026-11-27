<script>
    /**
     * @component The four places of the app (#110): Exchange · Contacts · My card · Settings.
     * At the bottom of the screen, under the thumb, on a phone and on the open Fold; a rail
     * on the left on a desktop. Links to the places' addresses (#/, #/contacts, #/card,
     * #/settings), so the browser's back button and a reload keep the place.
     */
    import Renew from "carbon-icons-svelte/lib/Renew.svelte";
    import UserMultiple from "carbon-icons-svelte/lib/UserMultiple.svelte";
    import UserProfile from "carbon-icons-svelte/lib/UserProfile.svelte";
    import SettingsIcon from "carbon-icons-svelte/lib/Settings.svelte";
    import { _ } from "#lib/i18n/index.js";

    /** @type {{ place: string }} the place on screen */
    let { place } = $props();

    const items = [
        { place: "exchange", href: "#/", label: "nav.exchange", icon: Renew },
        { place: "contacts", href: "#/contacts", label: "nav.contacts", icon: UserMultiple },
        { place: "card", href: "#/card", label: "nav.card", icon: UserProfile },
        { place: "settings", href: "#/settings", label: "nav.settings", icon: SettingsIcon }
    ];
</script>

<nav class="main-nav" aria-label={$_("nav.label")} data-testid="main-nav">
    <ul>
        {#each items as item (item.place)}
            <li>
                <a href={item.href} aria-current={place === item.place ? "page" : undefined} class:current={place === item.place}>
                    <item.icon size={24} aria-hidden="true" />
                    <span>{$_(item.label)}</span>
                </a>
            </li>
        {/each}
    </ul>
</nav>

<style>
    .main-nav ul {
        display: flex;
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .main-nav li {
        flex: 1 1 0;
    }
    .main-nav a {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        min-height: 3.5rem;
        padding: 0.25rem;
        color: var(--cds-text-secondary, #c6c6c6);
        font-size: 0.75rem;
        text-decoration: none;
        border-top: 3px solid transparent;
    }
    .main-nav a.current {
        color: var(--cds-text-primary, #f4f4f4);
        border-top-color: var(--cds-interactive-04, #4589ff);
    }
    .main-nav a:focus-visible {
        outline: 2px solid var(--cds-focus, #ffffff);
        outline-offset: -2px;
    }
    /* a phone and the open Fold: at the bottom, under the thumb */
    @media (max-width: 65.98rem) {
        .main-nav {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 6000;
            background: var(--cds-ui-background, #262626);
            border-top: 1px solid var(--cds-ui-03, #525252);
            padding-bottom: env(safe-area-inset-bottom);
        }
    }
    /* a desktop: a rail on the left, with the labels beside the icons */
    @media (min-width: 66rem) {
        .main-nav {
            position: sticky;
            top: 3rem;
            align-self: flex-start;
            width: 12.5rem;
            flex: none;
        }
        .main-nav ul {
            flex-direction: column;
            gap: 0.25rem;
            padding: 1rem 0;
        }
        .main-nav a {
            flex-direction: row;
            justify-content: flex-start;
            gap: 0.75rem;
            min-height: 3rem;
            padding: 0 1rem;
            font-size: 0.875rem;
            border-top: 0;
            border-left: 3px solid transparent;
        }
        .main-nav a.current {
            border-left-color: var(--cds-interactive-04, #4589ff);
            background: var(--cds-ui-01, #393939);
        }
    }
</style>
