#!/usr/bin/env npx tsx
/**
 * Realtime-tools drift gate — the matrx-frontend half of the realtime tool
 * bridge cross-repo contract (REALTIME_TOOL_BRIDGE_CONTRACT.md §6).
 *
 * The browser is a PURE INTERMEDIARY for realtime tools: both the resolve and
 * execute endpoints read tool defs from the DB, and the FE just relays the
 * `ResolvedRealtimeTool` shape. So the only fork-risk on this side is the FE
 * type drifting from the wire contract. This gate asserts:
 *
 *   1. The documented contract shape (§3 `RealtimeTool`) — `{name, description,
 *      parameters, execution}` with `execution ∈ {server,client,builtin}` — is
 *      exactly what `ResolvedRealtimeTool` declares in features/voice-agent/types.ts.
 *   2. When creds + a known agent id are present, the LIVE
 *      `POST /ai/agents/{id}/realtime-tools` response matches that same shape.
 *      (Offline-safe: with no creds it checks the type-vs-contract only and
 *      exits 0 with a clear message, exactly like check-tool-db-drift.ts.)
 *
 *   pnpm check:realtime-tools          # non-blocking (pre-commit candidate)
 *   pnpm check:realtime-tools:strict   # exits non-zero on drift (CI)
 *
 * Exit codes:
 *   0  shape matches the contract (and the live endpoint, when reachable);
 *      or creds/agent absent → endpoint check skipped with a warning.
 *   1  drift found (strict mode only; non-strict still prints loudly but exits 0).
 *   2  unexpected error.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");

// ── The contract shape (REALTIME_TOOL_BRIDGE_CONTRACT.md §3). Single source. ──
const CONTRACT_FIELDS = ["name", "description", "parameters", "execution"] as const;
const CONTRACT_EXECUTIONS = ["server", "client", "builtin"] as const;

interface DriftIssue {
  where: string;
  detail: string;
}

// ── 1. FE type ↔ contract ─────────────────────────────────────────────────
//
// We don't have a runtime value for the TS interface, so we assert it
// structurally by reading the declaration text and confirming each contract
// field + each execution literal is present. This catches the realistic drift:
// a field renamed/removed, or an execution variant added/dropped, in
// features/voice-agent/types.ts without updating the contract (or vice-versa).
function checkTypeAgainstContract(): DriftIssue[] {
  const issues: DriftIssue[] = [];
  const typesPath = resolve(ROOT, "features/voice-agent/types.ts");
  if (!existsSync(typesPath)) {
    return [{ where: "types.ts", detail: "features/voice-agent/types.ts not found" }];
  }
  const src = readFileSync(typesPath, "utf8");

  // Isolate the `ResolvedRealtimeTool` interface body.
  const ifaceMatch = src.match(
    /export interface ResolvedRealtimeTool\s*\{([\s\S]*?)\}/,
  );
  if (!ifaceMatch) {
    return [
      {
        where: "ResolvedRealtimeTool",
        detail: "interface not found in features/voice-agent/types.ts",
      },
    ];
  }
  const body = ifaceMatch[1];

  for (const field of CONTRACT_FIELDS) {
    const re = new RegExp(`\\b${field}\\s*:`);
    if (!re.test(body)) {
      issues.push({
        where: "ResolvedRealtimeTool",
        detail: `contract field "${field}" missing from the FE interface`,
      });
    }
  }
  for (const exec of CONTRACT_EXECUTIONS) {
    if (!body.includes(`"${exec}"`)) {
      issues.push({
        where: "ResolvedRealtimeTool.execution",
        detail: `contract execution variant "${exec}" missing from the FE union`,
      });
    }
  }
  // Guard against a SUPERFLUOUS execution variant (FE allowing something the
  // contract doesn't). Extract the union literals and diff.
  const execMatch = body.match(/execution\s*:\s*([^;]+);/);
  if (execMatch) {
    const feLiterals = Array.from(execMatch[1].matchAll(/"([^"]+)"/g)).map(
      (m) => m[1],
    );
    for (const lit of feLiterals) {
      if (!CONTRACT_EXECUTIONS.includes(lit as (typeof CONTRACT_EXECUTIONS)[number])) {
        issues.push({
          where: "ResolvedRealtimeTool.execution",
          detail: `FE union has "${lit}" which is not in the contract`,
        });
      }
    }
  }
  return issues;
}

// ── 2. Live endpoint (optional) ───────────────────────────────────────────
function loadEnv(): { token: string; baseUrl: string; agentId: string } | null {
  let baseUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    process.env.REALTIME_TOOLS_BASE_URL ??
    "";
  const token = process.env.REALTIME_TOOLS_JWT ?? "";
  const agentId = process.env.REALTIME_TOOLS_AGENT_ID ?? "";

  if (!baseUrl) {
    for (const f of [".env.local", ".env.production.local", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        const v = (raw ?? "").replace(/^['"]|['"]$/g, "");
        if (!baseUrl && k === "NEXT_PUBLIC_BACKEND_URL") baseUrl = v;
      }
      if (baseUrl) break;
    }
  }
  // A live check needs all three; otherwise skip it (offline-safe).
  if (!baseUrl || !token || !agentId) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token, agentId };
}

async function checkLiveEndpoint(env: {
  token: string;
  baseUrl: string;
  agentId: string;
}): Promise<DriftIssue[]> {
  const url = `${env.baseUrl}/ai/agents/${encodeURIComponent(env.agentId)}/realtime-tools`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      surface: "matrx-user/chat-voice",
      added_tool_ids: [],
      is_version: false,
    }),
  });
  if (!res.ok) {
    return [
      {
        where: "live endpoint",
        detail: `POST /ai/agents/{id}/realtime-tools returned ${res.status}: ${await res.text()}`,
      },
    ];
  }
  const body = (await res.json()) as {
    tools?: Array<Record<string, unknown>>;
  };
  const issues: DriftIssue[] = [];
  const tools = body.tools ?? [];
  for (const t of tools) {
    for (const field of CONTRACT_FIELDS) {
      if (!(field in t)) {
        issues.push({
          where: `live tool "${String(t.name ?? "?")}"`,
          detail: `missing contract field "${field}"`,
        });
      }
    }
    const exec = t.execution;
    if (
      typeof exec !== "string" ||
      !CONTRACT_EXECUTIONS.includes(exec as (typeof CONTRACT_EXECUTIONS)[number])
    ) {
      issues.push({
        where: `live tool "${String(t.name ?? "?")}"`,
        detail: `execution="${String(exec)}" is not one of ${JSON.stringify(CONTRACT_EXECUTIONS)}`,
      });
    }
  }
  return issues;
}

async function main(): Promise<void> {
  const isTTY = process.stdout.isTTY && process.env.NO_COLOR !== "1";
  const RED = isTTY ? "\x1b[1;91m" : "";
  const RED_BG = isTTY ? "\x1b[1;97;41m" : "";
  const GREEN = isTTY ? "\x1b[1;92m" : "";
  const DIM = isTTY ? "\x1b[2m" : "";
  const RESET = isTTY ? "\x1b[0m" : "";

  console.log("Realtime-tools drift check — FE ResolvedRealtimeTool ↔ contract §3");

  const issues: DriftIssue[] = [...checkTypeAgainstContract()];

  const env = loadEnv();
  if (env) {
    try {
      issues.push(...(await checkLiveEndpoint(env)));
      console.log(`  live endpoint: checked (${env.baseUrl})`);
    } catch (err) {
      console.warn(
        `  live endpoint: SKIPPED — request failed (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  } else {
    console.warn(
      "  live endpoint: SKIPPED — set NEXT_PUBLIC_BACKEND_URL + REALTIME_TOOLS_JWT + " +
        "REALTIME_TOOLS_AGENT_ID to also verify the live response shape.",
    );
  }
  console.log("");

  if (issues.length === 0) {
    console.log(`${GREEN}✓ No drift — ResolvedRealtimeTool matches the contract.${RESET}`);
    process.exit(0);
  }

  const bar = "█".repeat(68);
  console.log(`${RED_BG}${bar}${RESET}`);
  console.log(`${RED}⚠  REALTIME-TOOLS DRIFT — ${issues.length} problem(s).${RESET}`);
  console.log(`${RED_BG}${bar}${RESET}`);
  console.log("");
  for (const i of issues) {
    console.log(`  ${RED}•${RESET} ${i.where}: ${DIM}${i.detail}${RESET}`);
  }
  console.log("");
  console.log(
    `${DIM}Fix: align features/voice-agent/types.ts ResolvedRealtimeTool with ` +
      `REALTIME_TOOL_BRIDGE_CONTRACT.md §3 (or update the contract if it changed).${RESET}`,
  );
  // Non-blocking by default (pre-commit), exit non-zero only with --strict (CI).
  process.exit(STRICT ? 1 : 0);
}

main().catch((err) => {
  console.error("realtime-tools drift-check: unexpected error");
  console.error(err);
  process.exit(2);
});
