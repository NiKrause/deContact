<script>
    /**
     * @component Circles in Settings (#100): which fields of our card each circle sees, as a
     * matrix (fields as rows, circles as columns), the circles' names, and the circle a new code
     * is for. 3 to 6 circles. "Save circles" saves them in our book, sealed to us, for all our
     * devices, and writes our card again into every contact's book with what their circle shows.
     * The matrix scrolls inside its box on a narrow phone; the page does not.
     * Removing a circle that has members, or that new codes are for, first asks where they go:
     * a contact in a circle we no longer have gets the name only (circles.js fieldsOf).
     */
    import { Button, Select, SelectItem, TextInput } from "carbon-components-svelte";
    import Add from "carbon-icons-svelte/lib/Add.svelte";
    import Close from "carbon-icons-svelte/lib/Close.svelte";
    import { aboutContact, circles } from "../../stores.js";
    import { saveCircles } from "#lib/network/p2p-operations.js";
    import { CIRCLE_FIELDS, MAX_CIRCLES, MAX_CIRCLE_NAME, MIN_CIRCLES, circleName, circlesOf, fieldName, membersOf, movedMembers, newCircle } from "#lib/card/circles.js";
    import { _ } from "#lib/i18n/index.js";

    /** the circles being edited: a copy, saved with "Save circles" */
    let draft = $state(structuredClone($state.snapshot($circles)));
    let base = JSON.stringify($circles);
    // the circles changed on another device: shown, as long as nothing was changed here
    $effect(() => {
        const current = JSON.stringify($circles);
        if (current !== base && JSON.stringify(draft) === base) draft = JSON.parse(current);
        base = current;
    });
    /** compared as saved: circlesOf puts the fields in their order and trims the names */
    const changed = $derived(JSON.stringify(circlesOf($state.snapshot(draft))) !== JSON.stringify($circles));
    let saving = $state(false);
    /** where the members of the circles removed in this draft go: circle id -> circle id, '' for no circle */
    let moves = $state({});
    /** a circle about to be removed, while Settings asks where its members go */
    let removing = $state();

    function toggle(circle, field) {
        circle.fields = circle.fields.includes(field) ? circle.fields.filter((it) => it !== field) : CIRCLE_FIELDS.filter((it) => it === field || circle.fields.includes(it));
    }
    function add() {
        if (draft.circles.length < MAX_CIRCLES) draft.circles.push(newCircle(draft.circles, $_("circles.newCircle", { n: draft.circles.length + 1 })));
    }
    function remove(index) {
        if (draft.circles.length <= MIN_CIRCLES) return;
        const circle = draft.circles[index];
        // members moved into it earlier in this draft count too
        const count = membersOf($aboutContact, circle.id) + movedMembers($aboutContact, moves).filter((member) => member.circle === circle.id).length;
        const isDefault = draft.defaultCircle === circle.id;
        if (count === 0 && !isDefault) return removeNow(circle.id, "");
        // in doubt, less: the circle that shows the fewest fields is offered first
        const others = draft.circles.filter((it) => it.id !== circle.id);
        const target = [...others].sort((a, b) => a.fields.length - b.fields.length)[0]?.id ?? "";
        removing = { id: circle.id, name: circleName($_, circle), count, isDefault, target };
    }
    function removeNow(id, target) {
        const index = draft.circles.findIndex((it) => it.id === id);
        if (index === -1) return;
        draft.circles.splice(index, 1);
        moves[id] = target;
        if (draft.defaultCircle === id) draft.defaultCircle = target;
        removing = undefined;
    }
    async function save() {
        saving = true;
        try {
            await saveCircles($state.snapshot(draft), { moves: $state.snapshot(moves) });
            // as saved: the next change starts from there
            moves = {};
            draft = structuredClone($state.snapshot($circles));
            base = JSON.stringify($circles);
        } catch (error) {
            console.log("could not save the circles:", error?.message);
        } finally {
            saving = false;
        }
    }
</script>

