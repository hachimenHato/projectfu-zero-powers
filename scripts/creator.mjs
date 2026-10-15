import { CALAMITY_STATUSES, DAMAGE_TYPES, MODULE_ID, VARIANTS, ZERO_POWER_TYPE } from "./constants.mjs";
import { CONDITIONS, EFFECTS, conditionById, effectById, randomZeroPowerName } from "./data.mjs";
import { configuredVariant, escapeHtml, managedData, paragraphs, primaryZeroPower, zeroPowers } from "./utils.mjs";

function options(entries, selected, disabled = new Set()) {
  return entries.map((entry) => `<option value="${entry.id}" ${entry.id === selected ? "selected" : ""} ${disabled.has(entry.id) ? "disabled" : ""}>${escapeHtml(entry.name)}${entry.increment ? `（${entry.variable ? "可变" : `+${entry.increment}`}）` : ""}</option>`).join("");
}

function usedEntryIds(kind, actor) {
  const result = new Set();
  for (const other of game.actors.filter((candidate) => candidate.type === "character" && candidate.uuid !== actor.uuid)) {
    for (const item of zeroPowers(other)) {
      const data = managedData(item);
      const id = kind === "condition" ? data.conditionId : data.effectId;
      if (id) result.add(id);
      const value = kind === "condition" ? item.system?.data?.zeroTrigger?.value : item.system?.data?.zeroEffect?.value;
      const entry = (kind === "condition" ? CONDITIONS : EFFECTS).find((candidate) => candidate.name === value);
      if (entry) result.add(entry.id);
    }
  }
  return result;
}

function readForm(dialog, randomName) {
  const root = dialog.element;
  const get = (name) => root.querySelector(`[name="${name}"]`);
  const effectId = get("effectId")?.value ?? EFFECTS[0].id;
  return {
    name: randomName ? randomZeroPowerName(effectId) : get("name")?.value.trim(),
    conditionId: get("conditionId")?.value ?? CONDITIONS[0].id,
    effectId,
    loveActorUuid: get("loveActorUuid")?.value ?? "",
    partnerUuid: get("partnerUuid")?.value ?? "",
    damageTypeA: get("damageTypeA")?.value ?? "air",
    damageTypeB: get("damageTypeB")?.value ?? "fire",
    calamityDamageType: get("calamityDamageType")?.value ?? "fire",
    calamityStatusA: get("calamityStatusA")?.value ?? "dazed",
    calamityStatusB: get("calamityStatusB")?.value ?? "weak",
  };
}

function syncCreatorParameters(_event, dialog) {
  const wizard = dialog.element.querySelector(".fuzp-wizard");
  if (!wizard) return;
  if (!wizard.dataset.parameterBinding) {
    wizard.dataset.parameterBinding = "true";
    wizard.addEventListener("change", () => syncCreatorParameters(null, dialog));
  }
  const conditionId = wizard.querySelector('[name="conditionId"]')?.value ?? "";
  const effectId = wizard.querySelector('[name="effectId"]')?.value ?? "";
  const visibility = {
    love: conditionId === "love",
    element: effectId === "element",
    calamity: effectId === "calamity",
  };
  const parameterPanel = wizard.querySelector(".fuzp-parameter-panel");
  const hasParameters = Object.values(visibility).some(Boolean);
  if (parameterPanel) {
    parameterPanel.hidden = !hasParameters;
    if (hasParameters) parameterPanel.open = true;
  }
  for (const section of wizard.querySelectorAll("[data-fuzp-parameter]")) {
    const shown = Boolean(visibility[section.dataset.fuzpParameter]);
    section.hidden = !shown;
    for (const control of section.querySelectorAll("input, select, textarea")) control.required = shown;
  }
  const linked = wizard.dataset.linked === "true";
  const partner = wizard.querySelector('[name="partnerUuid"]');
  if (partner) partner.required = linked;
  const invalid = (linked && !partner?.value)
    || (visibility.love && !wizard.querySelector('[name="loveActorUuid"]')?.value);
  for (const action of ["save", "random"]) {
    const button = dialog.element.querySelector(`[data-action="${action}"]`);
    if (button) button.disabled = invalid;
  }
}

