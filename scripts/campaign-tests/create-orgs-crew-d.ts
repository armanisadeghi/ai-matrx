#!/usr/bin/env npx tsx
// Data crew D, phase 1: create the three throwaway organizations only.
import path from "node:path";
import dotenv from "dotenv";
import { writeFileSync, readFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
    const abbrev = orgName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(2, "X");
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) + "-" + Date.now().toString(36);
    const { data: org, error } = await supabase.rpc("org_create", {
      p_name: orgName,
      p_abbreviation: abbrev,
      p_slug: slug,
      p_description: raw.use_case,
      p_logo_url: null,
      p_logo_file_id: null,
      p_website: null,
      p_settings: { test_fixture: true },
    });
    if (error) {
      console.error(`FAILED ${orgName}: ${error.message}`);
      continue;
    }
    const orgId: string = Array.isArray(org) ? (org[0]?.id ?? org[0]) : ((org as any)?.id ?? org);
    console.log(`${orgName} -> ${orgId}`);
    out[file] = orgId;
  }

  writeFileSync(path.resolve(__dirname, "org-ids.json"), JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
