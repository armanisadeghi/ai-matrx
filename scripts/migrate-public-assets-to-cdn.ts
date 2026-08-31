/**
 * migrate-public-assets-to-cdn.ts
 *
 * One-shot migration: lift static assets out of `/public/` and into the
 * cloud-files system as admin-owned `visibility="public"` files. The
 * server returns a permanent CDN URL (Cloudflare-fronted, with a
 * `?v=<checksum[:8]>` cache-buster). We write those URLs to
 * `lib/cdn-assets.ts` as typed constants for components to import.
 *
 * Pipeline per asset:
 *   1. Read bytes from `public/<local>`.
 *   2. Compute SHA-256 to use as an idempotency key.
 *   3. Look up `(owner, file_path)` on the backend — skip if already
 *      uploaded with the matching checksum.
 *   4. POST to `/files/upload` with `visibility=public`, capture the
 *      returned `cdn_url`.
 *   5. Append to the in-memory manifest.
 *   6. After every asset, write `lib/cdn-assets.ts` and the manifest
 *      JSON state file.
 *
 * Idempotency: re-running is safe. Unchanged files are skipped; changed
 * files (different sha-256) are re-uploaded with a new cache-buster.
 *
 * Auth: needs an admin/long-lived JWT for a service account that owns
 * the App Assets folder. See the runbook at the bottom.
 *
 * Run with:
 *   pnpm tsx scripts/migrate-public-assets-to-cdn.ts
 *
 * Required env:
 *   NEXT_PUBLIC_BACKEND_URL_PROD — backend base, e.g. https://api.matrxserver.com
 *   MATRX_ADMIN_JWT          — admin JWT for the asset-owning user
 */

/* eslint-disable no-console */

import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Inventory — every file currently referenced from /public/ that we want
// to move to the CDN. Verified live via grep on 2026-05-02.
//
// Add new entries here. The script is idempotent — it's safe to re-run.
// ---------------------------------------------------------------------------

interface AssetEntry {
  /** Path relative to `public/`. */
  local: string;
  /** Target path in cloud-files (under `App Assets/`). */
  cloudPath: string;
  /** Identifier for the generated TS constant. Auto-uppercased. */
  constName: string;
  /** Mime type sent on upload. */
  contentType: string;
}

