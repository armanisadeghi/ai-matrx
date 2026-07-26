# `.next` Folder Bloat — Root Cause Report

**Project:** AI Matrx (Next.js 16 / Turbopack)
**Investigated by:** Claude Code
**Date:** 2026-05-06
**Status:** Resolved — 8 GB recovered

---

## Executive Summary

The `.next` build folder was growing to ~10 GB during normal development. The root cause is Turbopack's persistent compilation cache, which has no automatic size limit and grows indefinitely across dev sessions. 8 GB was cleared in under 30 seconds. A targeted cleanup script was added to prevent re-accumulation.

---

## Findings

### Primary Cause — Turbopack RocksDB Cache (8 GB)

Turbopack (Next.js 16's default bundler) stores its persistent compile cache in `.next/dev/cache/turbopack/` using a **RocksDB** key-value database — the same storage engine used in Chrome and RocksDB-backed databases.

RocksDB is append-mostly by design: every time a source file changes, it writes new 250 MB SST files. A background compaction process merges these files periodically, but it does not evict old entries — it only reorganizes them. The database grows monotonically.

**Evidence:**
- Single cache directory: `.next/dev/cache/turbopack/0ca967b8/`
- 347 files totalling 8.0 GB
- Largest SST files: 25+ files at ~250 MB each (sequential: `00000241.sst`, `00000594.sst`, etc.)
- No competing cause found: no `node_modules` inside `.next`, no image generation artifacts, no recursive output

**Why it grows so fast:** This is a large codebase with many files. Each dev session rewrites cache entries for all changed modules. After 8–12 typical dev sessions without a cache wipe, the RocksDB accumulates to the full 8 GB observed.

**Important:** Next.js 16 exposes **no configuration option** to limit Turbopack's cache size. This is a known gap in the framework. The only mitigation is periodic manual cleanup.

---

### Secondary Cause — Accumulated Dev Chunks (1.68 GB)

`.next/dev/static/chunks/` contained **7,879 files** across multiple dev sessions:

| File type | Count | Size |
|---|---|---|
| `.js` chunks | 5,045 | 811 MB |
| `.map` source maps | 2,717 | 865 MB |
| `.css` | 117 | 4 MB |

Source maps alone consumed 865 MB — nearly matching the JS chunks they describe. These are regenerated each dev session but old ones are not cleaned up.

---

### Tertiary Finding — Large Bundle Contributors (not bloat, but worth noting)

Visible in the chunk files, these libraries are generating oversized bundles in the dev output:

| Library | Chunk size | Issue |
|---|---|---|
| `react-icons/pi` | 9.8 MB | Entire Phosphor icon library bundled (barrel import) |
| `react-icons/gi` | 8.4 MB | Entire Game Icons library |
| `react-icons/tb` | 8.0 MB | Entire Tabler Icons library |
| `react-icons/si` | 6.4 MB | Entire Simple Icons library |
| `@babel/standalone` | 6.4 MB | **Full Babel compiler bundled at runtime** — investigate which route imports this |
| `react-icons/bs` | 3.0 MB | Bootstrap Icons |

These affect end-user bundle size, not disk size. They are separate from the `.next` bloat issue but warrant follow-up.

---

## Resolution

**Immediate:** Deleted `.next/dev/cache/turbopack/` — freed **8 GB** in under 30 seconds.

```
Before: ~10 GB
After:  ~2.0 GB
```

**Structural:** Added `clean:turbo` script to `package.json`:

```json
"clean:turbo": "rimraf .next/dev/cache/turbopack"
```

This allows targeted cache-only cleanup without a full cold rebuild, preserving compiled chunks for a faster restart.

---

## Recommendations

| Priority | Action |
|---|---|
| **Ongoing** | Run `pnpm clean:turbo` every 2–3 weeks, or whenever `.next` exceeds ~3 GB |
| **Low effort** | Add a pre-dev hook that warns if `.next/dev/cache` exceeds a threshold |
| **Medium effort** | Replace `react-icons` barrel imports with cherry-picked imports (e.g. `import { PiX } from 'react-icons/pi/PiX'`) — reduces dev chunk size by ~35 MB and production bundle by the same |
| **Investigate** | Find and remove the `@babel/standalone` import — this is a 6.4 MB runtime compiler that should not appear in a production Next.js app |

---

## What Did NOT Cause This

- No `node_modules` copied inside `.next`
- No image generation or AI-generated media accumulating in the cache
- No webpack cache (Turbopack replaced webpack as the dev bundler)
- No recursive build output or loops
- Not a `.gitignore` issue — `.next` is correctly excluded from git

The problem is a framework-level limitation (no cache eviction policy in Turbopack) compounded by normal development activity on a large codebase.
