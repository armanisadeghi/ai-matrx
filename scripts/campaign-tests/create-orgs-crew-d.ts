#!/usr/bin/env npx tsx
// Data crew D, phase 1: create the three throwaway organizations only.
import path from "node:path";
import dotenv from "dotenv";
import { writeFileSync, readFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { fixtureOrg } from "../lib/fixture-org.mjs";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME as string;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD as string;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

async function main() {
  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  const signedIn = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error(`sign-in failed: ${signedIn.error?.message}`);

  const files = [
    "podcast-episode-pipeline.json",
    "research-lab-experiment-log.json",
    "museum-collection-catalog.json",
  ];
  const out: Record<string, string> = {};

  for (const file of files) {
    const raw = JSON.parse(readFileSync(path.resolve(__dirname, "use-cases", file), "utf8"));
    const orgName: string = raw.organization_name;
    // FIXTURE-ORGS 2026-09-23: this minted a new organization at `<name>-<timestamp>` on every
    // run. It now reuses the family's ONE organization by slug through the shared helper.
    let orgId: string;
    try {
      const { org } = await fixtureOrg(supabase, { name: orgName, description: raw.use_case });
      orgId = org.id;
    } catch (e) {
      console.error(`FAILED ${orgName}: ${(e as Error).message}`);
      continue;
    }
    console.log(`${orgName} -> ${orgId}`);
    out[file] = orgId;
  }

  writeFileSync(path.resolve(__dirname, "org-ids.json"), JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