<section class="circles" data-testid="circle-settings">
    <h3 class="section-title">{$_("circles.title")}</h3>
    <p class="hint">{$_("circles.hint")}</p>

    <ul class="names">
        {#each draft.circles as circle, i (circle.id)}
            <li>
                <TextInput size="xl" labelText={$_("circles.nameOf", { n: i + 1 })} placeholder={circleName($_, { id: circle.id })} maxlength={MAX_CIRCLE_NAME}
                           value={circle.name ?? ""} on:input={(event) => (circle.name = event.detail?.trim() || undefined)} />
                {#if draft.circles.length > MIN_CIRCLES}
                    <Button kind="ghost" icon={Close} iconDescription={$_("circles.remove", { name: circleName($_, circle) })} tooltipPosition="left" on:click={() => remove(i)} />
                {/if}
            </li>
        {/each}
    </ul>
    {#if removing}
        <div class="removing" data-testid="circle-removing">
            {#if removing.count > 0}<p>{$_("circles.removeMembers", { count: removing.count, name: removing.name })}</p>{/if}
            {#if removing.isDefault}<p>{$_("circles.removeDefault", { name: removing.name })}</p>{/if}
            <Select size="xl" labelText={$_("circles.moveTo")} bind:selected={removing.target}>
                {#each draft.circles.filter((it) => it.id !== removing.id) as circle (circle.id)}<SelectItem value={circle.id} text={circleName($_, circle)} />{/each}
                <SelectItem value="" text={$_("circles.wholeCard")} />
            </Select>
            <div class="actions">
                <Button kind="danger-tertiary" on:click={() => removeNow(removing.id, removing.target)}>{$_("circles.removeConfirm")}</Button>
                <Button kind="ghost" on:click={() => (removing = undefined)}>{$_("common.cancel")}</Button>
            </div>
        </div>
    {/if}
    {#if draft.circles.length < MAX_CIRCLES}
        <div><Button kind="ghost" icon={Add} on:click={add}>{$_("circles.add")}</Button></div>
    {/if}

    <div class="matrix" role="region" aria-label={$_("circles.matrix")} tabindex="0">
        <table>
            <caption class="bx--visually-hidden">{$_("circles.matrix")}</caption>
            <thead>
                <tr>
                    <th scope="col">{$_("circles.field")}</th>
                    {#each draft.circles as circle (circle.id)}<th scope="col">{circleName($_, circle)}</th>{/each}
                </tr>
            </thead>
            <tbody>
                <tr>
                    <th scope="row">{$_("circles.name")}</th>
                    {#each draft.circles as circle (circle.id)}
                        <td><input type="checkbox" checked disabled aria-label={$_("circles.shows", { circle: circleName($_, circle), field: $_("circles.name") })} /></td>
                    {/each}
                </tr>
                {#each CIRCLE_FIELDS as field (field)}
                    <tr>
                        <th scope="row">{fieldName($_, field)}</th>
                        {#each draft.circles as circle (circle.id)}
                            <td>
                                <input type="checkbox" checked={circle.fields.includes(field)} onchange={() => toggle(circle, field)}
                                       aria-label={$_("circles.shows", { circle: circleName($_, circle), field: fieldName($_, field) })} />
                            </td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>

    <Select size="xl" labelText={$_("circles.defaultCircle")} helperText={$_("circles.defaultCircleHelp")} bind:selected={draft.defaultCircle}>
        <SelectItem value="" text={$_("circles.wholeCard")} />
        {#each draft.circles as circle (circle.id)}<SelectItem value={circle.id} text={circleName($_, circle)} />{/each}
    </Select>

    {#if changed}
        <div><Button disabled={saving} on:click={save}>{$_("circles.save")}</Button></div>
    {/if}
</section>

<style>
    .circles {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 0;
    }
    .section-title {
        font-size: 1.25rem;
    }
    .hint {
        color: var(--cds-text-secondary, #c6c6c6);
    }
    .names {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .names li {
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;
    }
    .names li :global(.bx--form-item) {
        flex: 1;
    }
    .circles :global(.bx--btn) {
        margin: 0;
    }
    /* a narrow phone: the matrix scrolls inside its box, the page does not */
    .removing {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 32rem;
    }
    .removing .actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .matrix {
        max-width: 100%;
        overflow-x: auto;
        border: 1px solid var(--cds-border-subtle-01, #393939);
    }
    table {
        border-collapse: collapse;
        width: 100%;
    }
    th,
    td {
        padding: 0.5rem;
        border-bottom: 1px solid var(--cds-border-subtle-01, #393939);
        text-align: center;
        white-space: nowrap;
    }
    th[scope="row"],
    thead th:first-child {
        text-align: left;
        position: sticky;
        left: 0;
        background: var(--cds-layer-01, #262626);
    }
    thead th {
        font-weight: 600;
    }
    input[type="checkbox"] {
        width: 1.5rem;
        height: 1.5rem;
        accent-color: var(--cds-interactive, #4589ff);
    }
</style>
