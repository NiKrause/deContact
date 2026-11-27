<script>
    import {createEventDispatcher, onMount} from "svelte";
    import { Column, Modal, Toggle, Grid, Row, Checkbox } from 'carbon-components-svelte';
    import QrCode from "svelte-qrcode"
    const dispatch = createEventDispatcher();
    import { orbitdb } from "../../stores.js";
    import { notify } from "../../utils/utils.js";
    import { issueOnboardingToken } from "#lib/network/p2p-operations.js";
    import { _ } from "#lib/i18n/index.js";

    const page_url = import.meta.env.VITE_PAGE_URL?import.meta.env.VITE_PAGE_URL+'/#':'https://deContact.xyz/#';

    export let qrCodeData
    export let qrCodeOpen

    let onBoardingToken
    /** whoever scans the code may share their card with us in return (#86) */
    let twoWay = true
    let fullDeContactUrl = true

    // a new one-time token each time the dialog opens or the checkbox changes (it is signed in)
    let issuing = 0
    $: if (qrCodeOpen && $orbitdb) issueToken(twoWay)
    function issueToken(twoWay) {
        const issue = ++issuing
        onBoardingToken = undefined
        issueOnboardingToken({ twoWay })
            .then((token) => { if (issue === issuing) onBoardingToken = token })
            .catch((error) => console.log("could not create an invitation link:", error?.message))
    }
    $: linkUrl = (fullDeContactUrl && onBoardingToken)?`${page_url}/onboarding/${qrCodeData}?onBoardingToken=${onBoardingToken}`:qrCodeData
</script>

    <Modal bind:open={ qrCodeOpen }
       modalHeading={$_('qr.heading')}
       primaryButtonText={$_('common.ok')}
       iconDescription={$_('common.close')}
       secondaryButtonText=""
       on:click:button--primary={ () => dispatch('close') }
       on:click:button--secondary={ () => dispatch('close') }
       on:close={()=>dispatch('close')}>
    <Grid>
        <Row>
            <Column>
                <Toggle
                    labelText={$_('qr.scanWhat')}
                    labelA={$_('qr.didOnly')}
                    labelB={$_('qr.url')}
                    bind:toggled={fullDeContactUrl}/>
            </Column>
            <Column>
                <Checkbox id="two-way-exchange" labelText={$_('qr.twoWay')} bind:checked={twoWay} />
                <div class="bx--form__helper-text">{$_('qr.twoWayHelp')}</div>
            </Column>
        </Row>
        <Row>
            <Column>
                {#if qrCodeData && qrCodeOpen}
                    <div class="container" on:click={async () => {
                            await navigator.clipboard.writeText(linkUrl);
                            dispatch('close')
                            notify($_('notify.invitationCopied'));
                        }}>
                        <QrCode  value={linkUrl} />
                    </div>
                {/if}
            </Column>
        </Row>
    </Grid>
</Modal>