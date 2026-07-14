#!/usr/bin/env tsx
/**
 * check-definer-grants — recurrence guard for the anon-reachable SECURITY
 * DEFINER RPC vulnerability class (KNOWN_DEFECTS D31).
 *
 * The hole: a `public` SECURITY DEFINER function bypasses RLS, so if it trusts a
 * caller-supplied id (uuid/uuid[] arg) with no auth gate AND is EXECUTE-granted
 * to `anon`/PUBLIC, any unauthenticated browser can call it with someone else's
 * id. This script asks the DB (via the service-role `audit_anon_definer_grants()`
 * RPC) for the live set of such functions and diffs it against a committed
 * baseline. A NEW function not in the baseline is a regression → loud (and exit 1
 * under --strict). The baseline is the grandfathered backlog tracked in D31;
 * shrinking it (by adding a gate or revoking anon) is the goal.
 *
 *   pnpm check:definer-grants           # loud, non-blocking (exit 0) — advisory
 *   pnpm check:definer-grants:strict    # exit 1 on any NEW (non-baseline) hit — CI
 *   pnpm check:definer-grants:update    # rewrite the baseline from live (review the diff!)
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (service role — the audit
 * RPC is service_role-only). Reads .env* like the other gate scripts.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = resolve(ROOT, "scripts/definer-grants-baseline.json");

const STRICT = process.argv.includes("--strict");
const UPDATE = process.argv.includes("--update");

function loadEnv(): { url: string; key: string } | null {
  let url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  let key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!url || !key) {
    for (const f of [
      ".env.local",
      ".env.production.local",
      ".env.production",
      ".env",
    ]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        const v = (raw ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && (k === "NEXT_PUBLIC_SUPABASE_URL" || k === "SUPABASE_URL"))
          url = v;
        if (
          !key &&
          (k === "SUPABASE_SECRET_KEY" || k === "SUPABASE_SERVICE_ROLE_KEY")
        )
          key = v;
      }
      if (url && key) break;
    }
  }
  return url && key ? { url, key } : null;
}

interface Hit {
  proname: string;
  args: string;
  anon_exec: boolean;
  public_exec: boolean;
}

/** Stable signature — proname(args) — used as the baseline key. */
function sig(h: { proname: string; args: string }): string {
  return `${h.proname}(${h.args})`;
}

async function fetchLive(url: string, key: string): Promise<Hit[] | null> {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/audit_anon_definer_grants`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Content-Profile": "public",
        Accept: "application/json",
      },
      body: "{}",
    });
    if (!res.ok) {
      console.error(
        `check-definer-grants: RPC call failed (${res.status} ${res.statusText}). ` +
          `Needs a service-role key (SUPABASE_SECRET_KEY).`,
      );
      return null;
    }
    return (await res.json()) as Hit[];
  } catch (err) {
    console.error(
      `check-definer-grants: could not reach the DB — ${(err as Error).message}`,
    );
    return null;
  }
}

function loadBaseline(): Set<string> {
  if (!existsSync(BASELINE)) return new Set();
  try {
    const j = JSON.parse(readFileSync(BASELINE, "utf8")) as {
      grandfathered: string[];
    };
    return new Set(j.grandfathered ?? []);
  } catch {
    return new Set();
  }
}

function writeBaseline(hits: Hit[]): void {
  const grandfathered = hits.map(sig).sort((a, b) => a.localeCompare(b));
  const checksum = createHash("sha256")
    .update(grandfathered.join("\n"), "utf8")
    .digest("hex");
  const doc = {
    _comment:
      "Grandfathered anon-reachable SECURITY DEFINER RPCs that trust a uuid arg with no auth gate " +
      "(KNOWN_DEFECTS D31 backlog). A NEW function not listed here fails `pnpm check:definer-grants:strict`. " +
      "SHRINK this list by adding an auth gate or revoking anon, never grow it. Regenerate: pnpm check:definer-grants:update.",
    generated_note: "checksum is over the sorted signature list",
    checksum,
    count: grandfathered.length,
    grandfathered,
  };
  writeFileSync(BASELINE, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

async function main(): Promise<number> {
  const env = loadEnv();
  if (!env) {
    console.error(
      "check-definer-grants: no Supabase URL + service key found — skipping (non-blocking).",
    );
    return 0; // don't block when creds are absent (matches sibling gates)
  }

  const live = await fetchLive(env.url, env.key);
  if (live === null) return STRICT ? 1 : 0;

  if (UPDATE) {
    writeBaseline(live);
    console.log(
      `check-definer-grants: baseline rewritten — ${live.length} grandfathered signatures. Review the diff before committing.`,
    );
    return 0;
  }

  const baseline = loadBaseline();
  const liveSigs = live.map(sig);
  const fresh = live.filter((h) => !baseline.has(sig(h)));
  const healed = [...baseline].filter((b) => !liveSigs.includes(b));

  console.log(
    `check-definer-grants: ${live.length} anon-reachable id-trusting definer fns live · ` +
      `${baseline.size} grandfathered (D31 backlog) · ${fresh.length} NEW · ${healed.length} healed`,
  );

  if (healed.length) {
    console.log(
      `  ↓ ${healed.length} baseline entr${healed.length === 1 ? "y" : "ies"} no longer vulnerable — prune with :update:`,
    );
    for (const h of healed) console.log(`     - ${h}`);
  }

  if (fresh.length === 0) {
    console.log(
      "  ✓ no NEW anon-reachable id-trusting SECURITY DEFINER functions.",
    );
    return 0;
  }

  console.error(
    `\n  ✗ ${fresh.length} NEW anon-reachable SECURITY DEFINER function(s) trust a caller id with no auth gate:`,
  );
  for (const h of fresh) {
    const g = [h.anon_exec ? "anon" : "", h.public_exec ? "PUBLIC" : ""]
      .filter(Boolean)
      .join("+");
    console.error(`     ✗ ${sig(h)}   [${g}]`);
  }
  console.error(
    "\n  Fix each: add a `(auth.role()='service_role' OR <id>=auth.uid())` (own-data) or\n" +
      "  `iam.has_org_access(<org>)` (org) gate, OR `revoke execute … from anon, public;` if no guest\n" +
      "  path exists. If it is LEGITIMATELY public (published/guest/token-gated), grandfather it via\n" +
      "  `pnpm check:definer-grants:update`. See KNOWN_DEFECTS D31.",
  );
  return STRICT ? 1 : 0;
}

main().then((code) => process.exit(code));
