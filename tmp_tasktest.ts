import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

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

const blocks = splitContentIntoBlocksV2(content);
for (const b of blocks) {
  console.log(
    "TYPE:",
    b.type,
    "| lang:",
    (b as any).language ?? "-",
    "| len:",
    b.content.length,
    "| preview:",
    JSON.stringify(b.content.slice(0, 40)),
  );
}
