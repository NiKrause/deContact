<script>
    /**
     * @component Light or dark (#110), in Settings: as the system is set (the default), or
     * always light, or always dark. At once, kept in this browser (lib/theme.js).
     */
    import ChoiceSwitch from './ChoiceSwitch.svelte'
    import { _ } from '#lib/i18n/index.js'
    import { THEMES, setTheme, theme } from '#lib/theme.js'
</script>

<ChoiceSwitch
    id="theme"
    label={$_('theme.label')}
    help={$_('theme.help')}
    choices={THEMES.map((value) => ({ value, text: $_(`theme.${value}`) }))}
    value={$theme}
    onchoose={setTheme} />
