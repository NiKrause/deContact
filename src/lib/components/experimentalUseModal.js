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
    // the first answer counts: closing after a button click answers again
    let answered = false
    const modal = mount(Modal, {
      target: document.body,
      props: {
        ...options,
        onresult: (result) => {
          if (answered) return
          answered = true
          resolve(result);
          unmount(modal);
        }
      }
    });
  });
}
