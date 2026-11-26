<script>
     import { selectedAddr, orbitdb } from "../../stores.js";
     import { addContact, deleteContact, updateContact } from "../../operations.js";
     import { Button, Checkbox, Column, Dropdown, Grid, Row, TextInput } from "carbon-components-svelte";
     import ContactPhoto from "./ContactPhoto.svelte";
     import { photoFromFile } from "#lib/photo/photo.js";

     /** our own card, or a new one: it may get a photo (#87) */
     $: ours = $selectedAddr.owner === $orbitdb?.identity?.id || !$selectedAddr._id

     let photoInput
     let photoProblem = ""
     let readingPhoto = false

     /** the picked or taken image, made small and without its metadata (photo.js); saved with the card */
     async function choosePhoto(event) {
          const input = event.currentTarget
          const file = input.files?.[0]
          input.value = "" // the same file can be chosen again
          if (!file) return
          photoProblem = ""
          readingPhoto = true
          try {
               $selectedAddr = { ...$selectedAddr, photo: await photoFromFile(file) }
          } catch (error) {
               console.log("could not use the photo:", error?.message)
               photoProblem = "This image could not be used."
          } finally {
               readingPhoto = false
          }
     }

     function removePhoto() {
          // eslint-disable-next-line no-unused-vars
          const { photo, ...card } = $selectedAddr
          $selectedAddr = card
     }
</script>

<section>
    <Grid>

        <Row>
            <Column>
                <div class="photo">
                    <ContactPhoto photo={$selectedAddr.photo} size={96} alt="Photo" testid="form-photo" />
                    {#if ours}
                        <!-- no capture attribute: on a phone the system then offers the camera and the gallery -->
                        <input bind:this={photoInput} type="file" accept="image/*" hidden on:change={choosePhoto} />
                        <Button kind="tertiary" size="sm" disabled={readingPhoto} on:click={() => photoInput.click()}>Choose photo</Button>
                        {#if $selectedAddr.photo}
                            <Button kind="ghost" size="sm" on:click={removePhoto}>Remove photo</Button>
                        {/if}
                    {/if}
                </div>
                {#if photoProblem}<p class="problem" role="alert">{photoProblem}</p>{/if}
            </Column>
        </Row>
        <Row>
            <Column><TextInput data-cy="txtFirstname" size="sm" labelText="firstname" placeholder="Enter firstname..."
                               bind:value={$selectedAddr.firstName} /></Column>
            <Column><TextInput data-cy="txtLastname" size="sm" labelText="lastname" placeholder="Enter lastname..."
                               bind:value={$selectedAddr.lastName} /></Column>
        </Row>
        <Row>
            <Column><TextInput  data-cy="txtStreet" size="sm" labelText="street" placeholder="Enter street..."
                                bind:value={$selectedAddr.street}  /></Column>
            <Column><TextInput  data-cy="txtZipCode" size="sm" labelText="zipcode" placeholder="Enter zipcode..."
                                bind:value={$selectedAddr.postalCode}  /></Column>
        </Row>
        <Row>
            <Column><TextInput  data-cy="txtCity" size="sm" labelText="city" placeholder="Enter city..."
                                bind:value={$selectedAddr.city}  /></Column>
            <Column><TextInput  data-cy="txtCountry" size="sm" labelText="country" placeholder="Enter country..."
                                bind:value={$selectedAddr.countryRegion}  /></Column>
        </Row>
        <Row>
            <Column>
                <TextInput data-cy="txtEmail" size="sm" labelText="Email" placeholder="Email" bind:value={$selectedAddr.email}  />
            </Column>
            <Column></Column>
        </Row>
        <Row>
            <Column><Dropdown
                    titleText="Category"
                    bind:selectedId={$selectedAddr.category}
                    items={[
                            { id: "private", text: "Private" },
                            { id: "business", text: "Business" },
                            { id: "other", text: "Other" },
                    ]}
            /></Column>
            <Column>
                {#if $selectedAddr.owner === $orbitdb?.identity?.id || !$selectedAddr._id}
                    <Checkbox labelText="our own address" name="own" bind:checked={$selectedAddr.own}/>
                {/if}
            </Column>
        </Row>
        <Row>
            <Column>
                {#if $selectedAddr._id}
                    {#if $selectedAddr.owner === $orbitdb?.identity?.id}
                        <Button data-cy="updateContact" size="sm" on:click={() => updateContact()}>Update</Button>
                        <Button data-cy="newContact" size="sm" on:click={() => $selectedAddr = {}}>New</Button>
                    {/if}
                    <Button data-cy="deleteContact" size="sm" on:click={() => deleteContact()}>Delete</Button>

                {:else}
                    <Button data-cy="addContact" size="sm" on:click={() => addContact()}>Add</Button>
                {/if}
            </Column>
        </Row>
    </Grid>

</section>
<style>
    .photo {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 1rem;
        margin-bottom: 1rem;
    }
    .photo :global(.bx--btn) {
        margin-bottom: 0;
    }
    .problem {
        color: #fa4d56;
    }
</style>
