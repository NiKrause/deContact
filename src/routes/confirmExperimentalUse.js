import {confirm} from "#lib/components/experimentalUseModal.js";
import { t } from "#lib/i18n/index.js";

/**
 * When opening the app first time, let the people know this is experimental.
 * @returns {Promise<void>}
 */
export const confirmExperimentalUse = async () => {
    if(!localStorage.getItem("testConfirmation")) {
        const result = await confirm({ data: { text: t('experimental.text') } })
        if(result===true) localStorage.setItem("testConfirmation",result)
    }
}
