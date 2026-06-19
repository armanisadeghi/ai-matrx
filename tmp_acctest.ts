import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";

const content = `## ✅ Tasks — Your 7-Day "Make a Crow Friend" Plan
**Say the word and these become real, tracked tasks in your system — not just text on a screen.**

\`\`\`tasks
## Operation: Befriend a Crow

- [ ] **Scout your spot:** Find a quiet, consistent location where crows already gather (park bench, backyard, balcony rail).

- [ ] **Establish a routine:**
    - [ ] Show up at the same time each day
    - [ ] Wear the same jacket/hat so they recognize you
    - [ ] Keep a calm, predictable distance

- [ ] **Offer the right snacks:** Leave unsalted peanuts in the same spot and step back.

- [ ] **Build trust slowly:** Watch for them watching you — that's the relationship forming.
\`\`\`
`;

const blocks = new Map<string, any>();
const dispatch = (action: any) => {
  const b = action?.block;
  if (b) blocks.set(b.blockId, b);
  return action;
};

const acc = new StreamBlockAccumulator("req-test", (p: any) => ({
  type: "upsert",
  ...p,
}));

// Feed char-by-char to simulate streaming deltas.
for (const ch of content) {
  acc.ingest(ch, dispatch);
}
acc.finalize(dispatch);

console.log("=== Final blocks ===");
for (const b of [...blocks.values()].sort(
  (a, b) => a.blockIndex - b.blockIndex,
)) {
  console.log(
    "idx:",
    b.blockIndex,
    "| type:",
    b.type,
    "| status:",
    b.status,
    "| preview:",
    JSON.stringify((b.content ?? "").slice(0, 40)),
  );
}
