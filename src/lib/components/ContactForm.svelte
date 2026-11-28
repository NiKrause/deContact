<script>
    /**
     * @component The card form (#109): our own card under My card, and a contact added by hand
     * under Contacts. It shows what is filled in, plus a button to add more: the name, an
     * optional organisation, then each kind with entries (phones, emails, addresses, social
     * profiles), each entry with its label, and "Add …" for more. A kind without entries is
     * only its "Add …" button. Nothing is deleted before saving.
     *
     * The form edits `selectedAddr`, a copy with the entries of #109 (operations.js editable);
     * saving writes them, and the first email and address again for older app versions
     * (entries.js withEntries). A field over its length is marked, and a card over the limits
     * is not saved.
     */
    import { tick } from "svelte";
    import { selectedAddr, orbitdb } from "../../stores.js";
    import { addContact, deleteContact, updateContact } from "../../operations.js";
    import { Button, ConfirmModal, Select, SelectItem, TextInput } from "carbon-components-svelte";
    import Add from "carbon-icons-svelte/lib/Add.svelte";
    import Close from "carbon-icons-svelte/lib/Close.svelte";
    import ContactPhoto from "./ContactPhoto.svelte";
    import { ADDRESS_LABELS, EMAIL_LABELS, MAX_ENTRIES, MAX_LENGTH, NETWORKS, PHONE_LABELS, newEntry, profileLink } from "#lib/card/entries.js";
    import { photoFromFile } from "#lib/photo/photo.js";
    import { _ } from "#lib/i18n/index.js";

    /** our own card, or a new one: it may get a photo (#87), and the browser may fill in our own data */
    const ours = $derived($selectedAddr.owner === $orbitdb?.identity?.id || !$selectedAddr._id);
    /** our own card: the browser offers our own data; on a contact's card it would be wrong */
    const fill = (token) => ($selectedAddr.own ? token : "off");

    /** Delete waits for its confirmation (#110) */
    let confirmDelete = $state(false);
    /** somebody else's card: deleting it removes them (operations.js deleteContact) */
    const theirs = $derived(Boolean($selectedAddr.owner) && $selectedAddr.owner !== $orbitdb?.identity?.id);
    /** the name for the question; a placeholder's last name is their DID, which is no name */
    const nameOfCard = $derived($selectedAddr.lastName === $selectedAddr.owner ? "" : [$selectedAddr.firstName, $selectedAddr.lastName].filter(Boolean).join(" "));
    const deleteTitle = (tr) =>
        theirs
            ? nameOfCard ? tr("form.removeTitle", { name: nameOfCard }) : tr("form.removeTitleNameless")
            : nameOfCard ? tr("form.deleteTitle", { name: nameOfCard }) : tr("form.deleteTitleNameless");

    /** @type {HTMLInputElement | undefined} */
    let photoInput = $state();
    /** what went wrong with the photo: a key of the catalogue @type {string | undefined} */
    let photoProblem = $state();
    let readingPhoto = $state(false);

    /** the picked or taken image, made small and without its metadata (photo.js); saved with the card */
    async function choosePhoto(event) {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = ""; // the same file can be chosen again
        if (!file) return;
        photoProblem = undefined;
        readingPhoto = true;
        try {
            $selectedAddr = { ...$selectedAddr, photo: await photoFromFile(file) };
        } catch (error) {
            console.log("could not use the photo:", error?.message);
            photoProblem = "form.photoProblem";
        } finally {
            readingPhoto = false;
        }
    }

    function removePhoto() {
        // eslint-disable-next-line no-unused-vars
        const { photo, ...card } = $selectedAddr;
        $selectedAddr = card;
    }

    /** the kinds in the order of the form, each with its labels and its texts */
    const KINDS = [
        { kind: "phones", one: "phone", labels: PHONE_LABELS },
        { kind: "emails", one: "email", labels: EMAIL_LABELS },
        { kind: "addresses", one: "address", labels: ADDRESS_LABELS },
        { kind: "social", one: "profile", labels: NETWORKS }
    ];
    const entriesOfKind = (card, kind) => (Array.isArray(card[kind]) ? card[kind] : []);
    const withEntries = $derived(KINDS.filter(({ kind }) => entriesOfKind($selectedAddr, kind).length > 0));
    const withoutEntries = $derived(KINDS.filter(({ kind }) => entriesOfKind($selectedAddr, kind).length === 0));

    /** a new, empty entry at the end, with its default label; its first field gets the focus */
    async function add(kind) {
        const entries = entriesOfKind($selectedAddr, kind);
        if (entries.length >= MAX_ENTRIES) return;
        $selectedAddr = { ...$selectedAddr, [kind]: [...entries, newEntry(kind, entries.length)] };
        await tick();
        document.getElementById(`${kind}-${entries.length}`)?.focus();
    }
    function remove(kind, index) {
        $selectedAddr = { ...$selectedAddr, [kind]: entriesOfKind($selectedAddr, kind).filter((_, i) => i !== index) };
    }

    const tooLong = (value, max) => typeof value === "string" && value.trim().length > max;
    /** a label or a network in words */
    const labelText = (tr, label) => tr(`card.labels.${label}`);
    const networkText = (tr, network) => tr(`card.networks.${network}`);
    /** what a handle of the network looks like, as the field's placeholder */
    const HANDLES = ["mastodon", "bluesky", "website"];
    const handleHint = (tr, network) => tr(`form.handles.${HANDLES.includes(network) ? network : "other"}`);
    /** a handle that is no profile of its network: it shows as text, and the form says so */
    const notALink = (profile) => profile.network !== "other" && profile.handle.trim() !== "" && !profileLink(profile);
