import { MODULE_ID, VARIANTS, ZERO_POWER_TYPE } from "./constants.mjs";
import { CONDITIONS, EFFECTS, conditionById, effectById } from "./data.mjs";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function paragraphs(text = "") {
  return String(text)
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

export function isZeroPower(item) {
  return item?.type === "optionalFeature" && item.system?.optionalType === ZERO_POWER_TYPE;
}

export function zeroPowers(actor) {
  return (actor?.items?.contents ?? Array.from(actor?.items ?? []))
    .filter(isZeroPower);
}

export function primaryZeroPower(actor) {
  const powers = zeroPowers(actor);
  // Project FU does not enforce a single embedded Zero Power. Prefer the one
  // configured by this module so collection re-sorting cannot silently switch
  // the combat panel back to an unmanaged/native draft.
  return powers.find((item) => managedData(item).managed) ?? powers[0] ?? null;
}

export function managedData(item) {
  return item?.getFlag?.(MODULE_ID, "data") ?? item?.flags?.[MODULE_ID]?.data ?? {};
}

export function getCondition(item) {
  const data = managedData(item);
  if (data.conditionId) return conditionById(data.conditionId);
  const name = item?.system?.data?.zeroTrigger?.value?.trim();
  return CONDITIONS.find((entry) => entry.name === name) ?? null;
}

export function getEffect(item, link = null) {
  const data = managedData(item);
  const id = link?.effectId ?? data.effectId;
  if (id) return effectById(id);
  const name = item?.system?.data?.zeroEffect?.value?.trim();
  return EFFECTS.find((entry) => entry.name === name) ?? null;
}

export function getProgress(item) {
  return item?.system?.data?.progress ?? { current: 0, max: 6, step: 1 };
}

export function clampClock(value, max) {
  return Math.max(0, Math.min(Number(max) || 0, Math.trunc(Number(value) || 0)));
}

export function clockUpdate(current, max, amount) {
  const before = clampClock(current, max);
  const after = clampClock(before + Number(amount || 0), max);
  return { before, after, applied: after - before };
}

export function progressSegments(current, max) {
  const length = Math.max(0, Math.trunc(Number(max) || 0));
  const filled = clampClock(current, length);
  return Array.from({ length }, (_, index) => ({ id: index + 1, filled: index < filled }));
}

export function actorLevel(actor) {
  return Number(actor?.system?.level?.value ?? actor?.system?.level ?? 0) || 0;
}

export function crisisValue(actor) {
  return Number(actor?.system?.resources?.hp?.crisisScore ?? Math.floor((actor?.system?.resources?.hp?.max ?? 0) / 2)) || 0;
}

export function isAutomationEnabled() {
  return Boolean(game.settings.get(MODULE_ID, "automationEnabled"));
}

export function configuredVariant() {
  return game.settings.get(MODULE_ID, "variantMode") ?? VARIANTS.STANDARD;
}

export function actorDisposition(actor) {
  const combatant = game.combat?.combatants?.find((entry) => entry.actor?.uuid === actor?.uuid);
  const placedToken = canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === actor?.uuid);
  return combatant?.token?.disposition ?? placedToken?.document?.disposition ?? actor?.prototypeToken?.disposition ?? 0;
}

export function sceneActors({ charactersOnly = false } = {}) {
  const actors = new Map();
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (!token.actor) continue;
    if (charactersOnly && token.actor.type !== "character") continue;
    actors.set(token.actor.uuid, token.actor);
  }
  if (game.combat?.started) {
    for (const combatant of game.combat.combatants) {
      if (!combatant.actor) continue;
      if (charactersOnly && combatant.actor.type !== "character") continue;
      actors.set(combatant.actor.uuid, combatant.actor);
    }
  }
  return [...actors.values()];
}

export function alliesOf(actor, { includeSelf = true, charactersOnly = false } = {}) {
  const disposition = actorDisposition(actor);
  return sceneActors({ charactersOnly }).filter((candidate) => {
    if (!includeSelf && candidate.uuid === actor.uuid) return false;
    return actorDisposition(candidate) === disposition;
  });
}

export function enemiesOf(actor) {
  const disposition = actorDisposition(actor);
  return sceneActors().filter((candidate) => candidate.uuid !== actor.uuid && actorDisposition(candidate) !== disposition);
}

export function selectedActors({ include = [] } = {}) {
  const result = new Map(include.filter(Boolean).map((actor) => [actor.uuid, actor]));
  for (const token of game.user?.targets ?? []) {
    if (token.actor) result.set(token.actor.uuid, token.actor);
  }
  return [...result.values()];
}

export function currentOwnedActor() {
  const controlled = (canvas?.tokens?.controlled ?? [])
    .map((token) => token.actor)
    .find((actor) => actor?.type === "character" && actor.isOwner && primaryZeroPower(actor));
  if (controlled) return controlled;
  const turnActor = game.combat?.combatant?.actor;
  if (turnActor?.type === "character" && turnActor.isOwner && primaryZeroPower(turnActor)) return turnActor;
  const assigned = game.user?.character;
  if (assigned?.type === "character" && assigned.isOwner && primaryZeroPower(assigned)) return assigned;
  return game.actors?.find((actor) => actor.type === "character" && actor.isOwner && primaryZeroPower(actor)) ?? null;
}

export function turnKey(actor) {
  const combat = game.combat;
  if (!combat?.started || combat.combatant?.actor?.uuid !== actor?.uuid) return null;
  const count = combat.currentRoundTurnsTaken?.filter?.((id) => id === combat.combatant.id)?.length ?? 0;
  return `${combat.id}:${combat.round}:${combat.combatant.id}:${count}`;
}

export function isResponsibleFor(actor) {
  const activeGM = game.users?.activeGM;
  if (activeGM) return activeGM.isSelf;
  const owners = (game.users?.filter?.((user) => user.active && actor?.testUserPermission?.(user, "OWNER")) ?? [])
    .sort((a, b) => a.id.localeCompare(b.id));
  return owners[0]?.isSelf ?? actor?.isOwner ?? false;
}

export function ruleItemDescription(kind, entry) {
  const amount = kind === "condition" ? `<p><strong>填充：</strong>${entry.variable ? "可变（每个弱点目标1格）" : `每次${entry.increment}格`}</p>` : "";
  const automation = `<p><strong>模组处理：</strong>${entry.automation}</p>`;
  return `${amount}${paragraphs(entry.description)}${automation}`;
}

export function entryFlags(kind, entry) {
  return {
    [MODULE_ID]: {
      entryKind: kind,
      entryId: entry.id,
      increment: entry.increment ?? null,
      automation: entry.automation,
    },
  };
}

export function itemEntry(item) {
  const flags = item?.flags?.[MODULE_ID] ?? {};
  if (!flags.entryKind || !flags.entryId) return null;
  return flags.entryKind === "condition" ? conditionById(flags.entryId) : effectById(flags.entryId);
}
