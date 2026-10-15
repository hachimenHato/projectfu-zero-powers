import { CALAMITY_STATUSES, DAMAGE_TYPES, MODULE_ID, NEGATIVE_STATUSES, VARIANTS } from "./constants.mjs";
import { CONDITIONS, conditionById, effectById, randomZeroPowerName } from "./data.mjs";
import { clearClock, notifyZeroRelease, requestClockIncrement } from "./clock.mjs";
import { applyDamage, ensureStatuses, recoverResource, removeStatuses } from "./system-api.mjs";
import { actorLevel, alliesOf, crisisValue, escapeHtml, getCondition, getEffect, getProgress, managedData, paragraphs, primaryZeroPower, sceneActors, selectedActors, turnKey } from "./utils.mjs";
import { linkDescription, syncLinkToPartner } from "./creator.mjs";
import { addCheckModifier, addDamageModifier, applyElementToCheck, enforceNormalAffinity, hasDamageModifier, ZERO_ELEMENT_BONUS_LABEL, ZERO_ELEMENT_IGNORE_TRAITS, ZERO_POWER_BONUS_LABEL, ZERO_POWER_IGNORE_AFFINITIES_TRAIT } from "./check-adjustments.mjs";

const pendingRolls = new Map();

function actionButton(action, label, icon, data = {}, disabled = false) {
  const attrs = Object.entries(data).map(([key, value]) => `data-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}="${escapeHtml(value)}"`).join(" ");
  return `<button type="button" data-fuzp-action="${action}" ${attrs} ${disabled ? "disabled" : ""}><i class="${icon}"></i> ${escapeHtml(label)}</button>`;
}

function equippedWeapons(actor) {
  return actor.items.filter((item) => {
    if (!["weapon", "customWeapon"].includes(item.type)) return false;
    const equipped = item.isEquipped ?? item.system?.isEquipped?.value ?? item.system?.equipped?.value;
    // Project FU exposes FUItem#isEquipped. The fallback keeps older/custom
    // weapon documents usable when that accessor is absent.
    return equipped ?? true;
  });
}

function knownSpells(actor) {
  return actor.items.filter((item) => item.type === "spell");
}

function consumables(actor) {
  return actor.items.filter((item) => item.type === "consumable");
}

function effectButtons(actor, effect, item, link) {
  const config = link?.effectConfig ?? managedData(item).effectConfig ?? {};
  switch (effect.id) {
    case "strike": {
      const weapons = equippedWeapons(actor);
      const accuracy = weapons.length > 1 ? 5 : 0;
      const damage = weapons.length === 1 ? 20 : 0;
      return weapons.length
        ? weapons.map((weapon) => actionButton("weapon", `${weapon.name}${accuracy ? "（命中+5）" : "（伤害+20）"}`, "fa-solid fa-swords", { actorUuid: actor.uuid, itemId: weapon.id, accuracy, damage, group: `strike-${weapon.id}` })).join("")
        : "<em>未找到已装备武器，请按规则手动执行攻击。</em>";
    }
    case "consumption":
      return actionButton("inventory", "执行消耗物资的顺势行动", "fa-solid fa-flask", { actorUuid: actor.uuid });
    case "element":
      return (config.elementTypes ?? []).map((type) => actionButton("element-type", `切换伤害类型：${type}`, "fa-solid fa-fire-flame-curved", { actorUuid: actor.uuid, type })).join("")
        + actionButton("extra-action", "记录本回合的额外行动", "fa-solid fa-forward-step", { actorUuid: actor.uuid, group: "element-extra-action" })
        + actionButton("end-element", "主动结束零界元素", "fa-solid fa-ban", { actorUuid: actor.uuid });
    case "limit":
      return actionButton("extra-action", "记录额外行动", "fa-solid fa-forward-step", { actorUuid: actor.uuid });
    case "magic": {
      const spells = knownSpells(actor);
      return spells.length
        ? spells.map((spell) => actionButton("spell", spell.name, "fa-solid fa-wand-sparkles", { actorUuid: actor.uuid, itemId: spell.id, accuracy: 5, damage: 10, group: "zero-magic" })).join("")
        : "<em>未找到已知法术，请按规则手动处理。</em>";
    }
    case "objective":
      return actionButton("scene-clock", "命刻 +3", "fa-solid fa-circle-plus", { actorUuid: actor.uuid, delta: 3, group: "zero-objective" }) + actionButton("scene-clock", "命刻 −3", "fa-solid fa-circle-minus", { actorUuid: actor.uuid, delta: -3, group: "zero-objective" });
    case "healing":
      return actionButton("healing", `对自己与所选盟友恢复 ${40 + Math.floor(actorLevel(actor) / 2)} HP`, "fa-solid fa-heart-circle-plus", { actorUuid: actor.uuid });
    case "calamity":
      return actionButton("calamity", `对所选目标造成 ${30 + Math.floor(actorLevel(actor) / 2)} ${config.calamityDamageType ?? "fire"} 伤害并施加异常`, "fa-solid fa-meteor", { actorUuid: actor.uuid });
    case "shield":
      return "<em>减伤已自动施加给场景内同阵营角色。</em>";
    case "triangle":
      return actionButton("triangle", "自己与所选至多两名盟友各攻击一次（命中+5）", "fa-solid fa-people-group", { actorUuid: actor.uuid });
    default:
      return "";
  }
}