const INVENTORY: AssetEntry[] = [
  // Sounds (live refs in hooks/flashcard-app/*).
  {
    local: "sounds/end-buzzer-sound.mp3",
    cloudPath: "App Assets/Sounds/end-buzzer-sound.mp3",
    constName: "CDN_SOUND_END_BUZZER",
    contentType: "audio/mpeg",
  },
  {
    local: "sounds/2-second-start-beep-sound.mp3",
    cloudPath: "App Assets/Sounds/2-second-start-beep.mp3",
    constName: "CDN_SOUND_START_BEEP_2S",
    contentType: "audio/mpeg",
  },

  // Voice-assistants avatars (live refs in constants/voice-assistants.ts).
  ...avatarEntries([
    "business-coach-male-avatar.jpeg",
    "candice-ai-avatar.jpeg",
    "debate-coach-male-avatar.jpeg",
    "development-expert-male-avatar.jpeg",
    "english-tutor-female-avatar.jpeg",
    "flashcard-grader-male-avatar.jpeg",
    "history-tutor-male-avatar.jpeg",
    "hr-expoert-female-avatar.jpeg",
    "math-tutor-avatar.jpeg",
    "matrx-ai-avatar-female.jpeg",
    "matrx-ai-avatar-male.jpeg",
    "python-developer-male-avatar.jpeg",
    "react-developer-male-avatar.jpeg",
    "science-tutor-male-avatar.jpeg",
    "typescript-developer-male-avatar.jpeg",
  ]),

  // Hero / background images (live refs).
  {
    local: "noise.webp",
    cloudPath: "App Assets/Images/noise.webp",
    constName: "CDN_NOISE_WEBP",
    contentType: "image/webp",
  },
  {
    local: "happy-robot-avatar.jpg",
    cloudPath: "App Assets/Images/happy-robot-avatar.jpg",
    constName: "CDN_HAPPY_ROBOT_AVATAR",
    contentType: "image/jpeg",
  },
  {
    local: "images/photo-edit-sample-image.jpg",
    cloudPath: "App Assets/Images/photo-edit-sample-image.jpg",
    constName: "CDN_PHOTO_EDIT_SAMPLE_JPG",
    contentType: "image/jpeg",
  },
  {
    local: "images/photo-edit-sample-image.png",
    cloudPath: "App Assets/Images/photo-edit-sample-image.png",
    constName: "CDN_PHOTO_EDIT_SAMPLE_PNG",
    contentType: "image/png",
  },

  // Model-card carousel images (live refs in ExpandableCardDemo).
  {
    local: "model-card-images/claude-37-sonnet.jpg",
    cloudPath: "App Assets/Model Cards/claude-37-sonnet.jpg",
    constName: "CDN_MODEL_CARD_CLAUDE_37_SONNET",
    contentType: "image/jpeg",
  },
  {
    local: "model-card-images/deepseek-v3.jpg",
    cloudPath: "App Assets/Model Cards/deepseek-v3.jpg",
    constName: "CDN_MODEL_CARD_DEEPSEEK_V3",
    contentType: "image/jpeg",
  },
  {
    local: "model-card-images/gemini-25-pro.png",
    cloudPath: "App Assets/Model Cards/gemini-25-pro.png",
    constName: "CDN_MODEL_CARD_GEMINI_25_PRO",
    contentType: "image/png",
  },
  {
    local: "model-card-images/gpt-41.jpg",
    cloudPath: "App Assets/Model Cards/gpt-41.jpg",
    constName: "CDN_MODEL_CARD_GPT_41",
    contentType: "image/jpeg",
  },
  {
    local: "model-card-images/grok-3.jpg",
    cloudPath: "App Assets/Model Cards/grok-3.jpg",
    constName: "CDN_MODEL_CARD_GROK_3",
    contentType: "image/jpeg",
  },
  {
    local: "model-card-images/llama-4.jpg",
    cloudPath: "App Assets/Model Cards/llama-4.jpg",
    constName: "CDN_MODEL_CARD_LLAMA_4",
    contentType: "image/jpeg",
  },
  {
    local: "model-card-images/matrx-ai-1.0-2.jpeg",
    cloudPath: "App Assets/Model Cards/matrx-ai-1.0-2.jpeg",
    constName: "CDN_MODEL_CARD_MATRX_AI_JPEG",
    contentType: "image/jpeg",
  },
  {
    local: "model-card-images/matrx-ai-1.0-2.jpg",
    cloudPath: "App Assets/Model Cards/matrx-ai-1.0-2.jpg",
    constName: "CDN_MODEL_CARD_MATRX_AI_JPG",
    contentType: "image/jpeg",
  },

  // Demo data (fetched at runtime).
  {
    local: "free/data-truncator/sample-data/large-tool-sample.json",
    cloudPath: "App Assets/Demo Data/large-tool-sample.json",
    constName: "CDN_DEMO_LARGE_TOOL_SAMPLE",
    contentType: "application/json",
  },
  {
    local: "free/data-truncator/sample-data/message-data.json",
    cloudPath: "App Assets/Demo Data/message-data.json",
    constName: "CDN_DEMO_MESSAGE_DATA",
    contentType: "application/json",
  },
];

function avatarEntries(filenames: string[]): AssetEntry[] {
  return filenames.map((name) => ({
    local: `assistants/${name}`,
    cloudPath: `App Assets/Assistants/${name}`,
    constName: `CDN_ASSISTANT_${name
      .replace(/\.(jpeg|jpg|png|webp)$/i, "")
      .replace(/-avatar$/i, "")
      .replace(/[^a-z0-9]+/gi, "_")
      .toUpperCase()}`,
    contentType: name.endsWith(".png") ? "image/png" : "image/jpeg",
  }));
}