function actorOptions(actor, selected, label = "不选择") {
  const actors = game.actors.filter((candidate) => candidate.type === "character" && candidate.uuid !== actor.uuid);
  return [`<option value="">${label}</option>`, ...actors.map((candidate) => `<option value="${candidate.uuid}" ${candidate.uuid === selected ? "selected" : ""}>${escapeHtml(candidate.name)}</option>`)].join("");
}

function configurationFromForm(data) {
  const pair = data.damageTypeA === data.damageTypeB
    ? [data.damageTypeA, DAMAGE_TYPES.find((entry) => entry.id !== data.damageTypeA)?.id ?? "fire"]
    : [data.damageTypeA, data.damageTypeB];
  const statuses = data.calamityStatusA === data.calamityStatusB
    ? [data.calamityStatusA, CALAMITY_STATUSES.find((entry) => entry.id !== data.calamityStatusA)?.id ?? "weak"]
    : [data.calamityStatusA, data.calamityStatusB];
  return {
    elementTypes: pair,
    activeElementType: pair[0],
    calamityDamageType: data.calamityDamageType,
    calamityStatuses: statuses,
  };
}

export function linkDescription(links) {
  if (!links.length) return "<p>尚未建立联结。</p>";
  return links.map((link) => {
    const partner = fromUuidSync(link.partnerUuid);
    const effect = effectById(link.effectId);
    return `<p><strong>${escapeHtml(partner?.name ?? "未知角色")}</strong>：${escapeHtml(link.name || effect?.name || "尚未觉醒")}${effect ? `<br>${escapeHtml(effect.description)}` : ""}</p>`;
  }).join("");
}

export async function syncLinkToPartner(sourceActor, link) {
  if (!link.partnerUuid) return;
  game.socket.emit(`module.${MODULE_ID}`, {
    action: "syncLink",
    targetActorUuid: link.partnerUuid,
    sourceActorUuid: sourceActor.uuid,
    link,
  });
  const partner = fromUuidSync(link.partnerUuid);
  if (partner?.isOwner) await receiveLinkSync(partner, sourceActor.uuid, link);
}

export async function receiveLinkSync(actor, sourceActorUuid, incoming) {
  if (!actor?.isOwner && !game.user.isGM) return;
  const item = primaryZeroPower(actor);
  const mirror = (previous = {}) => ({
    ...incoming,
    partnerUuid: sourceActorUuid,
    // Each character may awaken once for each partner. The shared effect is
    // mirrored, but the partner's own use of that awakening is not.
    localAwakeningUsed: Boolean(previous.localAwakeningUsed),
  });
  const itemData = managedData(item);
  const activeVariant = configuredVariant();
  const acceptsLiveLink = itemData.managed
    && itemData.variant === activeVariant
    && [VARIANTS.LINKED, VARIANTS.COMBINED].includes(activeVariant);
  // Never overwrite an unmanaged FU Zero Power or a power still configured
  // for another variant. Hold the link until this actor explicitly saves the
  // creator in the matching linked mode.
  if (!item || !acceptsLiveLink) {
    const pending = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "pendingLinks") ?? []);
    const index = pending.findIndex((entry) => entry.partnerUuid === sourceActorUuid);
    const mirrored = mirror(index >= 0 ? pending[index] : {});
    if (index >= 0) pending[index] = mirrored;
    else pending.push(mirrored);
    await actor.setFlag(MODULE_ID, "pendingLinks", pending);
    return;
  }
  const data = foundry.utils.deepClone(managedData(item));
  const links = data.links ?? [];
  const index = links.findIndex((entry) => entry.partnerUuid === sourceActorUuid);
  const mirrored = mirror(index >= 0 ? links[index] : {});
  if (index >= 0) links[index] = mirrored;
  else links.push(mirrored);
  data.links = links;
  await item.update({
    [`flags.${MODULE_ID}.data`]: data,
    "system.data.zeroEffect.value": links.length === 1 ? (mirrored.name || effectById(mirrored.effectId)?.name || "联结之力") : `联结之力（${links.length}项）`,
    "system.data.zeroEffect.description": linkDescription(links),
  }, { fuzpInternal: true });
}

