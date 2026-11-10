#!/usr/bin/env node
// 存档迁移脚本：node scripts/migrate-save.mjs <input.json> [output.json]
// 先写临时文件再 rename 原子替换；对不上新关卡的旧条目标失效、不删除。
import { createRequire } from "node:module";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const save = require("../js/save.js");

function usage() {
  console.log("usage: node scripts/migrate-save.mjs <input.json> [output.json] [--map]");
  console.log("       node scripts/migrate-save.mjs --map");
}

function printMap() {
  console.log("旧 ID -> 新 ID");
  Object.keys(save.ID_MAP).forEach((oldId) => {
    console.log(`  ${oldId} -> ${save.ID_MAP[oldId]}`);
  });
}

function writeAtomic(target, text) {
  const temp = join(dirname(target), `.${Date.now()}.${process.pid}.migrate.tmp`);
  writeFileSync(temp, text, "utf8");
  try {
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}
if (args.includes("--map")) {
  printMap();
  if (args.length === 1) process.exit(0);
}

const files = args.filter((arg) => !arg.startsWith("--"));
if (files.length === 0) {
  usage();
  process.exit(2);
}

const input = resolve(files[0]);
if (!existsSync(input)) {
  console.error(`存档不存在：${input}`);
  process.exit(2);
}

let raw;
try {
  raw = JSON.parse(readFileSync(input, "utf8"));
} catch (error) {
  console.error(`存档不是合法 JSON：${error.message}`);
  process.exit(2);
}

const result = save.migrateSave(raw);
const output = resolve(files[1] || input);
writeAtomic(output, `${JSON.stringify(result.save, null, 2)}\n`);

console.log(`已迁移到存档 v${save.NEW_SAVE_VERSION}：${output}`);
console.log(`  迁移条目 ${result.migrated} 个`);
if (result.invalidated.length) console.log(`  标为失效（新关卡不存在）：${result.invalidated.join(", ")}`);
if (result.unmatched.length) console.log(`  无映射、原样保留：${result.unmatched.join(", ")}`);
if (result.problem) console.log(`  提示：${result.problem}`);
if (!result.changed) console.log("  存档已是 2.0，未改动");
