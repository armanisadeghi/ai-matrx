import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Next.js #97945 retains all 64 bits of the base38 identity. Earlier builds
// used seven characters, allowing distinct SSR chunks to collide at scale.
// Inspect actual output so a lockfile/SWC regression cannot silently restore
// the broken compiler. Runtime files without an identity suffix are ignored.
const fullIdentity = /_[0-2][0-9a-z_-]{12}(?:\._)?\.js$/;
const shortIdentity = /_[0-2][0-9a-z_-]{6}(?:\._)?\.js$/;

export function inspectChunkIdentities(files) {
  let fullWidth = 0;
  const truncated = [];
  for (const file of files) {
    const name = basename(file);
    // Check full identities first: base38 itself contains underscores.
    if (fullIdentity.test(name)) fullWidth++;
    else if (shortIdentity.test(name)) truncated.push(file);
  }
  if (truncated.length) {
    throw new Error(
      `${truncated.length} Turbopack chunks still use collision-prone seven-character identities. ` +
        `Use a Next.js build containing vercel/next.js#97945; do not rename modules to shuffle the collision. ` +
        `Examples: ${truncated.slice(0, 3).join(", ")}`,
    );
  }
  if (!fullWidth) {
    throw new Error("No full-width Turbopack chunk identities found; compile the application before checking.");
  }
  return fullWidth;
}

export function checkBuild(distDir) {
  const root = resolve(distDir, "server", "chunks");
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => join(entry.parentPath, entry.name));
  const count = inspectChunkIdentities(files);
  console.log(`[turbopack-identities] ${count} server chunks retain full-width identities.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    checkBuild(process.env.NEXT_DISTDIR || ".next");
  } catch (error) {
    console.error(`[turbopack-identities] ${error.message}`);
    process.exitCode = 1;
  }
}