async function savePower(actor, form) {
  const variant = configuredVariant();
  const existing = primaryZeroPower(actor);
  const oldData = existing ? foundry.utils.deepClone(managedData(existing)) : {};
  const awakeningOnly = variant === VARIANTS.AWAKENING;
  const linked = variant === VARIANTS.LINKED || variant === VARIANTS.COMBINED;
  const combined = variant === VARIANTS.COMBINED;
  const condition = awakeningOnly ? null : conditionById(form.conditionId);
  const effect = combined ? null : effectById(form.effectId);
  const config = configurationFromForm(form);
  const pendingLinks = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "pendingLinks") ?? []);
  let links = foundry.utils.deepClone(oldData.links ?? []);
  for (const pending of pendingLinks) {
    const index = links.findIndex((entry) => entry.partnerUuid === pending.partnerUuid);
    if (index < 0) links.push(pending);
    else links[index] = {
      ...links[index],
      ...pending,
      localAwakeningUsed: Boolean(links[index].localAwakeningUsed || pending.localAwakeningUsed),
    };
  }
  let link;
  if (linked && form.partnerUuid) {
    const index = links.findIndex((entry) => entry.partnerUuid === form.partnerUuid);
    const previous = index >= 0 ? links[index] : {};
    link = {
      ...previous,
      partnerUuid: form.partnerUuid,
      effectId: combined ? (previous.effectId ?? null) : form.effectId,
      effectConfig: combined && previous.effectId ? (previous.effectConfig ?? config) : config,
      name: combined ? (previous.name ?? "") : (form.name || randomZeroPowerName(form.effectId)),
      awakened: combined ? Boolean(previous.awakened) : true,
      localAwakeningUsed: combined ? Boolean(previous.localAwakeningUsed) : undefined,
    };
    if (index >= 0) links[index] = link;
    else links.push(link);
  }
  const name = linked && existing ? existing.name : (form.name || randomZeroPowerName(form.effectId));
  const max = linked ? 4 : 6;
  const managed = {
    ...oldData,
    managed: true,
    variant,
    conditionId: condition?.id ?? null,
    effectId: linked ? null : effect?.id ?? (awakeningOnly ? form.effectId : null),
    loveActorUuid: condition?.id === "love" ? form.loveActorUuid : "",
    effectConfig: config,
    awakened: awakeningOnly ? Boolean(oldData.awakened) : (combined ? Boolean(oldData.awakened || links.some((entry) => entry.awakened)) : true),
    awakeningUsed: Boolean(oldData.awakeningUsed),
    links,
  };
  const effectValue = linked
    ? (links.length === 1 ? (links[0].name || effectById(links[0].effectId)?.name || "尚未觉醒") : `联结之力（${links.length}项）`)
    : effect?.name ?? effectById(form.effectId)?.name ?? "";
  const effectDescription = linked ? linkDescription(links) : paragraphs(effectById(form.effectId)?.description ?? "");
  const itemData = {
    name,
    type: "optionalFeature",
    img: "icons/magic/symbols/rune-sigil-purple.webp",
    system: {
      optionalType: ZERO_POWER_TYPE,
      summary: { value: "零界力量" },
      data: {
        hasClock: { value: true },
        progress: { name: "零界命刻", id: "zeroPower", current: existing?.system?.data?.progress?.current ?? 0, max, step: 1, enabled: true, style: "clock" },
        zeroTrigger: {
          value: condition?.name ?? (awakeningOnly ? "尚未觉醒" : ""),
          description: condition ? paragraphs(condition.description) : "<p>依照“觉醒之力”规则，在觉醒时选择与事件相符的零界条件。</p>",
        },
        zeroEffect: { value: effectValue, description: effectDescription },
      },
    },
    flags: {
      projectfu: { favorite: true },
      [MODULE_ID]: { data: managed },
    },
  };
  let item;
  if (existing) {
    await existing.update({
      name: itemData.name,
      img: itemData.img,
      system: itemData.system,
      "flags.projectfu.favorite": true,
      [`flags.${MODULE_ID}.data`]: managed,
    }, { fuzpInternal: true });
    item = existing;
  } else {
    [item] = await actor.createEmbeddedDocuments("Item", [itemData], { fuzpInternal: true });
  }
  if (pendingLinks.length) await actor.unsetFlag(MODULE_ID, "pendingLinks");
  if (link) await syncLinkToPartner(actor, link);
  ui.notifications.info(`已为 ${actor.name} ${existing ? "更新" : "创建"}零界力量“${name}”。`);
  return item;
}

