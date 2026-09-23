#!/usr/bin/env npx tsx
// Data crew C, phase 1: create the three real-public-data throwaway organizations.
import path from "node:path";
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { fixtureOrg } from "../lib/fixture-org.mjs";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME as string;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD as string;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

const ORGS = [
  {
    file: "us-national-parks-park-itineraries.json",
    name: "Trailhead & Torch Journeys",
    description: "Travel agency (REAL-DATA campaign, crew C): US National Parks itineraries, entered via the CSV import wizard.",
  },
  {
    file: "fifa-world-cup-finals-trivia-night.json",
    name: "The Offside Rule",
    description: "Sports bar (REAL-DATA campaign, crew C): FIFA World Cup finals trivia night, entered via signed-in supabase-js store doors.",
  },
  {
    file: "us-large-airports-relocation-route-planning.json",
    name: "Compass Route Relocation Advisors",
    description: "Relocation and travel planning (REAL-DATA campaign, crew C): large US airports, entered through the app's own headless screens.",
  },
];

async function main() {
  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  const signedIn = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error(`sign-in failed: ${signedIn.error?.message}`);
  console.log(`Signed in as ${signedIn.data.user.email} (${signedIn.data.user.id})`);

  const out: Record<string, string> = {};

  for (const o of ORGS) {
    // FIXTURE-ORGS 2026-09-23: this minted a new organization at `<name>-<timestamp>` on every
    // run. It now reuses the family's ONE organization by slug through the shared helper.
    let orgId: string;
    try {
      const { org } = await fixtureOrg(supabase, { name: o.name, description: o.description });
      orgId = org.id;
    } catch (e) {
      console.error(`FAILED ${o.name}: ${(e as Error).message}`);
      continue;
    }
    console.log(`${o.name} -> ${orgId}`);
    out[o.file] = orgId;
  }

  writeFileSync(path.resolve(__dirname, "org-ids-crew-c.json"), JSON.stringify(out, null, 2));
  console.log("wrote org-ids-crew-c.json");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