async function setSceneEffect(actor, key, value) {
  const states = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "sceneEffects") ?? {});
  if (value == null) delete states[key];
  else states[key] = value;
  if (Object.keys(states).length) await actor.setFlag(MODULE_ID, "sceneEffects", states);
  else await actor.unsetFlag(MODULE_ID, "sceneEffects");
}

async function applyPassiveEffect(actor, effect, item, link) {
  const config = link?.effectConfig ?? managedData(item).effectConfig ?? {};
  if (effect.id === "consumption") await setSceneEffect(actor, "consumption", { sourceItemUuid: item.uuid });
  if (effect.id === "element") await setSceneEffect(actor, "element", { types: config.elementTypes ?? ["air", "fire"], activeType: config.activeElementType ?? config.elementTypes?.[0] ?? "air", sourceItemUuid: item.uuid });
  if (effect.id === "limit") {
    const old = actor.effects.filter((active) => active.getFlag(MODULE_ID, "zeroLimit"));
    if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map((entry) => entry.id));
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "零界极限",
      img: "icons/magic/symbols/runes-star-pentagon-orange-purple.webp",
      changes: ["dex", "ins", "mig", "wlp"].map((attribute) => ({ key: `system.attributes.${attribute}`, mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "upgrade", priority: 20 })),
      system: { duration: { event: "endOfScene" } },
      flags: { [MODULE_ID]: { zeroLimit: true } },
    }]);
  }
  if (effect.id === "shield") {
    const shield = { sourceActorUuid: actor.uuid, combatId: game.combat?.id ?? null, appliedRound: game.combat?.round ?? null };
    for (const ally of alliesOf(actor, { includeSelf: true })) {
      if (ally.isOwner || game.user.isGM) await setSceneEffect(ally, "shield", shield);
      else game.socket.emit(`module.${MODULE_ID}`, { action: "setSceneEffect", targetActorUuid: ally.uuid, key: "shield", value: shield });
    }
  }
}

async function postEffectCard(actor, item, effect, link = null) {
  const powerName = link?.name || item.name;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: "释放零界力量",
    content: `<article class="fuzp-chat fuzp-effect-card"><header><i class="fa-solid fa-burst"></i><div><strong>${escapeHtml(powerName)}</strong><small>${escapeHtml(actor.name)} · ${escapeHtml(effect.name)}</small></div></header><p>${escapeHtml(effect.description)}</p><div class="fuzp-chat-actions">${effectButtons(actor, effect, item, link)}</div></article>`,
    flags: { [MODULE_ID]: { kind: "effect", actorUuid: actor.uuid, itemUuid: item.uuid, effectId: effect.id, link: link ?? null, usedActions: [] } },
  });
}

async function chooseLink(actor, item) {
  const links = managedData(item).links ?? [];
  const eligible = links.filter((link) => {
    if (!link.effectId || link.awakened === false) return false;
    const partner = fromUuidSync(link.partnerUuid);
    const partnerPower = primaryZeroPower(partner);
    return partnerPower && getProgress(partnerPower).current >= getProgress(partnerPower).max;
  });
  if (!eligible.length) return ui.notifications.warn("没有双方命刻都已填满且已经觉醒的联结之力。"), null;
  if (eligible.length === 1) return eligible[0];
  return foundry.applications.api.DialogV2.wait({
    window: { title: "选择要释放的联结之力" },
    content: `<p>请选择一对双方命刻均已填满的联结。</p>`,
    buttons: eligible.map((link) => ({ action: link.partnerUuid, label: `${fromUuidSync(link.partnerUuid)?.name ?? "未知角色"} · ${link.name || effectById(link.effectId)?.name}`, callback: () => link })),
    rejectClose: false,
  });
}