export async function openCreator(actor) {
  if (!actor?.isOwner) return ui.notifications.warn("你没有编辑该角色的权限。");
  const existing = primaryZeroPower(actor);
  const current = existing ? managedData(existing) : {};
  const variant = configuredVariant();
  const linked = variant === VARIANTS.LINKED || variant === VARIANTS.COMBINED;
  const usedConditions = usedEntryIds("condition", actor);
  const usedEffects = variant === VARIANTS.STANDARD || variant === VARIANTS.AWAKENING ? usedEntryIds("effect", actor) : new Set();
  const damageOptions = (selected) => DAMAGE_TYPES.map((entry) => `<option value="${entry.id}" ${entry.id === selected ? "selected" : ""}>${entry.name}</option>`).join("");
  const statusOptions = (selected) => CALAMITY_STATUSES.map((entry) => `<option value="${entry.id}" ${entry.id === selected ? "selected" : ""}>${entry.name}</option>`).join("");
  const selectedLink = current.links?.[0] ?? {};
  const cfg = (linked ? selectedLink.effectConfig : current.effectConfig) ?? {};
  const content = `
    <div class="fuzp-wizard standard-form" data-linked="${linked}">
      <div class="fuzp-wizard-hero"><i class="fa-solid fa-star-and-crescent"></i><div><strong>${escapeHtml(actor.name)}</strong><small>${variant === VARIANTS.STANDARD ? "标准零界力量" : variant === VARIANTS.AWAKENING ? "觉醒之力" : variant === VARIANTS.LINKED ? "联结之力" : "觉醒＋联结"}</small></div></div>
      <label class="form-group"><span>${linked ? "当前联结的力量名称" : "零界力量名称"}</span><input name="name" value="${escapeHtml(linked ? (selectedLink.name ?? "") : (existing?.name ?? ""))}" placeholder="留空后点击“随机命名并保存”"></label>
      ${variant !== VARIANTS.AWAKENING ? `<label class="form-group"><span>零界条件</span><select name="conditionId">${options(CONDITIONS, current.conditionId, usedConditions)}</select></label>` : `<p class="hint fuzp-rule-note">觉醒之力在创建时只选择效果；条件将在觉醒时选择。</p>`}
      ${linked ? `<label class="form-group"><span>联结角色</span><select name="partnerUuid">${actorOptions(actor, selectedLink.partnerUuid, "请选择另一位玩家角色")}</select></label>` : ""}
      ${variant !== VARIANTS.COMBINED ? `<label class="form-group"><span>零界效果</span><select name="effectId">${options(EFFECTS, selectedLink.effectId ?? current.effectId, usedEffects)}</select></label>` : `<input type="hidden" name="effectId" value="strike"><p class="hint fuzp-rule-note">组合变体依照规则先选择条件；每一对联结的效果在觉醒时决定。</p>`}
      <details class="fuzp-parameter-panel" hidden><summary>爱恋与效果参数</summary>
        <label class="form-group" data-fuzp-parameter="love" hidden><span>爱恋绑定角色 <b class="fuzp-required">必填</b></span><select name="loveActorUuid">${actorOptions(actor, current.loveActorUuid, "请选择爱恋绑定角色")}</select></label>
        <div class="form-group" data-fuzp-parameter="element" hidden><span>零界元素（两种） <b class="fuzp-required">必填</b></span><div class="form-fields"><select name="damageTypeA">${damageOptions(cfg.elementTypes?.[0])}</select><select name="damageTypeB">${damageOptions(cfg.elementTypes?.[1] ?? "fire")}</select></div></div>
        <div class="form-group" data-fuzp-parameter="calamity" hidden><span>零界灾厄 <b class="fuzp-required">必填</b></span><div class="form-fields"><select name="calamityDamageType">${damageOptions(cfg.calamityDamageType)}</select><select name="calamityStatusA">${statusOptions(cfg.calamityStatuses?.[0])}</select><select name="calamityStatusB">${statusOptions(cfg.calamityStatuses?.[1] ?? "weak")}</select></div></div>
      </details>
      ${linked && current.links?.length ? `<p class="hint">再次保存不同的联结角色会追加一对联结；选择已有角色则更新该联结。</p>` : ""}
    </div>`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: existing ? "配置零界力量" : "创建零界力量", icon: "fa-solid fa-star-and-crescent" },
    classes: ["fuzp-dialog"],
    position: { width: 610 },
    content,
    buttons: [
      { action: "save", label: "保存", icon: "fa-solid fa-floppy-disk", callback: (_event, _button, dialog) => readForm(dialog, false) },
      { action: "random", label: "随机命名并保存", icon: "fa-solid fa-dice", default: true, callback: (_event, _button, dialog) => readForm(dialog, true) },
      { action: "cancel", label: "取消", icon: "fa-solid fa-xmark", callback: () => null },
    ],
    rejectClose: false,
    modal: true,
    render: syncCreatorParameters,
  });
  if (!result) return null;
  if (linked && !result.partnerUuid) return ui.notifications.warn("联结之力必须选择另一位玩家角色。");
  if (result.conditionId === "love" && !result.loveActorUuid) return ui.notifications.warn("爱恋条件必须绑定另一位玩家角色。");
  return savePower(actor, result);
}

