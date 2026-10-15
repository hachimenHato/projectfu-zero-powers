import { MODULE_ID, SOCKET_CHANNEL } from "./constants.mjs";
import { getCondition, getProgress, isResponsibleFor, primaryZeroPower, zeroPowers, alliesOf, escapeHtml, clockUpdate } from "./utils.mjs";

const pendingBatches = new Map();

function segments(current, max) {
  return Array.from({ length: max }, (_, index) => `<span class="${index < current ? "filled" : ""}"></span>`).join("");
}

export async function postClockCard(actor, item, { reason, amount, before, after, source = "自动监测" }) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: "零界条件触发",
    content: `<article class="fuzp-chat fuzp-trigger-card">
      <header><i class="fa-solid fa-star-and-crescent"></i><div><strong>${escapeHtml(getCondition(item)?.name ?? "零界条件")}</strong><small>${escapeHtml(actor.name)} · ${escapeHtml(source)}</small></div><b>+${amount}</b></header>
      <p>${escapeHtml(reason)}</p>
      <div class="fuzp-chat-clock">${segments(after, getProgress(item).max)}<em>${after}/${getProgress(item).max}</em></div>
      <footer><button type="button" data-fuzp-action="undo-clock"><i class="fa-solid fa-rotate-left"></i> 撤回本次增加</button></footer>
    </article>`,
    flags: {
      [MODULE_ID]: {
        kind: "clock",
        actorUuid: actor.uuid,
        itemUuid: item.uuid,
        amount,
        before,
        after,
        undone: false,
      },
    },
  });
}

export async function incrementClock(actor, amount, reason, { source = "自动监测", item = null, silent = false } = {}) {
  item ??= primaryZeroPower(actor);
  if (!item || (!item.isOwner && !game.user.isGM)) return null;
  const progress = getProgress(item);
  const result = clockUpdate(progress.current, progress.max, amount);
  if (!result.applied) return result;
  await item.update({ "system.data.progress.current": result.after }, { fuzpInternal: true });
  if (!silent) await postClockCard(actor, item, { reason, amount: result.applied, before: result.before, after: result.after, source });
  Hooks.callAll(`${MODULE_ID}.clockChanged`, { actor, item, ...result, reason, source });
  return result;
}