export async function releasePower(actor) {
  const item = primaryZeroPower(actor);
  if (!item) return ui.notifications.warn("该角色没有零界力量。");
  const data = managedData(item);
  if ((data.variant === VARIANTS.AWAKENING || data.variant === VARIANTS.COMBINED) && data.awakened === false && !data.links?.some((entry) => entry.awakened)) return ui.notifications.warn("这项零界力量尚未觉醒。");
  const progress = getProgress(item);
  if (progress.current < progress.max) return ui.notifications.warn("零界命刻尚未填满。");
  const key = turnKey(actor);
  if (!key) return ui.notifications.warn("只能在冲突场景中自己的回合内释放零界力量。");
  if (data.lastReleaseTurn === key) return ui.notifications.warn("每个回合只能释放一次零界效果。");
  let link = null;
  if ([VARIANTS.LINKED, VARIANTS.COMBINED].includes(data.variant)) {
    link = await chooseLink(actor, item);
    if (!link) return;
  }
  const effect = getEffect(item, link);
  if (!effect) return ui.notifications.warn("未找到可释放的零界效果。");
  await clearClock(actor, item);
  if (link) {
    const partner = fromUuidSync(link.partnerUuid);
    const partnerPower = primaryZeroPower(partner);
    if (partnerPower?.isOwner || game.user.isGM) await clearClock(partner, partnerPower);
    else if (partnerPower) game.socket.emit(`module.${MODULE_ID}`, { action: "clearClock", actorUuid: partner.uuid, itemId: partnerPower.id });
  }
  await item.update({ [`flags.${MODULE_ID}.data.lastReleaseTurn`]: key }, { fuzpInternal: true });
  await applyPassiveEffect(actor, effect, item, link);
  if (effect.id === "opportunity") await rollOpportunity(actor, item, link);
  else await postEffectCard(actor, item, effect, link);
  await notifyZeroRelease(actor);
  Hooks.callAll(`${MODULE_ID}.released`, { actor, item, effect, link });
}

async function rollOpportunity(actor, item, link) {
  const prediction = await foundry.applications.api.DialogV2.wait({
    window: { title: "零界机遇：作出预测" },
    content: "<p>选择奇数或偶数，然后投掷3d6。</p>",
    buttons: [
      { action: "odd", label: "奇数", icon: "fa-solid fa-dice-one", callback: () => "odd" },
      { action: "even", label: "偶数", icon: "fa-solid fa-dice-two", callback: () => "even" },
    ],
    rejectClose: false,
  });
  if (!prediction) return postEffectCard(actor, item, effectById("opportunity"), link);
  const roll = await new Roll("3d6").evaluate();
  const dice = roll.dice[0]?.results?.map((result) => result.result) ?? [];
  const matches = dice.filter((value) => (prediction === "odd" ? value % 2 === 1 : value % 2 === 0)).length;
  const total = Number(roll.total) || 0;
  const labels = ["零个相符", "一个相符", "两个相符", "三个相符"];
  const buttons = Array.from({ length: matches + 1 }, (_, outcome) => actionButton("opportunity-outcome", labels[outcome], "fa-solid fa-bolt", { actorUuid: actor.uuid, outcome, total, itemUuid: item.uuid, group: "opportunity-outcome" })).join("");
  const triple = dice.length === 3 && new Set(dice).size === 1;
  const tripleAction = triple ? actionButton("extra-action", "记录三骰相同的额外行动", "fa-solid fa-forward-step", { actorUuid: actor.uuid, group: "opportunity-triple-action" }) : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    flavor: "释放零界机遇",
    content: `<article class="fuzp-chat fuzp-effect-card"><header><i class="fa-solid fa-dice"></i><div><strong>${escapeHtml(link?.name || item.name)}</strong><small>预测${prediction === "odd" ? "奇数" : "偶数"} · ${matches}个相符</small></div><b>${dice.join(" · ")}</b></header><p>可选择“${labels[matches]}”或任意更低结果。${triple ? " 三枚骰子点数相同：本回合另获一次额外行动。" : ""}</p><div class="fuzp-chat-actions">${buttons}${tripleAction}</div></article>`,
    flags: { [MODULE_ID]: { kind: "opportunity", actorUuid: actor.uuid, itemUuid: item.uuid, total, matches, triple, usedActions: [] } },
  });
}

async function promptItem(actor, items, title) {
  if (!items.length) return null;
  if (items.length === 1) return items[0];
  return foundry.applications.api.DialogV2.wait({
    window: { title },
    content: "<p>请选择要使用的条目。</p>",
    buttons: items.map((item) => ({ action: item.id, label: item.name, callback: () => item })),
    rejectClose: false,
  });
}

async function promptVisibleTarget(actor, title) {
  const targets = sceneActors().filter((target) => target.uuid !== actor.uuid);
  if (!targets.length) return null;
  if (targets.length === 1) return targets[0];
  return foundry.applications.api.DialogV2.wait({
    window: { title },
    content: "<p>当前没有选定目标，请从本场景的可见角色中选择一个。</p>",
    buttons: targets.map((target) => ({ action: target.id, label: target.name, callback: () => target })),
    rejectClose: false,
  });
}