export async function repairManagedPowerPresentation() {
  if (game.users?.activeGM && !game.user.isGM) return;
  for (const actor of game.actors ?? []) {
    for (const item of zeroPowers(actor)) {
      if (!managedData(item).managed || (!item.isOwner && !game.user.isGM)) continue;
      const update = {};
      if (item.system?.data?.progress?.style !== "clock") update["system.data.progress.style"] = "clock";
      if (!item.getFlag("projectfu", "favorite")) update["flags.projectfu.favorite"] = true;
      if (Object.keys(update).length) await item.update(update, { fuzpInternal: true });
    }
  }
}

export async function applyEntryToPower(power, sourceItem) {
  const kind = sourceItem?.flags?.[MODULE_ID]?.entryKind;
  const id = sourceItem?.flags?.[MODULE_ID]?.entryId;
  const entry = kind === "condition" ? conditionById(id) : effectById(id);
  if (!power?.isOwner || !entry) return false;
  const update = kind === "condition" ? {
    "system.data.zeroTrigger.value": entry.name,
    "system.data.zeroTrigger.description": paragraphs(entry.description),
    [`flags.${MODULE_ID}.data.conditionId`]: entry.id,
  } : {
    "system.data.zeroEffect.value": entry.name,
    "system.data.zeroEffect.description": paragraphs(entry.description),
    [`flags.${MODULE_ID}.data.effectId`]: entry.id,
  };
  await power.update(update, { fuzpInternal: true });
  ui.notifications.info(`已将“${entry.name}”填入 ${power.name}。`);
  return true;
}
