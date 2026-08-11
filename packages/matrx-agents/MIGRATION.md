# Migration status

The old plan described the remaining work as a mechanical 40-file move. That
assessment is obsolete. The live execution graph is roughly 155 files / 44k
lines and `process-stream.ts` coordinates both pure state projection and many
matrx-frontend effects.

The authoritative, versioned plan now lives in [`FEATURE.md`](FEATURE.md):

- v1 wire parity — implemented;
- v2 pure event projection;
- v3 portable execution Redux store;
- v4 definitions/versions + shortcut/slot/binding resolution;
- v5 optional host capabilities and full run parity.

The exit test for every version is consumption by matrx-frontend first and by
at least one non-Next host second, with shared fixtures proving identical
processing. Re-export barrels and adapter interfaces alone do not count as an
extraction.
