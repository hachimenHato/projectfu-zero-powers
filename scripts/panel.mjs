import { MODULE_ID, SETTINGS, VARIANTS } from "./constants.mjs";
import { conditionById, effectById } from "./data.mjs";
import { incrementClock } from "./clock.mjs";
import { awakenPower, releasePower } from "./effects.mjs";
import { openCreator } from "./creator.mjs";
import { currentOwnedActor, getCondition, getEffect, getProgress, isAutomationEnabled, managedData, primaryZeroPower, progressSegments, turnKey } from "./utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ZeroPowerPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  #dragController;
  #suppressCompactClick = false;

  static DEFAULT_OPTIONS = {
    id: "fuzp-combat-panel",
    classes: ["fuzp-panel"],
    tag: "aside",
    window: { frame: false, positioned: false },
    position: { width: 430, height: "auto" },
    actions: {
      manual: ZeroPowerPanel.manual,
      release: ZeroPowerPanel.release,
      awaken: ZeroPowerPanel.awaken,
      configure: ZeroPowerPanel.configure,
    },
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/combat-panel.hbs` } };

  async _prepareContext() {
    const actor = currentOwnedActor();
    const item = primaryZeroPower(actor);
    const progress = getProgress(item);
    const data = managedData(item);
    const linked = [VARIANTS.LINKED, VARIANTS.COMBINED].includes(data.variant);
    const partnerReady = !linked || (data.links ?? []).some((link) => {
      const partner = fromUuidSync(link.partnerUuid);
      const other = primaryZeroPower(partner);
      return link.effectId && link.awakened !== false && other && getProgress(other).current >= getProgress(other).max;
    });
    const key = turnKey(actor);
    const awakened = data.variant !== VARIANTS.AWAKENING && data.variant !== VARIANTS.COMBINED
      ? true
      : Boolean(data.awakened || data.links?.some((link) => link.awakened));
    return {
      visible: Boolean(isAutomationEnabled() && game.settings.get(MODULE_ID, SETTINGS.SHOW_PANEL) && game.combat?.started && actor && item),
      actor,
      item,
      condition: getCondition(item),
      effect: linked ? null : getEffect(item),
      progress,
      segments: progressSegments(progress.current, progress.max),
      full: progress.current >= progress.max,
      // A full clock must look and behave as ready. releasePower still performs
      // the rule-level own-turn check and gives a useful notification if the
      // user clicks between FU turns.
      canRelease: progress.current >= progress.max && partnerReady && awakened && (!key || data.lastReleaseTurn !== key),
      releaseHint: progress.current < progress.max
        ? `命刻尚未填满（${progress.current}/${progress.max}）`
        : !awakened
          ? "这项零界力量尚未觉醒"
          : !partnerReady
            ? "联结双方的命刻尚未同时填满"
            : key && data.lastReleaseTurn === key
              ? "本回合已经释放过零界力量"
              : key ? "释放零界力量" : "命刻已满；请在自己的回合内释放",
      collapsed: Boolean(game.settings.get(MODULE_ID, SETTINGS.PANEL_COLLAPSED)),
      linked,
      links: (data.links ?? []).map((link) => ({ ...link, partnerName: fromUuidSync(link.partnerUuid)?.name ?? "未知角色", effectName: effectById(link.effectId)?.name ?? "尚未觉醒" })),
      canAwaken: data.variant === VARIANTS.AWAKENING
        ? !data.awakeningUsed
        : data.variant === VARIANTS.COMBINED && Boolean(data.links?.some((link) => !link.localAwakeningUsed)),
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#dragController?.abort();
    this.#dragController = new AbortController();
    const { signal } = this.#dragController;
    this.element.querySelector("[data-fuzp-toggle]")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const collapsed = !game.settings.get(MODULE_ID, SETTINGS.PANEL_COLLAPSED);
      await game.settings.set(MODULE_ID, SETTINGS.PANEL_COLLAPSED, collapsed);
      this.render({ force: true });
    }, { signal });
    const position = game.settings.get(MODULE_ID, SETTINGS.PANEL_POSITION) ?? {};
    if (Number.isFinite(position.x) && Number.isFinite(position.y)) this.#placeAt(position.x, position.y);

    let drag = null;
    const handle = this.element.querySelector("[data-fuzp-drag-handle]");
    handle?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target.closest("button") && !event.target.closest(".fuzp-compact-clock"))) return;
      const rect = this.element.getBoundingClientRect();
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: rect.left, y: rect.top, moved: false, compactClock: Boolean(event.target.closest(".fuzp-compact-clock")) };
    }, { signal });
    window.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) {
        event.preventDefault();
        this.#placeAt(drag.x + dx, drag.y + dy);
      }
    }, { signal });
    window.addEventListener("pointerup", async (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const moved = drag.moved;
      const compactClock = drag.compactClock;
      drag = null;
      if (!moved) return;
      this.#suppressCompactClick = compactClock;
      const rect = this.element.getBoundingClientRect();
      await game.settings.set(MODULE_ID, SETTINGS.PANEL_POSITION, { x: Math.round(rect.left), y: Math.round(rect.top) });
    }, { signal });
    this.element.addEventListener("click", (event) => {
      if (!this.#suppressCompactClick || !event.target.closest(".fuzp-compact-clock")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#suppressCompactClick = false;
    }, { capture: true, signal });
  }

  #placeAt(x, y) {
    const rect = this.element.getBoundingClientRect();
    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    this.element.style.setProperty("left", `${Math.clamp(x, margin, maxX)}px`, "important");
    this.element.style.setProperty("top", `${Math.clamp(y, margin, maxY)}px`, "important");
    this.element.style.setProperty("bottom", "auto", "important");
    this.element.style.setProperty("transform", "none", "important");
  }

  static async manual() {
    const actor = currentOwnedActor();
    const item = primaryZeroPower(actor);
    const condition = getCondition(item);
    if (!condition) return ui.notifications.warn("该零界力量尚未设置条件。");
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: `手动触发：${condition.name}` },
      content: `<div class="standard-form"><div class="form-group"><span>填充格数</span><div class="form-fields"><input type="number" name="amount" min="1" max="${getProgress(item).max}" value="${condition.increment ?? 1}"></div></div><label class="form-group stacked"><span>触发说明（可选）</span><textarea name="reason">手动确认“${condition.name}”条件已经满足。</textarea></label></div>`,
      ok: { label: "触发并填充", icon: "fa-solid fa-plus", callback: (_event, _button, dialog) => ({ amount: Number(dialog.element.querySelector('[name="amount"]').value), reason: dialog.element.querySelector('[name="reason"]').value }) },
    });
    if (result) await incrementClock(actor, result.amount, result.reason, { item, source: "手动触发" });
  }

  static async release() { await releasePower(currentOwnedActor()); }
  static async awaken() { await awakenPower(currentOwnedActor()); }
  static async configure() { await openCreator(currentOwnedActor()); }
}

let panel;
let refreshTimer;

export function getPanel() {
  panel ??= new ZeroPowerPanel();
  return panel;
}

export function refreshPanel() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const app = getPanel();
    if (isAutomationEnabled() && game.settings.get(MODULE_ID, SETTINGS.SHOW_PANEL) && game.combat?.started) app.render({ force: true });
    else if (app.rendered) app.close({ animate: false });
  }, 50);
}