async function rollItemWithBonus(actor, item, bonus) {
  if (!item?.system?.roll) {
    ui.notifications.warn("该条目无法通过 FU 原生流程掷骰。");
    return false;
  }
  const token = foundry.utils.randomID();
  pendingRolls.set(actor.uuid, { itemId: item.id, token, damageHandled: false, rollComplete: false, ...bonus });
  setTimeout(() => {
    if (pendingRolls.get(actor.uuid)?.token === token) pendingRolls.delete(actor.uuid);
  }, 120000);
  try {
    await item.system.roll({ shift: false, alt: false, ctrl: false });
    const current = pendingRolls.get(actor.uuid);
    if (current?.token === token) current.rollComplete = true;
    return true;
  }
  catch (error) {
    if (pendingRolls.get(actor.uuid)?.token === token) pendingRolls.delete(actor.uuid);
    throw error;
  }
  finally {
    const current = pendingRolls.get(actor.uuid);
    // A spell whose damage is represented by an inline chat action does not
    // calculate damage until that action is clicked. Keep only that pending
    // damage bonus briefly; ordinary checks are cleaned up immediately.
    if (current?.token === token && (!current.damage || current.damageHandled)) pendingRolls.delete(actor.uuid);
  }
}

async function applyOpportunityOutcome(actor, outcome, total, item) {
  if (outcome === 0) {
    await requestClockIncrement(actor, 3, "零界机遇：零个相符。", { source: "零界机遇" });
    for (const ally of alliesOf(actor, { includeSelf: false, charactersOnly: true })) await requestClockIncrement(ally, 1, `${actor.name} 的零界机遇使你的命刻填充1格。`, { source: "零界机遇" });
    ui.notifications.info("零个相符：命刻已处理；请额外执行一次行动。");
  } else if (outcome === 1) {
    const weapon = await promptItem(actor, equippedWeapons(actor), "零界机遇：选择武器");
    if (!weapon) return false;
    if (!await rollItemWithBonus(actor, weapon, { damage: total, accuracy: 0, source: "零界机遇" })) return false;
  } else if (outcome === 2) {
    let targets = selectedActors();
    if (!targets.length) {
      const target = await promptVisibleTarget(actor, "零界机遇：选择受到生命值损失的目标");
      if (!target) return false;
      targets = [target];
    }
    await applyDamage(actor, [targets[0]], "untyped", 30 + Math.floor(actorLevel(actor) / 2) + total, { ignoreAffinities: true });
  } else if (outcome === 3) {
    const targets = alliesOf(actor, { includeSelf: true, charactersOnly: true });
    const amount = crisisValue(actor) + total;
    for (const target of targets) await removeStatuses(target, NEGATIVE_STATUSES);
    await recoverResource(actor, targets, "hp", amount);
    await recoverResource(actor, targets, "mp", amount);
  }
  return true;
}

async function chooseSceneClock(delta) {
  const combat = game.combat;
  const tracks = combat?.system?.tracks ?? [];
  if (!tracks.length) {
    ui.notifications.warn("当前冲突没有场景命刻。");
    return false;
  }
  const track = await foundry.applications.api.DialogV2.wait({
    window: { title: `零界目标：命刻 ${delta > 0 ? "+" : ""}${delta}` },
    content: "<p>选择与当前场景关联的命刻。</p>",
    buttons: tracks.map((entry) => ({ action: entry.id || entry.name, label: `${entry.name || "未命名命刻"}（${entry.current}/${entry.max}）`, callback: () => entry })),
    rejectClose: false,
  });
  if (!track) return false;
  const updated = tracks.map((entry) => {
    const raw = entry.toObject?.() ?? foundry.utils.deepClone(entry);
    if (entry === track || entry.id === track.id) raw.current = Math.clamp(Number(entry.current) + delta, 0, Number(entry.max));
    return raw;
  });
  await combat.update({ "system.tracks": updated });
  return true;
}

async function useTriangle(actor) {
  const targets = selectedActors({ include: [actor] }).filter((target) => alliesOf(actor).some((ally) => ally.uuid === target.uuid)).slice(0, 3);
  for (const ally of targets) {
    const candidates = ally.type === "npc" ? ally.items.filter((entry) => entry.type === "basic") : equippedWeapons(ally);
    const item = await promptItem(ally, candidates, `零界铁三角：${ally.name}选择攻击`);
    if (item) await rollItemWithBonus(ally, item, { accuracy: 5, damage: 0, source: "零界铁三角" });
  }
}

