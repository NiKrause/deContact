<script>
    import { TextInput, Button, Column, Grid, Row, Toggle } from "carbon-components-svelte";
    import PasskeySettings from "./PasskeySettings.svelte";
    import {
        libp2p,
        connectedPeers,
        orbitdb,
        dbMyAddressBook, selectedAddr, selectedTab,
        useWebRTC
    } from "../../stores.js"

    $:window.localStorage.setItem('useWebRTC', $useWebRTC.toString());

  console.log("useWebRTC",$useWebRTC)
  </script>

<!--
 @component Settings component displays current address of db and my handle
 The handle is used in order to set write permissions for the databases
-->
<Grid>
    <Row>
        <Column sm={3}><TextInput labelText="DID"
                                  helperText="Derived from your passkey vault: the same for each of your passkeys"
                                  size="sm"
                                  readonly
                                  value={$orbitdb?.identity?.id} /></Column>
    </Row>

    <Row class="custom-row">
        <Column><PasskeySettings /></Column>
    </Row>

    <Row>
        <Column sm={3}><TextInput labelText="PeerId (LibP2P)"
                                  helperText="Every device has a unique peer id independent from your identity"
                                  readonly size="sm"
                                  value={$libp2p?.peerId?.toString()} /></Column>
    </Row>

    <Row class="custom-row">
        <Column sm={3}><TextInput labelText="Connected Peers"
                                  helperText="This is the amount of peers which are connected in our peer-to-peer network"
                                  readonly
                                  size="sm"
                                  value={$connectedPeers} /></Column>
    </Row>
    <Row>
        <Column sm={3}>
            <!-- off: other browsers are reached only through the relay; read when the network starts -->
            <Toggle id="webrtc-toggle" labelText="WebRTC (applies after reload)" bind:toggled={$useWebRTC} /></Column>
    </Row>
    <Row class="custom-row">
        <Column sm={1}><Button data-cy="DropFollowerDBs" size="sm" on:click={async () => {
            const addressRecords = await $dbMyAddressBook.all();
            console.log("dropping DropFollowerDBs db!",addressRecords)
            for (const addressRecord of addressRecords) {
                if(addressRecord.value.own) continue
                console.log("dropping follower db",addressRecord.value.sharedAddress)
                 const followerDB2DDrop = await $orbitdb.open(addressRecord.value.sharedAddress)
                 await followerDB2DDrop.drop()
                 if(addressRecord.value.subscriber){
                    const deleteHash = await $dbMyAddressBook.del(addressRecord.key)
                    console.log("deleteHash",deleteHash)
                 }
            }
            console.log("addressRecords",addressRecords)
            selectedAddr.set({})
            selectedTab.set(0)
        }}>Drop Followed & Follower DBs</Button></Column>
        <Column>&nbsp;</Column>
        <Column sm={1}><Button data-cy="DropAddressDB" size="sm" on:click={async () => {
            console.log("dropping address db!")
            await $dbMyAddressBook.drop()
            const addressRecords = await $dbMyAddressBook.all();
            console.log("addressRecords",addressRecords)
            selectedAddr.set({})
            selectedTab.set(0)
        }}>Drop AddressDB</Button></Column>
    </Row>

</Grid>
<style>
    :global(.bx--label) {
        color: white;
    }

    :global(.bx--row) {
        margin-bottom: 40px; /* Adjust the bottom margin to increase space between rows */
    }
</style>