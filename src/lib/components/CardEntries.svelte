<script>
    /**
     * @component The entries of a card (#109), read-only: phones, emails, addresses and social
     * profiles, each with its label, in the card's order (lib/card/entries.js). On a contact's
     * card (`reach`) a phone number calls, an email writes and an address can be copied. A
     * profile is a link only where the app built it from a handle of a known network; anything
     * else is text.
     */
    import { Button } from "carbon-components-svelte";
    import Copy from "carbon-icons-svelte/lib/Copy.svelte";
    import Email from "carbon-icons-svelte/lib/Email.svelte";
    import Link from "carbon-icons-svelte/lib/Link.svelte";
    import Location from "carbon-icons-svelte/lib/Location.svelte";
    import Phone from "carbon-icons-svelte/lib/Phone.svelte";
    import { addressLines, emailLink, entriesOf, phoneLink, profileLink } from "#lib/card/entries.js";
    import { notify } from "../../utils/utils.js";
    import { _, t } from "#lib/i18n/index.js";

    /** @type {{ card: any, reach?: boolean, testid?: string }} */
    let { card, reach = false, testid } = $props();

    const entries = $derived(entriesOf(card));
    /** "Phone · Mobile"; Other is no label worth showing */
    const labelled = (tr, kind, label) =>
        label === "other" ? tr(`card.kinds.${kind}`) : tr("card.entryLabel", { kind: tr(`card.kinds.${kind}`), label: tr(`card.labels.${label}`) });
    const rows = $derived([
        ...entries.phones.map((it) => ({ kind: "phone", icon: Phone, label: labelled($_, "phone", it.label), lines: [it.value], href: reach ? phoneLink(it.value) : undefined })),
        ...entries.emails.map((it) => ({ kind: "email", icon: Email, label: labelled($_, "email", it.label), lines: [it.value], href: reach ? emailLink(it.value) : undefined })),
        ...entries.addresses.map((it) => ({ kind: "address", icon: Location, label: labelled($_, "address", it.label), lines: addressLines(it), copy: reach })),
        ...entries.social.map((it) => ({
            kind: "social",
            icon: Link,
            label: it.network === "other" ? $_("card.kinds.social") : $_(`card.networks.${it.network}`),
            lines: [it.handle],
            href: profileLink(it),
            external: true
        }))
    ]);

    async function copy(lines) {
        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            notify(t("notify.cardAddressCopied"));
        } catch (error) {
            console.log("could not copy the address:", error?.message);
        }
    }
</script>

<ul class="entries" data-testid={testid}>
    {#each rows as row, i (i)}
        <li class="entry" data-testid="card-entry" data-kind={row.kind}>
            <row.icon size={20} aria-hidden="true" class="icon" />
            <span class="text">
                <span class="label">{row.label}</span>
                {#if row.href}
                    <a href={row.href} target={row.external ? "_blank" : undefined} rel={row.external ? "noopener noreferrer nofollow" : undefined}>{row.lines[0]}</a>
                {:else}
                    {#each row.lines as line, j (j)}<span class="line">{line}</span>{/each}
                {/if}
            </span>
            {#if row.copy}
                <Button kind="ghost" icon={Copy} iconDescription={$_("card.copyAddress")} tooltipPosition="left" on:click={() => copy(row.lines)} />
            {/if}
        </li>
    {/each}
</ul>

<style>
    .entries {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        list-style: none;
        border-top: 1px solid var(--cds-border-subtle-01, #393939);
    }
    .entries:empty {
        border: 0;
    }
    .entry {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 3.5rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--cds-border-subtle-01, #393939);
    }
    .entry :global(.icon) {
        flex: none;
        color: var(--cds-icon-secondary, #c6c6c6);
    }
    .text {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .label {
        font-size: 0.75rem;
        color: var(--cds-text-secondary, #c6c6c6);
    }
    .line {
        display: block;
    }
    /* a link is a touch target of its own: the whole line */
    a {
        display: block;
        padding: 0.25rem 0;
        color: var(--cds-link-primary, #78a9ff);
    }
    .entry :global(.bx--btn) {
        flex: none;
        margin: 0;
    }
</style>