async function executeAction(action, data, message) {
  const actorUuid = data.actorUuid || message?.getFlag(MODULE_ID, "actorUuid");
  const actor = actorUuid ? await fromUuid(actorUuid) : null;
  if (actor && !actor.isOwner && !game.user.isGM) {
    ui.notifications.warn("你没有操作该角色零界力量的权限。");
    return false;
  }
  const cardLink = message?.getFlag(MODULE_ID, "link") ?? null;
  switch (action) {
    case "weapon": {
      const item = actor?.items.get(data.itemId);
      if (!item || !await rollItemWithBonus(actor, item, { accuracy: Number(data.accuracy), damage: Number(data.damage), source: "零界闪击" })) return false;
      break;
    }
    case "spell": {
      const item = actor?.items.get(data.itemId);
      if (!item || !await rollItemWithBonus(actor, item, { accuracy: Number(data.accuracy), damage: Number(data.damage), freeCost: true, source: "零界魔法" })) return false;
      break;
    }
    case "inventory": {
      const item = await promptItem(actor, consumables(actor), "零界消耗：选择物资");
      if (!item) return false;
      await item.system.roll({ shift: false, alt: false, ctrl: false });
      break;
    }
    case "element-type": {
      const state = actor.getFlag(MODULE_ID, "sceneEffects")?.element;
      if (state?.types?.includes(data.type)) await setSceneEffect(actor, "element", { ...state, activeType: data.type });
      break;
    }
    case "end-element": await setSceneEffect(actor, "element", null); break;
    case "scene-clock":
      if (!await chooseSceneClock(Number(data.delta))) return false;
      break;
    case "healing": {
      const allowed = new Set(alliesOf(actor, { includeSelf: true }).map((target) => target.uuid));
      const targets = selectedActors({ include: [actor] }).filter((target) => allowed.has(target.uuid));
      for (const target of targets) await removeStatuses(target, NEGATIVE_STATUSES);
      await recoverResource(actor, targets, "hp", 40 + Math.floor(actorLevel(actor) / 2));
      break;
    }
    case "calamity": {
      const targets = selectedActors();
      if (!targets.length) {
        ui.notifications.warn("请先选中一个或多个可见目标。");
        return false;
      }
      // Linked Powers keep their per-pair configuration on the link rather
      // than the parent Zero Power item. The chat card snapshots that link.
      const config = cardLink?.effectConfig ?? managedData(primaryZeroPower(actor)).effectConfig ?? {};
      await applyDamage(actor, targets, config.calamityDamageType ?? "fire", 30 + Math.floor(actorLevel(actor) / 2));
      await ensureStatuses(actor, targets, config.calamityStatuses ?? ["dazed", "weak"]);
      break;
    }
    case "triangle": await useTriangle(actor); break;
    case "opportunity-outcome":
      if (!await applyOpportunityOutcome(actor, Number(data.outcome), Number(data.total), await fromUuid(data.itemUuid))) return false;
      break;
    case "extra-action": ui.notifications.info(`${actor?.name ?? "角色"} 获得一次额外行动；请在战斗流程中执行。`); break;
    case "love-surrender":
      await requestClockIncrement(actor, 1, `${data.defeatedName || "所爱之人"}选择了放弃抵抗。`, { source: "爱恋" });
      break;
    case "love-sacrifice": {
      const power = primaryZeroPower(actor);
      const progress = getProgress(power);
      await requestClockIncrement(actor, progress.max - progress.current, `${data.defeatedName || "所爱之人"}牺牲了自己，且你见证了这场牺牲。`, { source: "爱恋" });
      if (power?.isOwner || game.user.isGM) {
        const powerData = foundry.utils.deepClone(managedData(power));
        powerData.loveNeedsNewCondition = true;
        await power.update({ [`flags.${MODULE_ID}.data`]: powerData }, { fuzpInternal: true });
      }
      break;
    }
    case "love-change-condition":
      if (!await chooseLoveReplacement(actor)) return false;
      break;
    case "awaken": await awakenPower(actor); break;
  }
  if (message && action !== "element-type") {
    const used = message.getFlag(MODULE_ID, "usedActions") ?? [];
    const key = data.group || `${action}:${data.itemId ?? data.outcome ?? data.delta ?? data.type ?? "once"}`;
    if (!used.includes(key)) await message.setFlag(MODULE_ID, "usedActions", [...used, key]);
  }
  return true;
}

export function bindEffectChat(message, element) {
  if (!message.flags?.[MODULE_ID]) return;
  element.querySelectorAll("[data-fuzp-action]").forEach((button) => {
    const action = button.dataset.fuzpAction;
    if (["undo-clock", "confirm-fp"].includes(action)) return;
    const key = button.dataset.group || `${action}:${button.dataset.itemId ?? button.dataset.outcome ?? button.dataset.delta ?? button.dataset.type ?? "once"}`;
    if ((message.getFlag(MODULE_ID, "usedActions") ?? []).includes(key)) button.disabled = true;
    else button.addEventListener("click", async () => {
      button.disabled = true;
      const claimBeforeRun = action === "opportunity-outcome";
      let claimed = false;
      try {
        // Opportunity's direct-damage branch can finish the HP update before a
        // later hook reports an error. Claim the mutually-exclusive outcome
        // first so that a partially successful resolution cannot be repeated.
        if (claimBeforeRun) {
          const used = message.getFlag(MODULE_ID, "usedActions") ?? [];
          if (used.includes(key)) return;
          await message.setFlag(MODULE_ID, "usedActions", [...used, key]);
          claimed = true;
        }
        const completed = await executeAction(action, { ...button.dataset }, message);
        if (completed === false) {
          if (claimed) {
            const used = message.getFlag(MODULE_ID, "usedActions") ?? [];
            await message.setFlag(MODULE_ID, "usedActions", used.filter((entry) => entry !== key));
          }
          button.disabled = false;
        }
      }
      catch (error) {
        console.error(`${MODULE_ID} | Chat action failed`, error);
        ui.notifications.error(`零界效果处理失败：${error.message}`);
        // Keep a pre-claimed Opportunity outcome locked: the FU pipeline may
        // already have applied its damage before throwing further downstream.
        if (!claimed) button.disabled = false;
      }
    });
  });
}

