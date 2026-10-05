#!/usr/bin/env node
// scripts/check-template-pages.mjs — lane CHAIR-GALLERY guard (2026-10-05).
//
// Every published platform template has a public page at /templates/<slug>. This guard reads the
// LIVE catalogue the way a signed-out visitor does (public.templates_public, publishable key, no
// session) and fails when any published template:
//   - has no slug, a slug that is not lowercase-words-with-hyphens, or a slug another template uses;
//   - has no description (the card's persona — the page's meta description and lead sentence).
// With --render <origin> (default http://localhost:3001 when --render is bare) it also fetches a few
// /templates/<slug> pages and fails unless each answers 200 with the template's name in <title> and
// its sample rows in the server-rendered HTML (no client JavaScript involved).
//
//   pnpm check:template-pages                 # catalogue only
//   pnpm check:template-pages --render        # + server render on the shared preview

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), file);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (!url || !key) {
  console.error("check:template-pages — NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set");
  process.exit(2);
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const cards = [];
for (let offset = 0; ; offset += 200) {
  const res = await fetch(`${url}/rest/v1/rpc/templates_public`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", "content-profile": "public" },
    body: JSON.stringify({ p_filter: { limit: 200, offset } }),
  });
  if (!res.ok) {
    console.error(`check:template-pages — templates_public answered ${res.status}: ${await res.text()}`);
    process.exit(2);
  }
  const answer = await res.json();
  cards.push(...answer.cards);
  if (answer.cards.length < 200 || offset + 200 >= answer.total) break;
}

const problems = [];
const seen = new Map();
for (const c of cards) {
  if (!c.slug) problems.push(`${c.catalogue_id} "${c.name}" has no slug`);
  else if (!SLUG.test(c.slug)) problems.push(`${c.catalogue_id} slug "${c.slug}" is not lowercase words joined by hyphens`);
  else if (seen.has(c.slug)) problems.push(`${c.catalogue_id} slug "${c.slug}" is also ${seen.get(c.slug)}'s`);
  if (c.slug) seen.set(c.slug, c.catalogue_id);
  if (!c.persona || !String(c.persona).trim()) problems.push(`${c.catalogue_id} "${c.name}" has no description`);
}

if (cards.length === 0) problems.push("the public catalogue answered no templates at all");

const renderAt = process.argv.indexOf("--render");
if (renderAt !== -1 && cards.length) {
  const origin = process.argv[renderAt + 1]?.startsWith("http") ? process.argv[renderAt + 1] : "http://localhost:3001";
  const picks = [cards[0], cards[Math.floor(cards.length / 2)], cards[cards.length - 1]];
  const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  for (const c of picks) {
    const page = `${origin}/templates/${c.slug}`;
    const res = await fetch(page, { redirect: "manual" });
    const html = await res.text();
    const title = unescape(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
    if (res.status !== 200) problems.push(`${page} answered ${res.status}`);
    else if (!title.includes(c.name)) problems.push(`${page} <title> is "${title}", not the template's name "${c.name}"`);
    else if (!html.includes("data-template-main-view") || !html.includes('data-template-show="grid"')) {
      problems.push(`${page} server HTML carries no rendered main view or sample-row grid`);
    } else console.log(`ok  ${page}  <title>${title}</title>`);
  }
  // An old catalogue-id address answers a permanent redirect to the readable one.
  const old = await fetch(`${origin}/templates/${cards[0].catalogue_id}`, { redirect: "manual" });
  const to = old.headers.get("location") ?? "";
  if (![301, 308].includes(old.status) || !to.endsWith(`/templates/${cards[0].slug}`)) {
    problems.push(`/templates/${cards[0].catalogue_id} answered ${old.status} → "${to}", not a permanent redirect to /templates/${cards[0].slug}`);
  } else console.log(`ok  /templates/${cards[0].catalogue_id} → ${old.status} ${to}`);
}

if (problems.length) {
  console.error(`check:template-pages — ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`check:template-pages — ${cards.length} published templates, every one with a unique slug and a description`);
