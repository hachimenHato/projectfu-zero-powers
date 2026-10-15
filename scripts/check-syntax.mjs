import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = fs.readdirSync(path.join(root, "scripts")).filter((name) => name.endsWith(".mjs"));
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, "scripts", file)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Syntax checked ${files.length} module files.`);