export function onCalculateExpense(event) {
  const actor = event.source?.actor;
  const pending = pendingRolls.get(actor?.uuid);
  if (pending?.freeCost && (!pending.itemId || pending.itemId === event.item?.id)) event.expense.amount = 0;
  const consumption = actor?.getFlag(MODULE_ID, "sceneEffects")?.consumption;
  if (consumption && event.expense.resource === "ip") event.expense.amount = Math.floor(Number(event.expense.amount) / 2);
}

function pendingFor(actor, item) {
  const pending = pendingRolls.get(actor?.uuid);
  if (!pending || (pending.itemId && pending.itemId !== item?.id)) return null;
  return pending;
}

export function onPrepareCheck(check, actor, item) {
  const pending = pendingFor(actor, item);
  if (pending?.accuracy) addCheckModifier(check, ZERO_POWER_BONUS_LABEL, pending.accuracy);
}

export function onCalculateDamage(event) {
  const actor = event.source?.actor;
  const check = event.config?.check;
  const damage = event.config?.getDamage?.() ?? check?.additionalData?.damage;
  const pending = pendingFor(actor, event.item);
  if (pending?.damage && damage) {
    addDamageModifier(damage, ZERO_POWER_BONUS_LABEL, pending.damage);
    pending.damageHandled = true;
    if (pending.rollComplete && pendingRolls.get(actor.uuid) === pending) pendingRolls.delete(actor.uuid);
  }
  const element = actor?.getFlag(MODULE_ID, "sceneEffects")?.element;
  if (element?.activeType && check) applyElementToCheck(check, element.activeType, 5);
}

export function onDamageEvent(event) {
  const actor = event.sourceActor ?? event.source?.actor;
  const state = actor?.getFlag(MODULE_ID, "sceneEffects")?.element;
  if (!state || event.damageContext.traits?.has?.(ZERO_POWER_IGNORE_AFFINITIES_TRAIT)) return;
  event.damageContext.damageType = state.activeType;
  for (const trait of ZERO_ELEMENT_IGNORE_TRAITS) event.damageContext.traits.add(trait);
  if (!hasDamageModifier(event.damageContext.damageData, ZERO_ELEMENT_BONUS_LABEL)) {
    event.damageContext.addBonus(ZERO_ELEMENT_BONUS_LABEL, 5);
  }
}

export function onDamagePreCalculate(context) {
  enforceNormalAffinity(context);
  if (context.actor?.getFlag(MODULE_ID, "sceneEffects")?.shield) context.addModifier("零界护盾", 0.5);
}

export async function clearShieldAtSourceTurn(actor) {
  for (const target of alliesOf(actor, { includeSelf: true })) {
    const shield = target.getFlag(MODULE_ID, "sceneEffects")?.shield;
    if (shield?.sourceActorUuid !== actor.uuid) continue;
    if (target.isOwner || game.user.isGM) await setSceneEffect(target, "shield", null);
    else game.socket.emit(`module.${MODULE_ID}`, { action: "setSceneEffect", targetActorUuid: target.uuid, key: "shield", value: null });
  }
}

async function configureAwakenedEffect(effectId) {
  if (!['element', 'calamity'].includes(effectId)) return {};
  const damageOptions = (selected) => DAMAGE_TYPES.map((entry) => `<option value="${entry.id}" ${entry.id === selected ? "selected" : ""}>${entry.name}</option>`).join("");
  const statusOptions = (selected) => CALAMITY_STATUSES.map((entry) => `<option value="${entry.id}" ${entry.id === selected ? "selected" : ""}>${entry.name}</option>`).join("");
  const isElement = effectId === 'element';
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: isElement ? "配置零界元素" : "配置零界灾厄" },
    content: isElement
      ? `<form class="standard-form"><div class="form-group"><span>两种伤害类型</span><div class="form-fields"><select name="damageA">${damageOptions('air')}</select><select name="damageB">${damageOptions('fire')}</select></div></div></form>`
      : `<form class="standard-form"><div class="form-group"><span>伤害类型与两种异常</span><div class="form-fields"><select name="damage">${damageOptions('fire')}</select><select name="statusA">${statusOptions('dazed')}</select><select name="statusB">${statusOptions('weak')}</select></div></div></form>`,
    buttons: [{
      action: "save",
      label: "确认配置",
      icon: "fa-solid fa-check",
      default: true,
      callback: (_event, _button, dialog) => isElement
        ? { damageA: dialog.element.querySelector('[name="damageA"]').value, damageB: dialog.element.querySelector('[name="damageB"]').value }
        : { damage: dialog.element.querySelector('[name="damage"]').value, statusA: dialog.element.querySelector('[name="statusA"]').value, statusB: dialog.element.querySelector('[name="statusB"]').value },
    }],
    rejectClose: false,
  });
  if (!result) return null;
  if (isElement) {
    const second = result.damageA === result.damageB ? DAMAGE_TYPES.find((entry) => entry.id !== result.damageA).id : result.damageB;
    return { elementTypes: [result.damageA, second], activeElementType: result.damageA };
  }
  const second = result.statusA === result.statusB ? CALAMITY_STATUSES.find((entry) => entry.id !== result.statusA).id : result.statusB;
  return { calamityDamageType: result.damage, calamityStatuses: [result.statusA, second] };
}

