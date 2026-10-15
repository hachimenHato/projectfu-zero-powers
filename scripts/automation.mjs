import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { batchClockIncrement, clearCombatantClocks, postFabulaConfirmation, requestClockIncrement } from "./clock.mjs";
import { awakenPower, clearShieldAtSourceTurn, onCalculateDamage, onCalculateExpense, onDamageEvent, onDamagePreCalculate, onPrepareCheck } from "./effects.mjs";
import { alliesOf, enemiesOf, escapeHtml, getCondition, isAutomationEnabled, isResponsibleFor, managedData, primaryZeroPower, sceneActors, turnKey } from "./utils.mjs";
import { AsyncHooks } from "../../../systems/projectfu/module/helpers/async-hooks.mjs";

const recentCompassion = new Map();
const recentFabula = new Map();

function automated() {
  return isAutomationEnabled();
}

async function onDamageCalculated(context) {
  if (!automated() || !game.combat?.started || Number(context.result) <= 0 || context.traits?.has("mind-point-loss")) return;
  const target = context.actor;
  const source = context.sourceActor;
  if (target?.type === "character" && source?.uuid !== target.uuid) {
    await requestClockIncrement(target, 1, "因非自身造成的生命值损失，零界命刻填充1格。", { source: "生命值损失" });
  }
  if (source?.type === "character" && getCondition(primaryZeroPower(source))?.id === "synergy" && Number(context.affinity) === -1) {
    batchClockIncrement(source, 1, "对具有弱点相性的生物造成伤害。", { source: "协同", key: `${turnKey(source)}:${context.sourceInfo?.itemUuid ?? "damage"}` });
  }
  const presentCharacters = sceneActors({ charactersOnly: true });
  const targetIsPresent = presentCharacters.some((candidate) => candidate.uuid === target?.uuid);
  for (const actor of targetIsPresent ? presentCharacters : []) {
    const power = primaryZeroPower(actor);
    const data = managedData(power);
    if (getCondition(power)?.id === "love" && data.loveActorUuid === target?.uuid && source?.uuid !== target.uuid) {
      await requestClockIncrement(actor, 1, `${target.name} 因非自身原因失去生命值。`, { source: "爱恋" });
    }
  }
}

async function onResource(event) {
  if (!automated() || !game.combat?.started) return;
  const source = event.source?.actor;
  if (!source || source.type !== "character") return;
  const allyUuids = new Set(alliesOf(source, { includeSelf: false }).map((actor) => actor.uuid));
  if (["hp", "mp"].includes(event.resource) && Number(event.amount) > 0 && event.targets?.some((target) => allyUuids.has(target.actor?.uuid))) {
    const power = primaryZeroPower(source);
    if (getCondition(power)?.id === "compassion") {
      const now = Date.now();
      const signature = `${event.item?.uuid ?? "resource"}:${event.origin ?? "none"}:${event.resource}`;
      const previous = recentCompassion.get(source.uuid);
      if (!previous || previous.signature !== signature || now - previous.time > 500) {
        recentCompassion.set(source.uuid, { signature, time: now });
        batchClockIncrement(source, 1, "为一名或多名盟友恢复了生命值或精神值。", { source: "怜悯", key: `${event.item?.uuid ?? "resource"}:${Math.floor(now / 500)}`, delay: 180 });
      }
    }
  }
  if (event.resource === "fp" && Number(event.amount) < 0) {
    const now = Date.now();
    if (now - (recentFabula.get(source.uuid) ?? 0) > 500) {
      recentFabula.set(source.uuid, now);
      await postFabulaConfirmation(source);
    }
  }
}

async function onCrisis(event) {
  if (!automated() || !game.combat?.started) return;
  const actor = event.actor;
  const power = primaryZeroPower(actor);
  if (getCondition(power)?.id !== "revenge") return;
  const sceneKey = `${canvas.scene?.id ?? "scene"}:${game.combat?.id ?? "combat"}`;
  if (actor.getFlag(MODULE_ID, "revengeScene") === sceneKey) return;
  if (actor.isOwner || game.user.isGM) await actor.setFlag(MODULE_ID, "revengeScene", sceneKey);
  await requestClockIncrement(actor, 3, "本场景中首次进入危机状态。", { source: "复仇" });
}

function hasCommanderOrVillain(actor) {
  return enemiesOf(actor).some((enemy) => enemy.type === "npc" && (Boolean(enemy.system?.villain?.value) || enemy.system?.rank?.value === "champion"));
}

function distinctEnemyStatuses(actor) {
  const result = new Set();
  for (const enemy of enemiesOf(actor)) {
    for (const id of ["dazed", "shaken", "slow", "weak", "enraged", "poisoned"]) {
      if (enemy.statuses?.has(id)) result.add(id);
    }
  }
  return result;
}

