import { MODULE_ID } from "./constants.mjs";
import { applyEntryToPower } from "./creator.mjs";
import { isZeroPower, primaryZeroPower } from "./utils.mjs";

async function droppedItem(event) {
  let data;
  try {
    data = JSON.parse(event.dataTransfer?.getData("text/plain") || "{}");
  } catch {
    return null;
  }
  if (data.type !== "Item" || !data.uuid) return null;
  const item = await fromUuid(data.uuid);
  return item?.flags?.[MODULE_ID]?.entryKind ? item : null;
}

function bindDropZone(element, getPower) {
  if (!element || element.dataset.fuzpDropBound) return;
  element.dataset.fuzpDropBound = "true";
  element.classList.add("fuzp-drop-zone");
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, true);
  element.addEventListener("drop", async (event) => {
    const source = await droppedItem(event);
    if (!source) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await applyEntryToPower(getPower(), source);
  }, true);
}

export function enhanceZeroPowerDropTargets(app, element) {
  const item = app?.item ?? app?.document;
  if (isZeroPower(item)) {
    element.querySelectorAll("fieldset, prose-mirror, input[name^='system.data.zero']")
      .forEach((target) => bindDropZone(target, () => item));
    return;
  }
  const actor = app?.actor ?? (app?.document?.documentName === "Actor" ? app.document : null);
  if (actor?.type !== "character") return;
  for (const row of element.querySelectorAll("[data-item-id]")) {
    const power = actor.items.get(row.dataset.itemId);
    if (isZeroPower(power)) bindDropZone(row, () => power);
  }
  const featureTab = element.querySelector('[data-application-part="features"], div.tab[data-tab="features"]');
  if (featureTab && primaryZeroPower(actor)) bindDropZone(featureTab, () => primaryZeroPower(actor));
}
