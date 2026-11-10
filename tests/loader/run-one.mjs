// 单条用例进程：只跑一条并打印 JSON，崩溃或超时由 run.mjs 记为这一条失败。
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";

const require = createRequire(import.meta.url);
const loader = require("../../js/loader.js");

const [mode, file] = process.argv.slice(2);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fsRead(path) {
  return { text: readFileSync(path, "utf8"), mtime: statSync(path).mtime.toISOString() };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main() {
  if (mode === "single" || mode === "io" || mode === "parse") {
    const results = await loader.loadAll([{ path: file }], { read: fsRead });
    print(results[0]);
    return;
  }
  if (mode === "batch") {
    const batch = loader.validateAll(readJson(file));
    print({ ok: batch.ok, results: batch.results, errors: batch.errors });
    return;
  }
  if (mode === "not-array") {
    const batch = loader.validateAll({});
    print({ ok: batch.ok, errors: batch.errors });
    return;
  }
  if (mode === "concurrent") {
    const inputs = [
      { path: "slow.json", id: 3 },
      { path: "fast.json", id: 1 },
      { path: "mid.json", id: 2 }
    ];
    const delays = { "slow.json": 80, "fast.json": 5, "mid.json": 40 };
    const read = (path) => new Promise((resolve) => {
      setTimeout(() => resolve(JSON.stringify({
        schemaVersion: 1,
        id: inputs.find((item) => item.path === path).id,
        name: path,
        spawn: { interval: 1000, speed: 1, count: 1 },
        goal: { waves: 1 }
      })), delays[path]);
    });
    const results = await loader.loadAll(inputs, { read, concurrency: 3 });
    print({ ok: results.every((result) => result.ok), ids: results.map((result) => result.data && result.data.id), paths: results.map((result) => result.path) });
    return;
  }
  throw new Error(`unknown mode: ${mode}`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exit(2);
});
