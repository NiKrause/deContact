<script>
    /**
     * @component My notes on a contact (#109), on their page: where we met, what we talked
     * about. Only we see them: they are a document of our own book, sealed to us, never part of
     * their card (about.js). Saved with "Save note"; a note that arrives from another of our
     * devices shows unless one is being typed here.
     */
    import { Button, TextArea } from "carbon-components-svelte";
    import { aboutContact } from "../../stores.js";
    import { saveNote } from "#lib/network/p2p-operations.js";
    import { MAX_NOTE_LENGTH, noteOf } from "#lib/card/about.js";
    import { _ } from "#lib/i18n/index.js";

    /** @type {{ did: string, name?: string }} */
    let { did, name = "" } = $props();

    const saved = $derived(noteOf($aboutContact.get(did)));
    let draft = $state("");
    let saving = $state(false);
    /** whose note the field holds, and the saved text it started from */
    let draftOf;
    let base = "";
    // another contact's page starts from their note; a newer note (another device) replaces
    // the field as long as nothing was typed into it
    $effect(() => {
        const current = saved;
        if (draftOf !== did || draft === base) {
            draft = current;
            base = current;
            draftOf = did;
        }
    });
    const changed = $derived(draft.trim() !== saved.trim());

    async function save() {
        saving = true;
        try {
            await saveNote(did, draft);
            draft = draft.trim();
            base = draft;
        } catch (error) {
            console.log("could not save the note:", error?.message);
        } finally {
            saving = false;
        }
    }
</script>

<section class="notes" data-testid="contact-notes">
    <TextArea
        labelText={$_("contacts.notes.label")}
        helperText={name ? $_("contacts.notes.hint", { name }) : $_("contacts.notes.hintNameless")}
        rows={3}
        maxCount={MAX_NOTE_LENGTH}
        bind:value={draft} />
    {#if changed}
        <div class="save">
            <Button size="sm" disabled={saving} on:click={save}>{$_("contacts.notes.save")}</Button>
        </div>
    {/if}
</section>

<style>
    .notes {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .save :global(.bx--btn) {
        margin: 0;
    }
</style>