</script>

<form class="card-form" data-testid="card-form" onsubmit={(event) => event.preventDefault()}>
    <div class="photo">
        <ContactPhoto photo={$selectedAddr.photo} size={96} alt={$_("form.photo")} testid="form-photo" />
        {#if ours}
            <!-- no capture attribute: on a phone the system then offers the camera and the gallery -->
            <input bind:this={photoInput} type="file" accept="image/*" hidden onchange={choosePhoto} />
            <Button kind="tertiary" size="sm" disabled={readingPhoto} on:click={() => photoInput?.click()}>{$_("form.choosePhoto")}</Button>
            {#if $selectedAddr.photo}
                <Button kind="ghost" size="sm" on:click={removePhoto}>{$_("form.removePhoto")}</Button>
            {/if}
        {/if}
    </div>
    {#if photoProblem}<p class="problem" role="alert">{$_(photoProblem)}</p>{/if}

    <div class="pair">
        <TextInput data-cy="txtFirstname" size="xl" labelText={$_("form.firstName")} placeholder={$_("form.firstNamePlaceholder")} autocomplete={fill("given-name")}
                   invalid={tooLong($selectedAddr.firstName, MAX_LENGTH.firstName)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.firstName })}
                   bind:value={$selectedAddr.firstName} />
        <TextInput data-cy="txtLastname" size="xl" labelText={$_("form.lastName")} placeholder={$_("form.lastNamePlaceholder")} autocomplete={fill("family-name")}
                   invalid={tooLong($selectedAddr.lastName, MAX_LENGTH.lastName)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.lastName })}
                   bind:value={$selectedAddr.lastName} />
    </div>
    <TextInput size="xl" labelText={$_("form.organization")} autocomplete={fill("organization")}
               invalid={tooLong($selectedAddr.organization, MAX_LENGTH.organization)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.organization })}
               bind:value={$selectedAddr.organization} />

    {#each withEntries as { kind, one, labels } (kind)}
        <fieldset class="kind" data-testid="kind-{kind}">
            <legend class="bx--label">{$_(`form.kinds.${kind}`)}</legend>
            {#each $selectedAddr[kind] as entry, i (i)}
                <div class="entry" class:address={kind === "addresses"} data-testid="entry-{kind}">
                    {#if kind === "social"}
                        <Select size="xl" hideLabel labelText={$_("form.networkOf", { n: i + 1 })} bind:selected={$selectedAddr.social[i].network}>
                            {#each labels as network (network)}<SelectItem value={network} text={networkText($_, network)} />{/each}
                        </Select>
                    {:else}
                        <Select size="xl" hideLabel labelText={$_(`form.labelOf.${one}`, { n: i + 1 })} bind:selected={$selectedAddr[kind][i].label}>
                            {#each labels as label (label)}<SelectItem value={label} text={labelText($_, label)} />{/each}
                        </Select>
                    {/if}

                    {#if kind === "phones"}
                        <TextInput id="phones-{i}" size="xl" hideLabel labelText={$_("form.entryOf.phone", { n: i + 1 })} placeholder={$_("form.phonePlaceholder")}
                                   type="tel" inputmode="tel" autocomplete={fill("tel")}
                                   invalid={tooLong(entry.value, MAX_LENGTH.phone)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.phone })}
                                   bind:value={$selectedAddr.phones[i].value} />
                    {:else if kind === "emails"}
                        <TextInput id="emails-{i}" size="xl" hideLabel labelText={$_("form.entryOf.email", { n: i + 1 })} placeholder={$_("form.emailPlaceholder")}
                                   type="email" inputmode="email" autocomplete={fill("email")}
                                   invalid={tooLong(entry.value, MAX_LENGTH.email)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.email })}
                                   bind:value={$selectedAddr.emails[i].value} />
                    {:else if kind === "social"}
                        <TextInput id="social-{i}" size="xl" hideLabel labelText={$_("form.entryOf.profile", { n: i + 1 })} placeholder={handleHint($_, entry.network)}
                                   inputmode={entry.network === "website" ? "url" : undefined} autocapitalize="off" spellcheck="false"
                                   invalid={tooLong(entry.handle, MAX_LENGTH.handle)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.handle })}
                                   warn={notALink(entry)} warnText={$_("form.notALink", { network: networkText($_, entry.network) })}
                                   bind:value={$selectedAddr.social[i].handle} />
                    {/if}

                    <span class="remove">
                        <Button kind="ghost" icon={Close} iconDescription={$_(`form.removeEntry.${one}`, { n: i + 1 })} tooltipPosition="left" on:click={() => remove(kind, i)} />
                    </span>

                    {#if kind === "addresses"}
                        <div class="address-fields">
                            <TextInput id="addresses-{i}" data-cy="txtStreet" size="xl" labelText={$_("form.street")} placeholder={$_("form.streetPlaceholder")} autocomplete={fill("street-address")}
                                       invalid={tooLong(entry.street, MAX_LENGTH.street)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.street })}
                                       bind:value={$selectedAddr.addresses[i].street} />
                            <div class="pair">
                                <TextInput data-cy="txtZipCode" size="xl" labelText={$_("form.zipCode")} placeholder={$_("form.zipCodePlaceholder")} autocomplete={fill("postal-code")}
                                           invalid={tooLong(entry.postalCode, MAX_LENGTH.postalCode)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.postalCode })}
                                           bind:value={$selectedAddr.addresses[i].postalCode} />
                                <TextInput data-cy="txtCity" size="xl" labelText={$_("form.city")} placeholder={$_("form.cityPlaceholder")} autocomplete={fill("address-level2")}
                                           invalid={tooLong(entry.city, MAX_LENGTH.city)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.city })}
                                           bind:value={$selectedAddr.addresses[i].city} />
                            </div>
                            <TextInput data-cy="txtCountry" size="xl" labelText={$_("form.country")} placeholder={$_("form.countryPlaceholder")} autocomplete={fill("country-name")}
                                       invalid={tooLong(entry.countryRegion, MAX_LENGTH.countryRegion)} invalidText={$_("form.tooLong", { max: MAX_LENGTH.countryRegion })}
                                       bind:value={$selectedAddr.addresses[i].countryRegion} />
                        </div>
                    {/if}
                </div>
            {/each}
            {#if $selectedAddr[kind].length < MAX_ENTRIES}
                <div class="add"><Button kind="ghost" icon={Add} on:click={() => add(kind)}>{$_(`form.more.${one}`)}</Button></div>
            {/if}
        </fieldset>
    {/each}

    {#if withoutEntries.length}
        <div class="add more" data-testid="add-entries">
            {#each withoutEntries as { kind, one } (kind)}
                <Button kind="ghost" icon={Add} on:click={() => add(kind)}>{$_(`form.more.${one}`)}</Button>
            {/each}
        </div>
    {/if}

    <div class="buttons">
        {#if $selectedAddr._id}
            {#if $selectedAddr.owner === $orbitdb?.identity?.id}
                <Button data-cy="updateContact" on:click={() => updateContact()}>{$_("form.update")}</Button>
            {/if}
            <Button data-cy="deleteContact" kind="danger-tertiary" on:click={() => (confirmDelete = true)}>{$_("form.delete")}</Button>
        {:else}
            <Button data-cy="addContact" on:click={() => addContact()}>{$_("form.save")}</Button>
        {/if}
    </div>
</form>
<ConfirmModal
        bind:open={confirmDelete}
        title={deleteTitle($_)}
        confirmText={$_(theirs ? "form.remove" : "form.delete")}
        cancelText={$_("common.cancel")}
        confirm={deleteContact}>
    <p>{$_(theirs ? "form.removeText" : "form.deleteText")}</p>
</ConfirmModal>

<style>
    .card-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 40rem;
    }
    .photo {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 1rem;
    }
    .photo :global(.bx--btn),
    .card-form :global(.bx--btn) {
        margin: 0;
    }
    /* one column on a phone, two side by side from about 600 px (#109) */
    .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 1rem;
    }
    .kind {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        border: 0;
        min-width: 0;
    }
    /* the label, the field, the remove button; an address has its fields below */
    .entry {
        display: grid;
        grid-template-columns: minmax(6.5rem, 9rem) minmax(0, 1fr) auto;
        gap: 0.5rem;
        align-items: start;
    }
    .entry.address .remove {
        grid-column: 3;
    }
    .address-fields {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding-bottom: 0.5rem;
    }
    .add {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    .problem {
        color: var(--cds-text-error, #ff8389);
    }
</style>