async function onCombat(event) {
  if (!automated()) return;
  if (event.type === "FU.StartOfCombat" && game.settings.get(MODULE_ID, SETTINGS.CLEAR_CLOCKS)) await clearCombatantClocks(event.combatants);
  if (event.type === "FU.EndOfCombat") {
    if (game.settings.get(MODULE_ID, SETTINGS.CLEAR_CLOCKS)) await clearCombatantClocks(event.combatants);
    for (const actor of new Map([...event.combatants].filter((entry) => entry.actor?.type === "character").map((entry) => [entry.actor.uuid, entry.actor])).values()) {
      if (!isResponsibleFor(actor) || !managedData(primaryZeroPower(actor)).loveNeedsNewCondition) continue;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<article class="fuzp-chat"><header><i class="fa-solid fa-heart-crack"></i><div><strong>${escapeHtml(actor.name)} 需要更换零界条件</strong><small>爱恋 · 场景结束</small></div></header><p>你见证了所爱之人的牺牲。依照规则，现在应为零界力量选择另一项条件。</p><footer><button type="button" data-fuzp-action="love-change-condition" data-actor-uuid="${actor.uuid}"><i class="fa-solid fa-shuffle"></i> 选择新条件</button></footer></article>`,
        flags: { [MODULE_ID]: { kind: "love-replacement", actorUuid: actor.uuid, usedActions: [] } },
      });
    }
  }
  if (event.type === "FU.StartOfTurn" && event.actor) {
    await clearShieldAtSourceTurn(event.actor);
    const power = primaryZeroPower(event.actor);
    if (getCondition(power)?.id === "disdain" && hasCommanderOrVillain(event.actor)) await requestClockIncrement(event.actor, 1, "回合开始时，场景中有至少一个反派或大将级敌人。", { source: "傲视" });
  }
  if (event.type === "FU.EndOfTurn" && event.actor) {
    const power = primaryZeroPower(event.actor);
    const statuses = distinctEnemyStatuses(event.actor);
    if (getCondition(power)?.id === "strategy" && enemiesOf(event.actor).length && statuses.size >= 2) await requestClockIncrement(event.actor, 1, `敌方合计受到${statuses.size}种不同异常状态影响。`, { source: "策略" });
  }
  Hooks.callAll(`${MODULE_ID}.refreshPanel`);
}

async function onDefeat(event) {
  if (!automated()) return;
  const actor = event.actor;
  const presentCharacters = sceneActors({ charactersOnly: true });
  const defeatedIsPresent = presentCharacters.some((candidate) => candidate.uuid === actor.uuid);
  for (const lover of defeatedIsPresent ? presentCharacters : []) {
    const power = primaryZeroPower(lover);
    const loveData = managedData(power);
    if (!isResponsibleFor(lover) || getCondition(power)?.id !== "love" || loveData.loveActorUuid !== actor.uuid) continue;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: lover }),
      content: `<article class="fuzp-chat"><header><i class="fa-solid fa-heart-crack"></i><div><strong>${escapeHtml(lover.name)} 的爱恋抉择</strong><small>${escapeHtml(actor.name)} 的生命值降为0</small></div></header><p>若所爱之人放弃抵抗，命刻填充1格；若其牺牲自己且你亲眼见证，命刻立即填满。请选择实际发生的结果，或忽略此卡。</p><footer><button type="button" data-fuzp-action="love-surrender" data-group="love-defeat" data-actor-uuid="${lover.uuid}" data-defeated-name="${escapeHtml(actor.name)}"><i class="fa-solid fa-flag"></i> 放弃抵抗（+1）</button><button type="button" data-fuzp-action="love-sacrifice" data-group="love-defeat" data-actor-uuid="${lover.uuid}" data-defeated-name="${escapeHtml(actor.name)}"><i class="fa-solid fa-heart"></i> 牺牲（填满）</button></footer></article>`,
      flags: { [MODULE_ID]: { kind: "love-defeat", actorUuid: lover.uuid, defeatedActorUuid: actor.uuid, usedActions: [] } },
    });
  }
  const data = managedData(primaryZeroPower(actor));
  if (!data || !["awakening", "combined"].includes(data.variant)) return;
  if (!isResponsibleFor(actor)) return;
  const canAwaken = data.variant === "awakening"
    ? !data.awakeningUsed
    : Boolean(data.links?.some((link) => !link.localAwakeningUsed));
  if (!canAwaken) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<article class="fuzp-chat"><header><i class="fa-solid fa-burst"></i><div><strong>${escapeHtml(actor.name)} 的觉醒时机</strong><small>生命值在冲突中降为0</small></div></header><p>依照“觉醒之力”，玩家可以选择觉醒，而非放弃抵抗或牺牲自己。</p><footer><button type="button" data-fuzp-action="awaken" data-actor-uuid="${actor.uuid}"><i class="fa-solid fa-star"></i> 选择觉醒</button></footer></article>`,
    flags: { [MODULE_ID]: { kind: "awakening", actorUuid: actor.uuid, usedActions: [] } },
  });
}

export function registerAutomationHooks() {
  Hooks.on("projectfu.pipelines.damage.postCalculate", onDamageCalculated);
  Hooks.on("projectfu.events.crisis", onCrisis);
  Hooks.on("projectfu.events.combat", onCombat);
  Hooks.on("projectfu.events.defeat", onDefeat);
  Hooks.on("projectfu.prepareCheck", (check, actor, item) => { if (automated()) onPrepareCheck(check, actor, item); });
  Hooks.on("projectfu.events.calculateDamage", (event) => { if (automated()) onCalculateDamage(event); });
  Hooks.on("projectfu.pipelines.damage.preCalculate", (context) => { if (automated()) onDamagePreCalculate(context); });

  // Project FU 4.16 dispatches these events through its await-aware hook bus,
  // not Foundry's global Hooks object. Registering them on Hooks silently did
  // nothing, which left free spell costs, post-resource conditions, and the
  // direct-damage element fallback inactive.
  AsyncHooks.on("projectfu.events.resource", onResource);
  AsyncHooks.on("projectfu.events.calculateExpense", (event) => { if (automated()) onCalculateExpense(event); });
  AsyncHooks.on("projectfu.events.damage", (event) => { if (automated()) onDamageEvent(event); });
}
