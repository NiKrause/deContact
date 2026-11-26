/**
 * performs confirmation dialogs
 * @module lib/components/common/confirmationModal/modal
 */
import { mount, unmount } from 'svelte';
import Modal from './ExperimentalUseModal.svelte';

/**
 * Creates a modal Confirmation Dialog and waits for the answer
 * @param {import('#lib/interfaces.js').ConfirmDialogOptions? } options
 * @returns {Promise<boolean>}
 */
export async function confirm(options) {
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
