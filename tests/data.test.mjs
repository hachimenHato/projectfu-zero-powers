import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_NAMES, CONDITIONS, EFFECTS, ORIGIN_NAMES, randomZeroPowerName } from "../scripts/data.mjs";
import { clockUpdate, progressSegments } from "../scripts/utils.mjs";
import { addCheckModifier, addDamageModifier, applyElementToCheck, enforceNormalAffinity, ZERO_ELEMENT_IGNORE_TRAITS, ZERO_POWER_IGNORE_AFFINITIES_TRAIT } from "../scripts/check-adjustments.mjs";

test("rule compendium contains every printed condition and effect", () => {
  assert.equal(CONDITIONS.length, 7);
  assert.equal(EFFECTS.length, 11);
  assert.deepEqual(CONDITIONS.map((entry) => entry.increment), [1, 1, 1, 3, 2, 1, 1]);
  assert.equal(new Set(CONDITIONS.map((entry) => entry.id)).size, CONDITIONS.length);
  assert.equal(new Set(EFFECTS.map((entry) => entry.id)).size, EFFECTS.length);
  assert.deepEqual(CONDITIONS.map((entry) => entry.name), ["怜悯", "傲视", "爱恋", "复仇", "连锁", "策略", "协同"]);
  assert.deepEqual(EFFECTS.map((entry) => entry.name), ["零界闪击", "零界机遇", "零界消耗", "零界元素", "零界极限", "零界魔法", "零界目标", "零界疗愈", "零界灾厄", "零界护盾", "零界铁三角"]);
});

test("all naming columns match their printed die sizes", () => {
  for (const entries of Object.values(ACTION_NAMES)) assert.equal(entries.length, 20);
  for (const group of Object.values(ORIGIN_NAMES)) assert.equal(group.entries.length, 10);
});

test("random name is deterministic with an injected random source", () => {
  assert.equal(randomZeroPowerName("strike", () => 0), "灵巧噬咬");
  assert.equal(randomZeroPowerName("shield", () => 0), "灵巧屏障");
});

test("clock updates clamp and report the actually applied amount", () => {
  assert.deepEqual(clockUpdate(5, 6, 3), { before: 5, after: 6, applied: 1 });
  assert.deepEqual(clockUpdate(1, 4, -3), { before: 1, after: 0, applied: -1 });
});

test("compact clock lights exactly one wedge per filled segment", () => {
  assert.deepEqual(progressSegments(3, 6), [
    { id: 1, filled: true },
    { id: 2, filled: true },
    { id: 3, filled: true },
    { id: 4, filled: false },
    { id: 5, filled: false },
    { id: 6, filled: false },
  ]);
  assert.equal(progressSegments(9, 6).filter((segment) => segment.filled).length, 6);
});

test("one-shot accuracy and damage bonuses are applied once", () => {
  const check = { modifiers: [], additionalData: { damage: { _modifiers: [] } } };
  assert.equal(addCheckModifier(check, "零界力量", 5), true);
  assert.equal(addCheckModifier(check, "零界力量", 5), false);
  assert.deepEqual(check.modifiers, [{ label: "零界力量", value: 5 }]);
  assert.equal(addDamageModifier(check.additionalData.damage, "零界力量", 20), true);
  assert.equal(addDamageModifier(check.additionalData.damage, "零界力量", 20), false);
  assert.equal(check.additionalData.damage._modifiers[0].amount, 20);
});

test("zero element rewrites damage and adds its bonus and affinity bypass traits", () => {
  const check = { modifiers: [], additionalData: { damage: { type: "physical", _modifiers: [] }, traits: ["attack"] } };
  assert.equal(applyElementToCheck(check, "fire"), true);
  assert.equal(check.additionalData.damage.type, "fire");
  assert.equal(check.additionalData.damage._modifiers[0].amount, 5);
  for (const trait of ZERO_ELEMENT_IGNORE_TRAITS) assert.ok(check.additionalData.traits.includes(trait));
  applyElementToCheck(check, "ice");
  assert.equal(check.additionalData.damage.type, "ice");
  assert.equal(check.additionalData.damage._modifiers.length, 1);
});

test("direct HP loss bypasses affinities without Project FU's broken aggregate trait", () => {
  const context = {
    affinity: -1,
    affinityMessage: "FU.ChatApplyDamageVulnerable",
    traits: new Set([ZERO_POWER_IGNORE_AFFINITIES_TRAIT]),
    modifiers: new Map([["affinity", 2], ["shield", 0.5]]),
  };
  assert.equal(enforceNormalAffinity(context), true);
  assert.equal(context.affinity, 0);
  assert.equal(context.affinityMessage, "FU.ChatApplyDamageNormal");
  assert.equal(context.modifiers.has("affinity"), false);
  assert.equal(context.modifiers.get("shield"), 0.5);
});
