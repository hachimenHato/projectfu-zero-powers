export const ZERO_POWER_BONUS_LABEL = "零界力量";
export const ZERO_ELEMENT_BONUS_LABEL = "零界元素";
export const ZERO_POWER_IGNORE_AFFINITIES_TRAIT = "fuzp-ignore-affinities";
export const ZERO_ELEMENT_IGNORE_TRAITS = Object.freeze([
  "ignore-resistances",
  "ignore-immunities",
  "ignore-absorption",
]);

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function damageModifiers(damage) {
  if (!damage) return [];
  if (Array.isArray(damage.rawModifiers)) return damage.rawModifiers;
  if (Array.isArray(damage._modifiers)) return damage._modifiers;
  return [];
}

export function hasDamageModifier(damage, label) {
  return damageModifiers(damage).some((modifier) => modifier?.label === label);
}

export function addCheckModifier(check, label, value) {
  const amount = numeric(value);
  if (!amount) return false;
  check.modifiers ??= [];
  if (check.modifiers.some((modifier) => modifier?.label === label)) return false;
  check.modifiers.push({ label, value: amount });
  return true;
}

export function addDamageModifier(damage, label, value) {
  const amount = numeric(value);
  if (!damage || !amount || hasDamageModifier(damage, label)) return false;
  if (typeof damage.addModifier === "function") damage.addModifier(label, amount);
  else {
    damage._modifiers ??= [];
    damage._modifiers.push({ label, amount, value: amount, types: [], enabled: true });
  }
  return true;
}

export function applyElementToCheck(check, activeType, bonus = 5) {
  const damage = check?.additionalData?.damage;
  if (!damage || !activeType) return false;
  damage.type = activeType;
  addDamageModifier(damage, ZERO_ELEMENT_BONUS_LABEL, bonus);
  const traits = (check.additionalData.traits ??= []);
  for (const trait of ZERO_ELEMENT_IGNORE_TRAITS) {
    if (!traits.includes(trait)) traits.push(trait);
  }
  return true;
}

export function enforceNormalAffinity(context) {
  if (!context?.traits?.has?.(ZERO_POWER_IGNORE_AFFINITIES_TRAIT)) return false;
  context.affinity = 0;
  context.affinityMessage = "FU.ChatApplyDamageNormal";
  context.modifiers?.delete?.("affinity");
  return true;
}
