// Shared signed-in supabase-js client for data-doctrine real-data crew E.
// Reads AI_ADMIN_USERNAME/AI_ADMIN_PASSWORD and Supabase URL/key from matrx-frontend/.env.local.
// Never prints secrets.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnv(file) {
  const out = {};
  const txt = fs.readFileSync(file, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

const root = "/Users/armanisadeghi/code/matrx-frontend";
const env = loadEnv(path.join(root, ".env.local"));

export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_USER = env.AI_ADMIN_USERNAME || "admin@admin.com";
const ADMIN_PASS = env.AI_ADMIN_PASSWORD;

export async function signedInClient() {
  const client = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: ADMIN_USER,
    password: ADMIN_PASS,
  });
  if (error) throw new Error("sign-in failed: " + error.message);
  return { client, userId: data.user.id };
}
