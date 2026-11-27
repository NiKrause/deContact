<script>
    /*
     * Carbon's <Tab> hands its label to <Tabs> once, when it is made, and never again. The
     * dropdown that stands for the tabs on a phone reads the label from there, so after a
     * language switch it kept naming the tab in the old language. Placed inside <Tabs>, after
     * its <Tab>s, this gives Carbon's list of tabs the labels on screen, in the tabs' order.
     * It uses the "Tabs" context of carbon-components-svelte 0.82 (src/Tabs/Tabs.svelte);
     * tests/Language.spec.js checks the dropdown.
     */
    import { getContext } from "svelte";

    /** @type {string[]} the labels of the tabs, in their order */
    export let labels = [];

    const { tabs } = getContext("Tabs");

    $: tabs.update((list) =>
        list.map((tab, index) => (labels[index] === undefined || labels[index] === tab.label ? tab : { ...tab, label: labels[index] }))
    );
</script>
