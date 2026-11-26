<script>
    import {createEventDispatcher, onMount} from "svelte";
    import { Column, Modal, Toggle, Grid, Row, Checkbox } from 'carbon-components-svelte';
    import QrCode from "svelte-qrcode"
    const dispatch = createEventDispatcher();
    import { orbitdb } from "../../stores.js";
    import { notify } from "../../utils/utils.js";
    import { issueOnboardingToken } from "#lib/network/p2p-operations.js";

    const page_url = import.meta.env.VITE_PAGE_URL?import.meta.env.VITE_PAGE_URL+'/#':'https://deContact.xyz/#';

    export let qrCodeData
    export let qrCodeOpen

    let onBoardingToken
    let requestAddress = true
    let fullDeContactUrl = true

    // a new one-time token each time the dialog opens or the checkbox changes (it is signed in)
    let issuing = 0
    $: if (qrCodeOpen && $orbitdb) issueToken(requestAddress)
    function issueToken(requestAddress) {
        const issue = ++issuing
        onBoardingToken = undefined
        issueOnboardingToken({ requestAddress })
            .then((token) => { if (issue === issuing) onBoardingToken = token })
            .catch((error) => console.log("could not create an invitation link:", error?.message))
    }
    $: linkUrl = (fullDeContactUrl && onBoardingToken)?`${page_url}/onboarding/${qrCodeData}?onBoardingToken=${onBoardingToken}`:qrCodeData
</script>

    <Modal bind:open={ qrCodeOpen }
       modalHeading="Scan (DID) - Decentralized Identity"
       primaryButtonText="OK"
       secondaryButtonText=""
       on:click:button--primary={ () => dispatch('close') }
       on:click:button--secondary={ () => dispatch('close') }
       on:close={()=>dispatch('close')}>
    <Grid>
        <Row>
            <Column>
                <Toggle
                    labelText="Scan DID or URL?"
                    labelA="DID only"
                    labelB="URL"
                    bind:toggled={fullDeContactUrl}/>
            </Column>
            <Column>
                <Checkbox labelText="Request address from peer"  bind:checked={requestAddress} />
            </Column>
        </Row>
        <Row>
            <Column>
                {#if qrCodeData && qrCodeOpen}
                    <div class="container" on:click={async () => {
                            await navigator.clipboard.writeText(linkUrl);
                            dispatch('close')
                            notify(`copied invitation`);
                        }}>
                        <QrCode  value={linkUrl} />
                    </div>
                {/if}
            </Column>
        </Row>
    </Grid>
</Modal>