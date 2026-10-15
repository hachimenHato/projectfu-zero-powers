import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ACTION_NAMES, CONDITIONS, EFFECTS, ORIGIN_NAMES } from "./data.mjs";
import { MODULE_ID } from "./constants.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const foundryApp = process.env.FOUNDRY_APP_PATH;
if (!foundryApp) {
  throw new Error("Set FOUNDRY_APP_PATH to your Foundry resources/app directory before rebuilding compendia.");
}
const require = createRequire(import.meta.url);
const { ClassicLevel } = require(path.join(foundryApp, "node_modules", "classic-level"));

function idFor(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function stats() {
  return {
    coreVersion: "13.351",
    systemId: "projectfu",
    systemVersion: "4.16.1",
    createdTime: 1788390000000,
    modifiedTime: 1788390000000,
    lastModifiedBy: null,
    compendiumSource: null,
    duplicateSource: null,
    exportSource: null,
  };
}

function html(text) {
  return `<p>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`;
}

function ruleItem(kind, entry) {
  const id = idFor(`${kind}:${entry.id}`);
  const amount = kind === "condition" ? `<p><strong>填充格数：</strong>${entry.variable ? "可变（每个弱点目标1格）" : `每次${entry.increment}格`}</p>` : "";
  return {
    _id: id,
    name: entry.name,
    type: "rule",
    img: kind === "condition" ? "icons/magic/symbols/rune-sigil-rough-white-teal.webp" : "icons/magic/symbols/runes-star-pentagon-orange-purple.webp",
    system: {
      description: `${amount}${html(entry.description)}`,
      summary: { value: kind === "condition" ? "零界条件" : "零界效果" },
      showTitleCard: { value: true },
      source: "《最终物语：史诗奇幻图鉴》125—127页",
      fuid: `fuzp-${kind}-${entry.id}`,
    },
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 2 },
    flags: {
      [MODULE_ID]: {
        entryKind: kind,
        entryId: entry.id,
        increment: entry.increment ?? null,
        automation: entry.automation,
      },
    },
    _stats: stats(),
  };
}

async function writeItemPack(name, kind, entries) {
  const destination = path.join(root, "packs", name);
  await fs.rm(destination, { recursive: true, force: true });
  const db = new ClassicLevel(destination, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  for (const entry of entries) {
    const item = ruleItem(kind, entry);
    await db.put(`!items!${item._id}`, item);
  }
  await db.close();
}

function tableDocument(key, name, entries, formula) {
  const id = idFor(`table:${key}`);
  const resultIds = entries.map((_, index) => idFor(`result:${key}:${index + 1}`));
  return {
    table: {
      _id: id,
      name,
      img: "icons/svg/d20-grey.svg",
      description: `<p>《最终物语：史诗奇幻图鉴》零界力量命名表。</p>`,
      results: resultIds,
      replacement: true,
      displayRoll: true,
      folder: null,
      ownership: { default: 2 },
      flags: { [MODULE_ID]: { namingTable: key } },
      _stats: stats(),
      formula,
      sort: 0,
    },
    results: entries.map((description, index) => ({
      type: "text",
      weight: 1,
      range: [index + 1, index + 1],
      drawn: false,
      _id: resultIds[index],
      flags: {},
      img: "icons/svg/d20-grey.svg",
      _stats: stats(),
      description,
      name: "",
    })),
  };
}

async function writeTables() {
  const destination = path.join(root, "packs", "zero-naming-tables");
  await fs.rm(destination, { recursive: true, force: true });
  const db = new ClassicLevel(destination, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  const tables = [
    ...Object.entries(ACTION_NAMES).map(([key, entries]) => tableDocument(`action-${key}`, `行动·${key === "offensive" ? "进攻型" : key === "defensive" ? "防御型" : "强化型"}`, entries, "1d20")),
    ...Object.entries(ORIGIN_NAMES).map(([key, group]) => tableDocument(`origin-${key}`, `起源·${group.name}`, group.entries, "1d10")),
  ];
  for (const { table, results } of tables) {
    await db.put(`!tables!${table._id}`, table);
    for (const result of results) await db.put(`!tables.results!${table._id}.${result._id}`, result);
  }
  await db.close();
}

await writeItemPack("zero-conditions", "condition", CONDITIONS);
await writeItemPack("zero-effects", "effect", EFFECTS);
await writeTables();
console.log(`Built ${CONDITIONS.length} conditions, ${EFFECTS.length} effects, and 9 naming tables.`);