export async function clearClock(actor, item = null, { silent = true } = {}) {
  item ??= primaryZeroPower(actor);
  if (!item || (!item.isOwner && !game.user.isGM)) return;
  const current = Number(getProgress(item).current) || 0;
  if (!current) return;
  await item.update({ "system.data.progress.current": 0 }, { fuzpInternal: true });
  if (!silent) await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<article class="fuzp-chat"><p><strong>${escapeHtml(actor.name)}</strong> 的零界命刻已清空。</p></article>`,
  });
}

export async function requestClockIncrement(actor, amount, reason, options = {}) {
  const item = options.item ?? primaryZeroPower(actor);
  if (!item) return;
  if (item.isOwner || game.user.isGM) return incrementClock(actor, amount, reason, { ...options, item });
  game.socket.emit(SOCKET_CHANNEL, {
    action: "increment",
    actorUuid: actor.uuid,
    itemId: item.id,
    amount,
    reason,
    source: options.source,
  });
}

export function batchClockIncrement(actor, amount, reason, { source = "自动监测", key = reason, delay = 120 } = {}) {
  const item = primaryZeroPower(actor);
  if (!item) return;
  const id = `${item.uuid}:${key}`;
  const pending = pendingBatches.get(id) ?? { actor, amount: 0, reason, source, timer: null };
  pending.amount += amount;
  clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    pendingBatches.delete(id);
    requestClockIncrement(pending.actor, pending.amount, pending.reason, { source: pending.source });
  }, delay);
  pendingBatches.set(id, pending);
}

export async function notifyZeroRelease(sourceActor) {
  for (const actor of alliesOf(sourceActor, { includeSelf: false, charactersOnly: true })) {
    const power = primaryZeroPower(actor);
    if (getCondition(power)?.id === "chain") {
      await requestClockIncrement(actor, 2, `${sourceActor.name} 释放了零界效果。`, { source: "连锁" });
    }
  }
}

export async function clearCombatantClocks(combatants) {
  const participants = [...combatants].map((entry) => entry.actor).filter(Boolean);
  const playerCharacters = new Map([
    ...game.actors.filter((actor) => actor.type === "character"),
    ...participants.filter((actor) => actor.type === "character"),
  ].map((actor) => [actor.uuid, actor]));
  for (const actor of playerCharacters.values()) {
    if (!isResponsibleFor(actor)) continue;
    for (const item of zeroPowers(actor)) await clearClock(actor, item);
  }
  const sceneStateActors = new Map([
    ...participants,
    ...(canvas?.tokens?.placeables ?? []).map((token) => token.actor).filter(Boolean),
  ].map((actor) => [actor.uuid, actor]));
  for (const actor of sceneStateActors.values()) {
    if (!isResponsibleFor(actor)) continue;
    if (actor.isOwner || game.user.isGM) {
      const data = actor.getFlag(MODULE_ID, "sceneEffects");
      if (data) await actor.unsetFlag(MODULE_ID, "sceneEffects");
      const revenge = actor.getFlag(MODULE_ID, "revengeScene");
      if (revenge) await actor.unsetFlag(MODULE_ID, "revengeScene");
      const zeroLimitEffects = actor.effects.filter((effect) => effect.getFlag(MODULE_ID, "zeroLimit"));
      if (zeroLimitEffects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", zeroLimitEffects.map((effect) => effect.id));
    }
  }
}

async function undoClock(message) {
  const data = message.getFlag(MODULE_ID, "kind") ? message.flags[MODULE_ID] : null;
  if (!data || data.undone) return;
  const item = await fromUuid(data.itemUuid);
  const actor = await fromUuid(data.actorUuid);
  if (!item || !actor || (!item.isOwner && !game.user.isGM)) return ui.notifications.warn("你没有撤回该命刻的权限。");
  await incrementClock(actor, -Number(data.amount), "撤回零界条件触发", { item, silent: true });
  await message.setFlag(MODULE_ID, "undone", true);
}

export function bindClockChat(message, element) {
  const data = message.flags?.[MODULE_ID];
  if (!data) return;
  const undo = element.querySelector('[data-fuzp-action="undo-clock"]');
  if (undo) {
    if (data.undone) {
      undo.disabled = true;
      undo.innerHTML = '<i class="fa-solid fa-check"></i> 已撤回';
      element.querySelector(".fuzp-trigger-card")?.classList.add("is-undone");
    } else undo.addEventListener("click", () => undoClock(message));
  }
  const fp = element.querySelector('[data-fuzp-action="confirm-fp"]');
  if (fp) {
    if (data.confirmed) {
      fp.disabled = true;
      fp.innerHTML = '<i class="fa-solid fa-check"></i> 已确认并填充';
    } else fp.addEventListener("click", async () => {
      fp.disabled = true;
      const actor = await fromUuid(data.actorUuid);
      if (!actor) {
        fp.disabled = false;
        return;
      }
      await requestClockIncrement(actor, 1, "消耗1点叙事点以援引一项特质或羁绊。", { source: "叙事点" });
      await message.setFlag(MODULE_ID, "confirmed", true);
    });
  }
}

export async function postFabulaConfirmation(actor) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<article class="fuzp-chat"><header><i class="fa-solid fa-gem"></i><div><strong>叙事点用途确认</strong><small>${escapeHtml(actor.name)}</small></div></header><p>规则只在叙事点用于援引特质或羁绊时填充命刻；系统无法从一次普通扣点中可靠判断用途。</p><footer><button type="button" data-fuzp-action="confirm-fp"><i class="fa-solid fa-plus"></i> 本次用于援引（命刻+1）</button></footer></article>`,
    flags: { [MODULE_ID]: { kind: "fp-confirm", actorUuid: actor.uuid, confirmed: false } },
  });
}

export async function handleClockSocket(payload) {
  if (payload.action !== "increment") return false;
  const actor = await fromUuid(payload.actorUuid);
  if (!actor || !isResponsibleFor(actor)) return true;
  const item = actor.items.get(payload.itemId) ?? primaryZeroPower(actor);
  await incrementClock(actor, payload.amount, payload.reason, { source: payload.source, item });
  return true;
}
