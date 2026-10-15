import { ZERO_POWER_IGNORE_AFFINITIES_TRAIT } from "./check-adjustments.mjs";

let apiPromise;

export async function getSystemApi() {
  apiPromise ??= Promise.all([
    import("/systems/projectfu/module/pipelines/damage-pipeline.mjs"),
    import("/systems/projectfu/module/pipelines/resource-pipeline.mjs"),
    import("/systems/projectfu/module/checks/damage-data.mjs"),
    import("/systems/projectfu/module/helpers/inline-helper.mjs"),
    import("/systems/projectfu/module/pipelines/effects.mjs"),
  ]).then(([damage, resource, damageData, inline, effects]) => ({
    DamagePipeline: damage.DamagePipeline,
    DamageRequest: damage.DamageRequest,
    ResourcePipeline: resource.ResourcePipeline,
    ResourceRequest: resource.ResourceRequest,
    DamageData: damageData.DamageData,
    InlineSourceInfo: inline.InlineSourceInfo,
    Effects: effects.Effects,
  }));
  return apiPromise;
}

export async function applyDamage(source, targets, type, amount, { ignoreAffinities = false } = {}) {
  const api = await getSystemApi();
  const sourceInfo = api.InlineSourceInfo.fromInstance(source);
  const damage = api.DamageData.construct(type, amount);
  const request = new api.DamageRequest(sourceInfo, targets, damage);
  // Project FU 4.16.1 returns early while resolving its built-in
  // `ignore-affinities` trait and leaves affinityMessage unset. The HP update
  // then succeeds, but rendering the damage chat card throws. Use a namespaced
  // marker and normalize the affinity during preCalculate instead.
  if (ignoreAffinities) request.addTraits(ZERO_POWER_IGNORE_AFFINITIES_TRAIT);
  return api.DamagePipeline.process(request);
}

export async function recoverResource(source, targets, resource, amount) {
  const api = await getSystemApi();
  const sourceInfo = api.InlineSourceInfo.fromInstance(source);
  const request = new api.ResourceRequest(sourceInfo, targets, resource, amount, false);
  return api.ResourcePipeline.processRecovery(request);
}

export async function ensureStatuses(source, targets, statusIds) {
  const { Effects, InlineSourceInfo } = await getSystemApi();
  const sourceInfo = InlineSourceInfo.fromInstance(source);
  for (const actor of targets) {
    for (const status of statusIds) {
      if (!actor.statuses?.has(status)) await Effects.createStatusEffect(actor, status, sourceInfo);
    }
  }
}

export async function removeStatuses(actor, statusIds) {
  const effects = actor.effects?.filter((effect) => statusIds.some((status) => effect.statuses?.has(status))) ?? [];
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map((effect) => effect.id));
}