// ---------------------------------------------------------------------------
// Backend client
// ---------------------------------------------------------------------------

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL_PROD ?? "https://api.matrxserver.com";
const ADMIN_JWT = process.env.MATRX_ADMIN_JWT;
// Organization admission: the backend's AuthMiddleware refuses a Bearer-JWT
// request without `X-Organization-Id` (400 organization_required).
const ADMIN_ORGANIZATION_ID = process.env.MATRX_ADMIN_ORGANIZATION_ID;

interface UploadedRecord {
  cdn_url: string;
  checksum: string;
  file_id: string;
  file_path: string;
}

interface ManifestEntry extends UploadedRecord {
  constName: string;
  local: string;
  contentType: string;
}

const MANIFEST_PATH = path.join("scripts", "cdn-asset-manifest.json");
const CONSTANTS_PATH = path.join("lib", "cdn-assets.ts");

async function loadManifest(): Promise<Record<string, ManifestEntry>> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as Record<string, ManifestEntry>;
  } catch {
    return {};
  }
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

interface FileRecordWithChecksum {
  file_id: string;
  file_path: string;
  checksum: string | null;
  public_url: string | null;
}

async function findExisting(
  cloudPath: string,
): Promise<FileRecordWithChecksum | null> {
  // The list endpoint scopes to the authenticated user automatically. No
  // server-side full-path filter exists, so list the parent folder and
  // find by file_path.
  const folderPath = cloudPath.substring(0, cloudPath.lastIndexOf("/"));
  const url = `${BACKEND_URL}/files?folder_path=${encodeURIComponent(
    folderPath,
  )}&limit=1000`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ADMIN_JWT}`,
      ...(ADMIN_ORGANIZATION_ID
        ? { "X-Organization-Id": ADMIN_ORGANIZATION_ID }
        : {}),
      "X-Request-Id": randomUUID(),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`list-files failed: ${res.status} ${await res.text()}`);
  }
  const records = (await res.json()) as FileRecordWithChecksum[];
  return records.find((r) => r.file_path === cloudPath) ?? null;
}

async function uploadOne(
  entry: AssetEntry,
  buf: Buffer,
): Promise<UploadedRecord> {
  const form = new FormData();
  // Node Buffer is a valid BlobPart at runtime, but DOM lib typings under
  // TS 5.9 don't accept it cleanly. Cast around the lib mismatch.
  const blobParts = [buf] as unknown as BlobPart[];
  form.append(
    "file",
    new Blob(blobParts, { type: entry.contentType }),
    path.basename(entry.local),
  );
  form.append("file_path", entry.cloudPath);
  form.append("visibility", "public");
  form.append(
    "metadata_json",
    JSON.stringify({
      origin: "static-asset-migration",
      source: entry.local,
      const_name: entry.constName,
    }),
  );

  const res = await fetch(`${BACKEND_URL}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ADMIN_JWT}`,
      ...(ADMIN_ORGANIZATION_ID
        ? { "X-Organization-Id": ADMIN_ORGANIZATION_ID }
        : {}),
      "X-Request-Id": randomUUID(),
    },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    file_id: string;
    file_path: string;
    checksum: string | null;
    cdn_url: string | null;
    url: string | null;
  };
  if (!data.cdn_url) {
    throw new Error(
      `upload of ${entry.cloudPath} returned no cdn_url — is the backend's CDN feature enabled?`,
    );
  }
  return {
    cdn_url: data.cdn_url,
    checksum: data.checksum ?? "",
    file_id: data.file_id,
    file_path: data.file_path,
  };
}

// ---------------------------------------------------------------------------
// Constants emitter
// ---------------------------------------------------------------------------