async function chooseLoveReplacement(actor) {
  const item = primaryZeroPower(actor);
  if (!item || (!item.isOwner && !game.user.isGM)) {
    ui.notifications.warn("你没有修改该角色的权限。");
    return false;
  }
  const data = foundry.utils.deepClone(managedData(item));
  if (!data.loveNeedsNewCondition) {
    ui.notifications.info("该角色当前不需要更换爱恋条件。");
    return false;
  }
  const used = new Set(game.actors
    .filter((candidate) => candidate.type === "character" && candidate.uuid !== actor.uuid)
    .map((candidate) => getCondition(primaryZeroPower(candidate))?.id)
    .filter(Boolean));
  const available = CONDITIONS.filter((entry) => entry.id !== "love" && !used.has(entry.id));
  if (!available.length) {
    ui.notifications.warn("没有可用且不重复的新零界条件，请由主持人手动调整。");
    return false;
  }
  const conditionId = await foundry.applications.api.DialogV2.wait({
    window: { title: "爱恋：选择新的零界条件" },
    content: `<form class="standard-form"><p>所爱之人的牺牲已经结算。依照规则，在场景结束时为这项零界力量选择另一项条件。</p><label class="form-group"><span>新条件</span><select name="condition">${available.map((entry) => `<option value="${entry.id}">${entry.name}（${entry.variable ? "可变" : `+${entry.increment}`}）</option>`).join("")}</select></label></form>`,
    buttons: [{ action: "save", label: "保存新条件", icon: "fa-solid fa-check", default: true, callback: (_event, _button, dialog) => dialog.element.querySelector('[name="condition"]').value }],
    rejectClose: false,
  });
  if (!conditionId) return false;
  const condition = conditionById(conditionId);
  data.conditionId = condition.id;
  data.loveActorUuid = "";
  data.loveNeedsNewCondition = false;
  await item.update({
    [`flags.${MODULE_ID}.data`]: data,
    "system.data.zeroTrigger.value": condition.name,
    "system.data.zeroTrigger.description": paragraphs(condition.description),
  }, { fuzpInternal: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<article class="fuzp-chat"><header><i class="fa-solid fa-star-and-crescent"></i><div><strong>${escapeHtml(actor.name)} 选择了新的零界条件</strong><small>${escapeHtml(condition.name)}</small></div></header><p>${escapeHtml(condition.description)}</p></article>`,
  });
  return true;
}

export async function awakenPower(actor) {
  const item = primaryZeroPower(actor);
  if (!item) return;
  const data = foundry.utils.deepClone(managedData(item));
  if (![VARIANTS.AWAKENING, VARIANTS.COMBINED].includes(data.variant)) return ui.notifications.warn("当前零界力量不使用觉醒规则。");
  const combined = data.variant === VARIANTS.COMBINED;
  const links = data.links ?? [];
  let condition = getCondition(item);
  let link = null;

  if (combined) {
    const candidates = links.filter((entry) => !entry.localAwakeningUsed);
    if (!candidates.length) return ui.notifications.warn("该角色已经为每一项联结使用过觉醒之力。");
    link = candidates.length === 1 ? candidates[0] : await foundry.applications.api.DialogV2.wait({
      window: { title: "选择本次觉醒的联结" },
      content: "<p>每名角色可针对每位联结对象分别觉醒一次。请选择本次觉醒对应的角色。</p>",
      buttons: candidates.map((entry) => ({ action: entry.partnerUuid, label: fromUuidSync(entry.partnerUuid)?.name ?? "未知角色", callback: () => entry })),
      rejectClose: false,
    });
    if (!link) return;
    if (!link.effectId) {
      const chosen = await foundry.applications.api.DialogV2.wait({
        window: { title: `觉醒联结之力：${fromUuidSync(link.partnerUuid)?.name ?? "未知角色"}` },
        content: `<form class="standard-form"><label class="form-group"><span>这对联结共享的零界效果</span><select name="effect">${["strike", "opportunity", "consumption", "element", "limit", "magic", "objective", "healing", "calamity", "shield", "triangle"].map(effectById).map((entry) => `<option value="${entry.id}">${entry.name}</option>`).join("")}</select></label><label class="form-group"><span>联结力量名称</span><input name="name" placeholder="留空则使用效果名称"></label></form>`,
        buttons: [
          { action: "save", label: "觉醒", icon: "fa-solid fa-burst", callback: (_event, _button, dialog) => ({ effectId: dialog.element.querySelector('[name="effect"]').value, name: dialog.element.querySelector('[name="name"]').value.trim() }) },
          { action: "random", label: "随机命名并觉醒", icon: "fa-solid fa-dice", default: true, callback: (_event, _button, dialog) => { const effectId = dialog.element.querySelector('[name="effect"]').value; return { effectId, name: randomZeroPowerName(effectId) }; } },
        ],
        rejectClose: false,
      });
      if (!chosen) return;
      const effectConfig = await configureAwakenedEffect(chosen.effectId);
      if (effectConfig == null) return;
      link.effectId = chosen.effectId;
      link.name = chosen.name || effectById(chosen.effectId)?.name;
      link.effectConfig = effectConfig;
    }
    link.awakened = true;
    link.localAwakeningUsed = true;
    data.awakened = true;
    data.links = links;
    await syncLinkToPartner(actor, link);
  } else {
    if (data.awakeningUsed) return ui.notifications.warn("该角色在本次战役中已经使用过觉醒之力。");
    const used = new Set(game.actors.filter((candidate) => candidate.uuid !== actor.uuid).map((candidate) => getCondition(primaryZeroPower(candidate))?.id).filter(Boolean));
    const available = ["compassion", "disdain", "love", "revenge", "chain", "strategy", "synergy"].map(conditionById).filter((entry) => entry && !used.has(entry.id));
    if (!available.length) return ui.notifications.warn("没有可用且不重复的零界条件。");
    const conditionId = await foundry.applications.api.DialogV2.wait({
      window: { title: "觉醒之力" },
      content: `<form class="standard-form"><label class="form-group"><span>与觉醒事件相符的零界条件</span><select name="condition">${available.map((entry) => `<option value="${entry.id}">${entry.name}</option>`).join("")}</select></label></form>`,
      buttons: [{ action: "awaken", label: "觉醒", icon: "fa-solid fa-burst", default: true, callback: (_event, _button, dialog) => dialog.element.querySelector('[name="condition"]').value }],
      rejectClose: false,
    });
    if (!conditionId) return;
    condition = conditionById(conditionId);
    data.conditionId = condition.id;
    data.awakened = true;
    data.awakeningUsed = true;
  }
  const updates = {
    [`flags.${MODULE_ID}.data`]: data,
  };
  if (!combined) {
    updates["system.data.zeroTrigger.value"] = condition.name;
    updates["system.data.zeroTrigger.description"] = paragraphs(condition.description);
  } else {
    updates["system.data.zeroEffect.value"] = links.length === 1 ? (link.name || effectById(link.effectId)?.name) : `联结之力（${links.length}项）`;
    updates["system.data.zeroEffect.description"] = linkDescription(links);
  }
  if (game.combat?.started) updates["system.data.progress.current"] = getProgress(item).max;
  await item.update(updates, { fuzpInternal: true });
  const hp = actor.system.resources.hp;
  const heal = Math.min(crisisValue(actor), Math.max(0, hp.max - hp.value));
  if (heal > 0) await actor.modifyTokenAttribute("resources.hp", heal, true);
  const ko = actor.effects.filter((active) => active.statuses?.has("ko"));
  if (ko.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ko.map((entry) => entry.id));
  const awakenedName = combined ? (link.name || effectById(link.effectId)?.name || "联结之力") : condition.name;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<article class="fuzp-chat"><header><i class="fa-solid fa-burst"></i><div><strong>${escapeHtml(actor.name)} 的力量觉醒</strong><small>${escapeHtml(awakenedName)}</small></div></header><p>恢复了 ${heal} 点生命值。${game.combat?.started ? "零界命刻已立即填满。" : ""}</p></article>` });
}

export async function handleEffectSocket(payload) {
  const actor = payload.targetActorUuid ? await fromUuid(payload.targetActorUuid) : null;
  if (payload.action === "setSceneEffect" && actor && (actor.isOwner || game.user.isGM)) {
    await setSceneEffect(actor, payload.key, payload.value);
    return true;
  }
  if (payload.action === "clearClock" && actor && (actor.isOwner || game.user.isGM)) {
    await clearClock(actor, actor.items.get(payload.itemId));
    return true;
  }
  return false;
}
