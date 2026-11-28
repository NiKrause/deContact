<script>
    /**
     * @component A contact's circle (#100), on their page: which fields of our card they get.
     * "No circle" is the whole card, as before circles. A change saves at once and writes our
     * card into their book again with what the circle shows. Moving them to a circle that shows
     * less says that what they already received stays with them. A circle we no longer have
     * shows as such: they get the name only until given another (circles.js fieldsOf).
     */
    import { InlineNotification, Select, SelectItem } from "carbon-components-svelte";
    import { aboutContact, circles } from "../../stores.js";
    import { setCircle } from "#lib/network/p2p-operations.js";
    import { circleName, fieldsOf, hasCircle, showsLess } from "#lib/card/circles.js";
    import { _ } from "#lib/i18n/index.js";

    /** @type {{ did: string, name?: string }} */
    let { did, name = "" } = $props();

    const NONE = "";
    const current = $derived($aboutContact.get(did)?.circle ?? NONE);
    const gone = $derived(current !== NONE && !hasCircle($circles, current));
    let narrowed = $state(false);
    let saving = $state(false);

    async function change(event) {
        const next = event.currentTarget.value;
        if (next === current) return;
        narrowed = showsLess(fieldsOf($circles, current || undefined), fieldsOf($circles, next || undefined));
        saving = true;
        try {
            await setCircle(did, next || undefined);
        } catch (error) {
            console.log("could not change the circle:", error?.message);
        } finally {
            saving = false;
        }
    }
</script>

<section class="circle" data-testid="contact-circle">
    <Select size="xl" labelText={$_("circles.circleOf")} selected={current} disabled={saving} on:change={change}>
        <SelectItem value={NONE} text={$_("circles.wholeCard")} />
        {#each $circles.circles as circle (circle.id)}<SelectItem value={circle.id} text={circleName($_, circle)} />{/each}
        {#if gone}<SelectItem value={current} text={$_("circles.gone")} />{/if}
    </Select>
    {#if narrowed}
        <InlineNotification kind="info" lowContrast hideCloseButton
                            subtitle={name ? $_("circles.narrower", { name }) : $_("circles.narrowerNameless")} />
    {/if}
</section>
