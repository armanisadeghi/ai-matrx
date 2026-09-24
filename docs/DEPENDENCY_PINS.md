# Dependency pins

Updated 2026-09-23.

| Packages | Pinned version | Reason |
| --- | --- | --- |
| `@univerjs/core`, `@univerjs/themes`, `@univerjs/presets`, `@univerjs/preset-docs-core`, `@univerjs/preset-sheets-core` | `1.0.0` | Verified 2026-09-23 with frozen install, full type check, and production build. The document editor and Markdown converter require the 1.0 paragraph/section ID and document-save APIs. Keep all five manifest pins and lockfile resolutions aligned; this replaces the earlier 0.25.1 hold against partial core/themes upgrades. |
