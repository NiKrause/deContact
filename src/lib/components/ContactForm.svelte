<script>
     import { selectedAddr, orbitdb } from "../../stores.js";
     import { addContact, deleteContact, newContact, updateContact } from "../../operations.js";
     import { Button, Checkbox, Column, ConfirmModal, Dropdown, Grid, Row, TextInput } from "carbon-components-svelte";
     import ContactPhoto from "./ContactPhoto.svelte";
     import { photoFromFile } from "#lib/photo/photo.js";
     import { _ } from "#lib/i18n/index.js";

     /** the categories, in the language on screen (a new list with each switch) */
     const categoryItems = (tr) => ["private", "business", "other"].map((id) => ({ id, text: tr(`form.categories.${id}`) }))
     /** Carbon's "Open menu" / "Close menu", in the language on screen */
     const menuText = (tr) => (id) => tr(id === "open" ? "common.openMenu" : "common.closeMenu")

     /** our own card, or a new one: it may get a photo (#87) */
     const ours = $derived($selectedAddr.owner === $orbitdb?.identity?.id || !$selectedAddr._id)

     /** Delete waits for its confirmation (#110) */
     let confirmDelete = $state(false)
     /** somebody else's card: deleting it removes them (operations.js deleteContact) */
     const theirs = $derived(Boolean($selectedAddr.owner) && $selectedAddr.owner !== $orbitdb?.identity?.id)
     /** the name for the question; a placeholder's last name is their DID, which is no name */
     const nameOfCard = $derived($selectedAddr.lastName === $selectedAddr.owner ? '' : [$selectedAddr.firstName, $selectedAddr.lastName].filter(Boolean).join(' '))
     const deleteTitle = (tr) => theirs
          ? (nameOfCard ? tr('form.removeTitle', { name: nameOfCard }) : tr('form.removeTitleNameless'))
          : (nameOfCard ? tr('form.deleteTitle', { name: nameOfCard }) : tr('form.deleteTitleNameless'))

     /** @type {HTMLInputElement | undefined} */
     let photoInput = $state()
     /** what went wrong with the photo: a key of the catalogue @type {string | undefined} */
     let photoProblem = $state()
     let readingPhoto = $state(false)

     /** the picked or taken image, made small and without its metadata (photo.js); saved with the card */
     async function choosePhoto(event) {
          const input = event.currentTarget
          const file = input.files?.[0]
          input.value = "" // the same file can be chosen again
          if (!file) return
          photoProblem = undefined
          readingPhoto = true
          try {
               $selectedAddr = { ...$selectedAddr, photo: await photoFromFile(file) }
          } catch (error) {
               console.log("could not use the photo:", error?.message)
               photoProblem = "form.photoProblem"
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
                    <ContactPhoto photo={$selectedAddr.photo} size={96} alt={$_('form.photo')} testid="form-photo" />
                    {#if ours}
                        <!-- no capture attribute: on a phone the system then offers the camera and the gallery -->
                        <input bind:this={photoInput} type="file" accept="image/*" hidden onchange={choosePhoto} />
                        <Button kind="tertiary" size="sm" disabled={readingPhoto} on:click={() => photoInput?.click()}>{$_('form.choosePhoto')}</Button>
                        {#if $selectedAddr.photo}
                            <Button kind="ghost" size="sm" on:click={removePhoto}>{$_('form.removePhoto')}</Button>
                        {/if}
                    {/if}
                </div>
                {#if photoProblem}<p class="problem" role="alert">{$_(photoProblem)}</p>{/if}
            </Column>
        </Row>
        <Row>
            <Column><TextInput data-cy="txtFirstname" size="sm" labelText={$_('form.firstName')} placeholder={$_('form.firstNamePlaceholder')}
                               bind:value={$selectedAddr.firstName} /></Column>
            <Column><TextInput data-cy="txtLastname" size="sm" labelText={$_('form.lastName')} placeholder={$_('form.lastNamePlaceholder')}
                               bind:value={$selectedAddr.lastName} /></Column>
        </Row>
        <Row>
            <Column><TextInput  data-cy="txtStreet" size="sm" labelText={$_('form.street')} placeholder={$_('form.streetPlaceholder')}
                                bind:value={$selectedAddr.street}  /></Column>
            <Column><TextInput  data-cy="txtZipCode" size="sm" labelText={$_('form.zipCode')} placeholder={$_('form.zipCodePlaceholder')}
                                bind:value={$selectedAddr.postalCode}  /></Column>
        </Row>
        <Row>
            <Column><TextInput  data-cy="txtCity" size="sm" labelText={$_('form.city')} placeholder={$_('form.cityPlaceholder')}
                                bind:value={$selectedAddr.city}  /></Column>
            <Column><TextInput  data-cy="txtCountry" size="sm" labelText={$_('form.country')} placeholder={$_('form.countryPlaceholder')}
                                bind:value={$selectedAddr.countryRegion}  /></Column>
        </Row>
        <Row>
            <Column>
                <TextInput data-cy="txtEmail" size="sm" labelText={$_('form.email')} placeholder={$_('form.emailPlaceholder')} bind:value={$selectedAddr.email}  />
            </Column>
            <Column></Column>
        </Row>
        <Row>
            <Column><Dropdown
                    labelText={$_('form.category')}
                    bind:selectedId={$selectedAddr.category}
                    translateWithId={menuText($_)}
                    items={categoryItems($_)}
            /></Column>
            <Column>
                {#if ours}
                    <Checkbox labelText={$_('form.own')} name="own" bind:checked={$selectedAddr.own}/>
                {/if}
            </Column>
        </Row>
        <Row>
            <Column>
                {#if $selectedAddr._id}
                    {#if $selectedAddr.owner === $orbitdb?.identity?.id}
                        <Button data-cy="updateContact" size="sm" on:click={() => updateContact()}>{$_('form.update')}</Button>
                        <Button data-cy="newContact" size="sm" on:click={newContact}>{$_('form.new')}</Button>
                    {/if}
                    <Button data-cy="deleteContact" kind="danger-tertiary" size="sm" on:click={() => (confirmDelete = true)}>{$_('form.delete')}</Button>

                {:else}
                    <Button data-cy="addContact" size="sm" on:click={() => addContact()}>{$_('form.add')}</Button>
                {/if}
            </Column>
        </Row>
    </Grid>

</section>
<ConfirmModal
        bind:open={confirmDelete}
        title={deleteTitle($_)}
        confirmText={$_(theirs ? 'form.remove' : 'form.delete')}
        cancelText={$_('common.cancel')}
        confirm={deleteContact}>
    <p>{$_(theirs ? 'form.removeText' : 'form.deleteText')}</p>
</ConfirmModal>
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
