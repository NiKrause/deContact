<script>
    /**
     * @component The accent colour (#110), in Settings: Carbon's blue (the default), teal or
     * purple, for buttons, links and marks, in light and dark. At once, kept in this browser
     * (lib/theme.js, lib/accent.css). The installed app's icon keeps the default.
     */
    import ChoiceSwitch from './ChoiceSwitch.svelte'
    import { _ } from '#lib/i18n/index.js'
    import { ACCENTS, accent, setAccent } from '#lib/theme.js'

    /** each colour as it shows on a button */
    const SWATCHES = { blue: '#0f62fe', teal: '#007d79', purple: '#8a3ffc' }
</script>

<ChoiceSwitch
    id="accent"
    label={$_('accent.label')}
    help={$_('accent.help')}
    choices={ACCENTS.map((value) => ({ value, text: $_(`accent.${value}`), swatch: SWATCHES[value] }))}
    value={$accent}
    onchoose={setAccent} />
