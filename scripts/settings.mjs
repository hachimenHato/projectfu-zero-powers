import { MODULE_ID, SETTINGS, VARIANTS } from "./constants.mjs";

function reloadNotice() {
  ui.notifications.info("零界力量设置已改变；重新载入世界后完全生效。", { permanent: false });
}

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.AUTOMATION, {
    name: "FUZP.Settings.Automation",
    hint: "FUZP.Settings.AutomationHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
    onChange: reloadNotice,
  });
  game.settings.register(MODULE_ID, SETTINGS.VARIANT, {
    name: "FUZP.Settings.Variant",
    hint: "FUZP.Settings.VariantHint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [VARIANTS.STANDARD]: "FUZP.Variant.Standard",
      [VARIANTS.AWAKENING]: "FUZP.Variant.Awakening",
      [VARIANTS.LINKED]: "FUZP.Variant.Linked",
      [VARIANTS.COMBINED]: "FUZP.Variant.Combined",
    },
    default: VARIANTS.STANDARD,
    requiresReload: true,
    onChange: reloadNotice,
  });
  game.settings.register(MODULE_ID, SETTINGS.SHOW_PANEL, {
    name: "FUZP.Settings.ShowPanel",
    hint: "FUZP.Settings.ShowPanelHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, SETTINGS.CLEAR_CLOCKS, {
    name: "FUZP.Settings.Clear",
    hint: "FUZP.Settings.ClearHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, SETTINGS.PANEL_COLLAPSED, {
    name: "零界力量面板折叠状态",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, SETTINGS.PANEL_POSITION, {
    name: "零界力量面板位置",
    scope: "client",
    config: false,
    type: Object,
    default: {},
  });
}
