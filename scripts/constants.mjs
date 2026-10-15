export const MODULE_ID = "projectfu-zero-powers";
export const MODULE_TITLE = "Project FU：零界力量自动化";
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
export const ZERO_POWER_TYPE = "projectfu.zeroPower";

export const SETTINGS = Object.freeze({
  AUTOMATION: "automationEnabled",
  VARIANT: "variantMode",
  SHOW_PANEL: "showCombatPanel",
  CLEAR_CLOCKS: "clearClocksOnCombat",
  PANEL_COLLAPSED: "panelCollapsed",
  PANEL_POSITION: "panelPosition",
});

export const VARIANTS = Object.freeze({
  STANDARD: "standard",
  AWAKENING: "awakening",
  LINKED: "linked",
  COMBINED: "combined",
});

export const NEGATIVE_STATUSES = Object.freeze([
  "dazed",
  "shaken",
  "slow",
  "weak",
  "enraged",
  "poisoned",
]);

export const DAMAGE_TYPES = Object.freeze([
  { id: "air", name: "风系" },
  { id: "bolt", name: "雷系" },
  { id: "dark", name: "暗系" },
  { id: "earth", name: "土系" },
  { id: "fire", name: "火系" },
  { id: "ice", name: "冰系" },
  { id: "light", name: "光系" },
  { id: "poison", name: "毒系" },
]);

export const CALAMITY_STATUSES = Object.freeze([
  { id: "dazed", name: "眩晕" },
  { id: "shaken", name: "动摇" },
  { id: "slow", name: "迟缓" },
  { id: "weak", name: "虚弱" },
]);