function emitConstants(manifest: Record<string, ManifestEntry>): string {
  const sorted = Object.values(manifest).sort((a, b) =>
    a.constName.localeCompare(b.constName),
  );

  const lines: string[] = [
    "/**",
    " * Auto-generated by scripts/migrate-public-assets-to-cdn.ts.",
    " * DO NOT EDIT MANUALLY — re-run the script to refresh URLs.",
    " *",
    " * Each constant points at a Cloudflare-fronted CDN URL with a",
    " * `?v=<checksum[:8]>` cache-buster. URLs are immutable for the lifetime",
    " * of the file's bytes; they only change when the file is re-uploaded.",
    " */",
    "",
  ];
  for (const entry of sorted) {
    lines.push(`/** From \`public/${entry.local}\`. */`);
    lines.push(
      `export const ${entry.constName} = ${JSON.stringify(entry.cdn_url)};`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!ADMIN_JWT) {
    console.error(
      "MATRX_ADMIN_JWT is not set. See the runbook in the script header.",
    );
    process.exit(1);
  }
  if (!ADMIN_ORGANIZATION_ID) {
    console.error(
      "MATRX_ADMIN_ORGANIZATION_ID is not set — the backend refuses " +
        "org-less JWT requests (400 organization_required). Set it to the " +
        "asset-owning user's organization id.",
    );
    process.exit(1);
  }

  const manifest = await loadManifest();
  const stats = { uploaded: 0, skipped: 0, failed: 0 };

  for (const entry of INVENTORY) {
    const localPath = path.join("public", entry.local);
    let buf: Buffer;
    try {
      buf = await fs.readFile(localPath);
    } catch (err) {
      console.warn(`SKIP ${entry.local}: source file not found (${err})`);
      stats.failed++;
      continue;
    }

    const localChecksum = sha256Hex(buf);
    const cached = manifest[entry.local];
    if (cached && cached.checksum === localChecksum) {
      console.log(`SKIP ${entry.local}: unchanged`);
      stats.skipped++;
      continue;
    }

    // Check the backend first — manifest may be missing/stale on a fresh
    // checkout but the backend already has the bytes.
    try {
      const remote = await findExisting(entry.cloudPath);
      if (remote && remote.checksum === localChecksum && remote.public_url) {
        manifest[entry.local] = {
          local: entry.local,
          constName: entry.constName,
          contentType: entry.contentType,
          cdn_url: remote.public_url,
          checksum: remote.checksum,
          file_id: remote.file_id,
          file_path: remote.file_path,
        };
        stats.skipped++;
        console.log(`SKIP ${entry.local}: already on CDN`);
        await persist(manifest);
        continue;
      }
    } catch (err) {
      console.warn(
        `  (lookup failed for ${entry.cloudPath}, will upload: ${err})`,
      );
    }

    try {
      console.log(`UPLOAD ${entry.local} → ${entry.cloudPath}`);
      const uploaded = await uploadOne(entry, buf);
      manifest[entry.local] = {
        local: entry.local,
        constName: entry.constName,
        contentType: entry.contentType,
        ...uploaded,
      };
      stats.uploaded++;
      await persist(manifest);
    } catch (err) {
      console.error(`FAIL ${entry.local}:`, err);
      stats.failed++;
    }
  }

  console.log(
    `\nDone. uploaded=${stats.uploaded} skipped=${stats.skipped} failed=${stats.failed}`,
  );
  if (stats.failed > 0) process.exit(2);
}

async function persist(manifest: Record<string, ManifestEntry>): Promise<void> {
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  await fs.writeFile(CONSTANTS_PATH, emitConstants(manifest));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Runbook
// ---------------------------------------------------------------------------
// 1. Pick an admin user that will own `App Assets/`. Either:
//    - Create a dedicated `matrx-app@aimatrx.com` account (recommended), or
//    - Use an existing admin's account.
//    Capture a long-lived JWT (e.g. via `supabase auth refresh`).
// 2. Confirm the backend is reachable and `/files/upload` accepts the JWT.
// 3. Set env:
//      export NEXT_PUBLIC_BACKEND_URL_PROD=https://api.matrxserver.com
//      export MATRX_ADMIN_JWT=<jwt>
// 4. Run: `pnpm tsx scripts/migrate-public-assets-to-cdn.ts`
// 5. Verify `lib/cdn-assets.ts` was generated with real CDN URLs.
//    Spot-check one URL in an incognito tab to confirm public read works.
// 6. Commit `lib/cdn-assets.ts` + `scripts/cdn-asset-manifest.json`.
// 7. Update component imports in a follow-up PR (Phase C4).
// 8. Delete the migrated files from `public/` (Phase D1) only AFTER
//    every component is using `lib/cdn-assets.ts`.
