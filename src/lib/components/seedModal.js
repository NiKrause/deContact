/**
 * performs confirmation dialogs
 * @module lib/components/common/confirmationModal/modal
 */
import { mount, unmount } from 'svelte';
import Modal from './SeedPhraseModal.svelte';
export const ENTER_EXISTING = "EnterSeedPhrase"
export const GENERATE_NEW = "GenerateNew"

/**
 * Show a modal which asks the user to either generate or enter a seedphrase
 *
 * @param options
 * @returns {Promise<boolean>}
 */
export async function generateSeed(options) {
  return new Promise((resolve) => {
    // Svelte 5 mounts a component with mount(), no longer with new; the legacy
    // createEventDispatcher event arrives through the events option
    const modal = mount(Modal, {
      target: document.body,
      props: options,
      events: {
        result: (e) => {
          resolve(e.detail);
          unmount(modal);
        }
      }
    });
  });
}
