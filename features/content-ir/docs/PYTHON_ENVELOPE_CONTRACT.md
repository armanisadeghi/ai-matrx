# Python envelope contract — `engine: "py-block-detector"`

The FE accepts **pre-built CanonicalBlockIR envelopes from aidream** and never re-parses what they describe. This is the wire contract Python must satisfy. FE twin: `features/content-ir/core/ir-types.ts` (shapes), `core/fingerprint.ts` (hash), `core/envelope-cache.ts` (part cache).

## Where it rides

- **Live stream:** `render_block` event → `data.metadata.__ir` = one `CanonicalBlockIR` describing that block's `content`.
- **Persisted message (optional):** `cx_message.content[]` text part → `metadata.__ir` = an `IrEnvelopeCache` (`{ "v": 1, "blocks": { "<fingerprint>": <CanonicalBlockIR> } }`) — one entry per JSON region embedded in that part's text. This is the same cache the FE stamps at stream commit (`assembleMessageParts`); a server-persisted turn that stamps it gets reload-without-re-parse with zero FE work.

## Envelope shape (exact)

```json
{
  "v": 1,
  "engine": "py-block-detector",
  "fingerprint": "<see algorithm>",
  "root": {
    "role": "structured",
    "kind": "<kind slug, e.g. flashcard_set>",
    "kindState": "resolved",
    "discriminator": { "format": "json", "key": "__kind" },
    "path": [],
    "status": "complete",
    "value": { "…schema fields + __kind ONLY…" },
    "residue": null
  },
  "nodeIndex": { "cards.0": { "kind": "flashcard", "kindState": "resolved", "status": "complete", "residue": { "extra": { "…unknown keys…" }, "optionalMissing": null, "notices": null } } }
}
```

Rules:

- **`v` MUST be `1`**, `engine` MUST be `"py-block-detector"`, `root.role` MUST be `"structured"`, `fingerprint` MUST be a string — that is the FE validation gate (`isCanonicalBlockIR`).
- **Only `status: "complete"` envelopes are reusable.** Streaming/error envelopes are accepted but never enter the persistence cache.
- **Zero data loss:** unknown keys go in `residue.extra` (root) / `nodeIndex[pathKey].residue.extra` (children) — NEVER merged into `value`. `value` holds schema fields + `__kind` only.
- `nodeIndex` keys are dot-joined paths (`cards.0`, `cards.0.front`); omit the field when empty.

## Fingerprint algorithm — FNV-1a double, over the region source

The fingerprint is computed over the **exact `render_block.content` string** of the block the envelope describes (the region source: bare/fenced-inner JSON text, no fence lines, no trailing newline). Byte-for-byte identity with the FE is mandatory — a mismatched fingerprint silently degrades to a re-parse, never an error.

- Two independent FNV-1a 32-bit passes over the string's **UTF-16 code units** (JS `charCodeAt` — NOT UTF-8 bytes; for non-BMP chars hash each surrogate half):
  - pass A seed `0x811c9dc5`, pass B seed `0x01000193`
  - per unit: `h ^= unit; h = (h * 16777619) & 0xFFFFFFFF`
- Result string: `"{length}-{a}{b}"` where `length` = UTF-16 code-unit count and `length`/`a`/`b` are **lowercase base-36**.

Python mirror sketch: `units = [int.from_bytes(source.encode("utf-16-le")[i:i+2], "little") for i in range(0, ...)]`; run both passes; base-36-encode.

## FE guarantees (what Python gets for free)

- A **valid** envelope flows into Redux **by reference** (the idempotence law), is seeded into the region-envelope memo (any re-split reuses it), and is stamped into the part's `IrEnvelopeCache` at stream commit **engine-agnostically** — reload never re-parses it.
- Server `render_block` events never feed the `StreamBlockAccumulator` (only chunk text does), so **no FE shadow parse region opens** for a Python-built block.
- A **malformed/foreign `__ir`** is stripped before Redux with a loud `captureError` (source `content-ir`, names engine + blockId) — it degrades that block to the ordinary content-driven path and can never poison kind routing or the persistence cache. Watch the Error Inspector during rollout.

Enforced by `features/content-ir/__tests__/envelope-persistence.test.ts`.
