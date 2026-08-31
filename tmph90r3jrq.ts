/**
 * stream_partials.ts — TypeScript bridge for PARTIAL-VALUE parity.
 *
 * The detection bridge (`parse_blocks.ts`) answers "do both runtimes assign the
 * same block TYPE". This one answers the question that matters once content
 * renders while it streams: **do both runtimes agree on the progressive VALUE
 * a user is looking at mid-stream?**
 *
 * There really are two producers of that value, and both are production paths:
 *
 *   - Python  — the `metadata.__ir_partial` channel (`StreamBlockProcessor`),
 *     used when the server sends `render_block` events.
 *   - Frontend — `StreamBlockAccumulator`, which parses raw `chunk` text itself
 *     and emits blocks carrying a STREAMING `metadata.__ir` envelope. This is
 *     what runs whenever a surface receives chunks instead of blocks.
 *
 * If they disagree, the same answer renders differently depending on which wire
 * shape the server happened to use — a divergence no test on either side alone
 * can see.
 *
 * Reads a JSON job from `--in` and writes results to `--out` (stdout is NOT a
 * reliable channel: imported frontend modules print parser diagnostics).
 *
 *   { "chunk": 4, "documents": { "<name>": "<markdown>" } }
 *   → { "<name>": [ { blockId, blockType, status, kind, kindState, value } ] }
 *
 * One entry per emission whose envelope carries a structured value, in order.
 *
 * MUST run from the matrx-frontend repo root (or with --tsconfig pointing at
 * it) so the `@/` alias resolves. Invoked by
 * `aidream/packages/matrx-ai/tests/parity/test_partial_value_parity.py`.
 */

import * as fs from "fs";

import { IR_ENVELOPE_KEY, isCanonicalBlockIR } from "@ai-matrx/content-ir";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";

interface Emission {
  blockId: string;
  blockType: string;
  status: string;
  kind: string;
  kindState: string;
  value: Record<string, unknown>;
}

function runDocument(document: string, chunk: number): Emission[] {
  const emissions: Emission[] = [];

  const accumulator = new StreamBlockAccumulator(
    "parity",
    (payload: { requestId: string; block: Record<string, unknown> }) => {
      const block = payload.block;
      const metadata = block.metadata as Record<string, unknown> | undefined;
      const envelope = metadata?.[IR_ENVELOPE_KEY];
      if (!isCanonicalBlockIR(envelope)) return { type: "noop" };
      const root = envelope.root;
      if (!root || typeof root.value !== "object" || root.value === null) {
        return { type: "noop" };
      }
      emissions.push({
        blockId: String(block.blockId ?? ""),
        blockType: String(block.type ?? ""),
        status: String(root.status ?? ""),
        kind: String(root.kind ?? ""),
        kindState: String(root.kindState ?? ""),
        value: root.value as Record<string, unknown>,
      });
      return { type: "noop" };
    },
  );

  const dispatch = (action: unknown) => action;
  for (let i = 0; i < document.length; i += chunk) {
    accumulator.ingest(document.slice(i, i + chunk), dispatch);
  }
  accumulator.finalize(dispatch);

  return emissions;
}

function main(): void {
  const argv = process.argv.slice(2);
  const inIdx = argv.indexOf("--in");
  const outIdx = argv.indexOf("--out");
  if (inIdx === -1 || outIdx === -1) {
    process.stderr.write("[stream_partials.ts] ERROR: --in and --out are required\n");
    process.exit(1);
  }

  const job = JSON.parse(fs.readFileSync(argv[inIdx + 1]!, "utf8")) as {
    chunk?: number;
    documents: Record<string, string>;
  };
  const chunk = job.chunk ?? 4;

  const results: Record<string, Emission[]> = {};
  for (const [name, document] of Object.entries(job.documents)) {
    results[name] = runDocument(document, chunk);
  }

  fs.writeFileSync(argv[outIdx + 1]!, JSON.stringify(results, null, 2));
}

main();
