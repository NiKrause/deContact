import { mount, unmount } from 'svelte';
import Modal from './AddressModal.svelte';

/**
 * Creates a Confirmation Dialog and waits for the user to click a button
 * @param {import('#lib/interfaces.js').AddressModalOptions? } options
 * @returns {Promise<boolean | 'ONLY_HANDOUT'>}
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
