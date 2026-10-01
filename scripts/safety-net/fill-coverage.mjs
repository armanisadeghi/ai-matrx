#!/usr/bin/env node
// scripts/safety-net/fill-coverage.mjs — write one run's per-item grades into the coverage register.
//
//   node scripts/safety-net/fill-coverage.mjs --run <run folder> --column before|after --half a|b|all
//
// Rewrites ONLY the "Live before" (or "Live after") cell of the rows in the named half, as
// "PASS · <run folder name>" / "FAIL · <run folder name> — <detail>", so the two lanes that share the
// register never overwrite each other's rows.
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (n, d = null) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const run = resolve(opt("run"));
const column = opt("column", "before");
const half = opt("half", "a");
const REG = resolve(new URL("../../../common-docs/projects/data-doctrine-adoption/v5/SAFETY-NET-COVERAGE.md", import.meta.url).pathname);
const summary = JSON.parse(readFileSync(`${run}/summary.json`, "utf8"));
const inHalf = (id) => half === "all" || (half === "b") === ["A", "C"].includes(id[0]);
const col = column === "after" ? 6 : 5; // 0 Item, 1 What, 2 Owner, 3 Test, 4 Proven red, 5 Live before, 6 Live after
let changed = 0;
const lines = readFileSync(REG, "utf8").split("\n").map((line) => {
  const m = line.match(/^\| ([A-Z]\d\d) \|/);
  if (!m || !inHalf(m[1])) return line;
  const it = summary.items[m[1]];
  if (!it || it.grade === "—") return line;
  const parts = line.slice(2, -2).split(" | ");
  const fail = it.evidence.find((e) => e.status === "FAIL");
  const detail = fail ? ` — ${String(fail.detail ?? "").replace(/\|/g, "/").slice(0, 120)}` : "";
  parts[col] = `${it.grade} · ${basename(run)}${detail}`;
  changed += 1;
  return `| ${parts.join(" | ")} |`;
});
writeFileSync(REG, lines.join("\n"));
console.log(`${changed} rows' ${column} cell written from ${basename(run)}`);
