#!/usr/bin/env node
// 关卡验证运行器：node tests/loader/run.mjs [--self-check]
// 单条 10 秒超时；超时或崩溃只记这一条失败，其余照常跑完再汇总；一条不过退出码为 1（卡合 main）。
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONE = join(HERE, "run-one.mjs");
const CASE_TIMEOUT_MS = 10_000;

function runProcess(command, args, timeoutMs) {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveResult({ code, stdout, stderr, timedOut });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveResult({ code: -1, stdout, stderr: String(error), timedOut });
    });
  });
}

function firstError(result) {
  if (Array.isArray(result.errors) && result.errors.length) return result.errors[0];
  return {};
}

function compare(result, expect) {
  const problems = [];
  if (expect.ok !== undefined && result.ok !== expect.ok) problems.push(`ok ${result.ok} != ${expect.ok}`);
  if (expect.ok === false) {
    const error = firstError(result);
    const path = error.path !== undefined ? error.path : result.path;
    const code = result.code !== undefined ? result.code : error.code;
    if (expect.path !== undefined && path !== expect.path) problems.push(`path ${JSON.stringify(path)} != ${JSON.stringify(expect.path)}`);
    if (expect.code !== undefined && code !== expect.code) problems.push(`code ${JSON.stringify(code)} != ${JSON.stringify(expect.code)}`);
  }
  if (expect.warningPaths) {
    const warned = (result.warnings || []).map((warning) => warning.path);
    expect.warningPaths.forEach((path) => {
      if (!warned.includes(path)) problems.push(`missing warning ${path}`);
    });
  }
  return problems;
}

async function runCase(testCase) {
  const file = join(HERE, testCase.file);
  const run = await runProcess(process.execPath, [ONE, testCase.mode, file], CASE_TIMEOUT_MS);
  if (run.timedOut) return { status: "timeout", detail: `${CASE_TIMEOUT_MS}ms` };
  if (run.code !== 0) return { status: "crash", detail: (run.stderr || "").trim().split("\n").slice(-2).join(" | ") || `exit ${run.code}` };
  let result;
  try {
    const line = run.stdout.trim().split("\n").filter(Boolean).at(-1);
    result = JSON.parse(line);
  } catch (error) {
    return { status: "crash", detail: `bad output: ${run.stdout.trim().slice(0, 200)}` };
  }
  const problems = compare(result, testCase.expect);
  return problems.length ? { status: "fail", detail: problems.join("; "), result } : { status: "pass", result };
}

async function selfCheck() {
  const checks = [];
  const notArray = await runProcess(process.execPath, [ONE, "not-array", ""], CASE_TIMEOUT_MS);
  const notArrayResult = JSON.parse(notArray.stdout.trim().split("\n").filter(Boolean).at(-1));
  checks.push(["not_array", firstError(notArrayResult).code === "not_array"]);

  const concurrent = await runProcess(process.execPath, [ONE, "concurrent", ""], CASE_TIMEOUT_MS);
  const concurrentResult = JSON.parse(concurrent.stdout.trim().split("\n").filter(Boolean).at(-1));
  checks.push(["concurrent order", concurrentResult.ok === true && JSON.stringify(concurrentResult.ids) === JSON.stringify([3, 1, 2])]);

  const hang = await runProcess(process.execPath, ["-e", "setTimeout(function(){}, 5000)"], 300);
  checks.push(["timeout classified", hang.timedOut === true]);

  const crash = await runProcess(process.execPath, ["-e", "process.exit(3)"], CASE_TIMEOUT_MS);
  checks.push(["crash classified", crash.code === 3]);

  let ok = true;
  checks.forEach(([name, passed]) => {
    if (!passed) ok = false;
    console.log(`self-check ${passed ? "ok  " : "FAIL"} ${name}`);
  });
  return ok;
}

async function main() {
  const { cases } = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));
  let passed = 0;
  let failed = 0;
  for (const testCase of cases) {
    const outcome = await runCase(testCase);
    if (outcome.status === "pass") {
      passed += 1;
      console.log(`ok   ${testCase.name}`);
    } else {
      failed += 1;
      console.log(`FAIL ${testCase.name} [${outcome.status}] ${outcome.detail}`);
    }
  }
  console.log(`fixtures ${passed}/${cases.length}`);
  let selfOk = true;
  if (process.argv.includes("--self-check")) selfOk = await selfCheck();
  process.exit(failed === 0 && selfOk ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
