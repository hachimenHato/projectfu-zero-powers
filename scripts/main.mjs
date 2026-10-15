import { MODULE_ID, MODULE_TITLE, SOCKET_CHANNEL, SETTINGS } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { registerAutomationHooks } from "./automation.mjs";
import { bindClockChat, handleClockSocket } from "./clock.mjs";
import { bindEffectChat, handleEffectSocket } from "./effects.mjs";
import { enhanceZeroPowerDropTargets } from "./drag-drop.mjs";
import { openCreator, receiveLinkSync, repairManagedPowerPresentation } from "./creator.mjs";
import { getPanel, refreshPanel } from "./panel.mjs";
import { isAutomationEnabled, isResponsibleFor } from "./utils.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerAutomationHooks();
  console.info(`${MODULE_TITLE} | initialized`);
});

function htmlElement(value) {
  return value instanceof HTMLElement ? value : value?.[0] ?? value;
}

function enhanceActorSheet(app, root) {
  const actor = app.actor ?? (app.document?.documentName === "Actor" ? app.document : null);
  if (!actor || actor.type !== "character" || !actor.isOwner || !isAutomationEnabled()) return;
  if (root.querySelector("[data-fuzp-create]")) return;
  // FU uses data-tab="features" on both the navigation link and the actual
  // ApplicationV2 part. Select the content part explicitly.
  const tab = root.querySelector('[data-application-part="features"], div.tab[data-tab="features"]');
  const header = tab?.querySelector(".items-main-header");
  if (!header) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fuzp-create-button";
  button.dataset.fuzpCreate = "true";
  button.innerHTML = '<i class="fa-solid fa-star-and-crescent"></i><span>创建 / 配置零界力量</span>';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    openCreator(actor);
  }, true);
  header.insertAdjacentElement("afterend", button);
}

Hooks.on("renderApplicationV2", (app, element) => {
  const root = htmlElement(element);
  if (!root?.querySelector) return;
  enhanceZeroPowerDropTargets(app, root);
  enhanceActorSheet(app, root);
});

Hooks.on("renderChatMessageHTML", (message, element) => {
  const root = htmlElement(element);
  if (!root) return;
  bindClockChat(message, root);
  bindEffectChat(message, root);
});

Hooks.once("ready", () => {
  if (game.system.id !== "projectfu") return;
  game.projectfuZeroPowers = {
    openCreator,
    panel: getPanel(),
    refreshPanel,
  };
  game.socket.on(SOCKET_CHANNEL, async (payload) => {
    if (await handleClockSocket(payload)) return;
    if (await handleEffectSocket(payload)) return;
    if (payload.action === "syncLink") {
      const actor = await fromUuid(payload.targetActorUuid);
      if (actor && isResponsibleFor(actor)) await receiveLinkSync(actor, payload.sourceActorUuid, payload.link);
    }
  });
  if (isAutomationEnabled() && !game.settings.get("projectfu", "optionZeroPower") && game.user.isGM) {
    ui.notifications.warn("零界力量自动化需要先在 Project FU 系统设置中启用“底力/Zero Powers”。", { permanent: true });
  }
  repairManagedPowerPresentation().catch((error) => console.error(`${MODULE_ID} | Failed to repair native Zero Power presentation`, error));
  refreshPanel();
});

for (const hook of ["updateItem", "createItem", "deleteItem", "updateCombat", "createCombat", "deleteCombat", "controlToken", "canvasReady"]) Hooks.on(hook, refreshPanel);
Hooks.on(`${MODULE_ID}.refreshPanel`, refreshPanel);
Hooks.on(`${MODULE_ID}.clockChanged`, refreshPanel);
