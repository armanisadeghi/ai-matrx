// components/markdown-studio/__fixtures__/stress-corpus.ts
//
// The rich-content STRESS CORPUS — realistic large, complex markdown that the
// Markdown Studio, the admin tester and every <RichDocument>/<MarkdownStream>
// surface must survive. Built 2026-09-26 after Arman crashed his browser in the
// markdown tester ("it was causing the browser to crash … properly test with
// large, complex markdown").
//
// Every fixture names a REAL use case (a report an agent writes, an export a
// person pastes, an answer mid-stream). They are deterministic generators, not
// checked-in megabyte blobs: the same seed always yields the same bytes, so a
// benchmark number is comparable across commits. Consumed by
//   - components/markdown-studio/__tests__/stress-budget.test.ts (the guard)
//   - components/markdown-studio/__fixtures__/write-stress-corpus.ts (writes
//     the files a browser run pastes into the studio / tester).

/** Small deterministic PRNG (mulberry32) so every run yields identical bytes. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS =
  "kiln firing schedule glaze cone temperature ramp hold vent oxidation reduction thermocouple controller segment soak cool clay body bisque shrinkage porosity warp crazing shivering pinholes crawling feldspar silica alumina flux frit colorant opacity gloss matte satin crystal nucleation growth atmosphere damper burner pressure flow orifice regulator relay element resistance voltage amperage load circuit breaker contactor insulation brick fiber shelf post wash stilt pyrometric witness batch recipe percent specific gravity viscosity thixotropy deflocculant sieve mesh slurry application thickness dipping pouring spraying brushing".split(
    " ",
  );

function sentence(r: () => number, min = 8, max = 22): string {
  const n = min + Math.floor(r() * (max - min));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(WORDS[Math.floor(r() * WORDS.length)]);
  const s = out.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

function paragraph(r: () => number, sentences = 5): string {
  const out: string[] = [];
  for (let i = 0; i < sentences; i++) {
    let s = sentence(r);
    // Realistic inline markup: emphasis, code spans, links.
    const roll = r();
    if (roll < 0.15) s = s.replace(/(\w+) (\w+)/, "**$1 $2**");
    else if (roll < 0.3) s = s.replace(/(\w+)/, "`$1`");
    else if (roll < 0.4) s = s.replace(/(\w+) (\w+)\./, "[$1 $2](https://docs.example.com/kilns/$1-$2).");
    else if (roll < 0.5) s = s.replace(/(\w+)/, "_$1_");
    out.push(s);
  }
  return out.join(" ");
}

// ── 1. Long technical report ──────────────────────────────────────────────
/** An agent-written operations report: sections, lists, tables, code, math. */
export function technicalReport(sections = 40, seed = 1): string {
  const r = rng(seed);
  const parts: string[] = [
    "---",
    "title: Kiln Fleet Operations Report — Q3",
    "author: Operations agent",
    "tags: [kilns, maintenance, quality]",
    "---",
    "",
    "# Kiln Fleet Operations Report — Q3",
    "",
    "> **Summary.** " + paragraph(r, 3),
    "",
    "## Table of contents",
    "",
  ];
  for (let s = 1; s <= sections; s++) parts.push(`${s}. [Section ${s}](#section-${s})`);
  parts.push("");
  for (let s = 1; s <= sections; s++) {
    parts.push(`## Section ${s}: ${sentence(r, 3, 6).replace(/\.$/, "")}`, "");
    parts.push(paragraph(r, 6), "", paragraph(r, 4), "");
    parts.push(`### ${s}.1 Findings`, "");
    for (let i = 0; i < 6; i++) parts.push(`- ${sentence(r)}`);
    parts.push("");
    parts.push(`### ${s}.2 Measurements`, "");
    parts.push("| Kiln | Cone | Peak °C | Hold (min) | Deviation | Status |");
    parts.push("|---|---:|---:|---:|---:|---|");
    for (let i = 0; i < 8; i++) {
      parts.push(
        `| K-${100 + i} | ${4 + (i % 7)} | ${1180 + Math.floor(r() * 120)} | ${10 + Math.floor(r() * 30)} | ${(r() * 4 - 2).toFixed(2)}% | ${r() < 0.8 ? "OK" : "**Check**"} |`,
      );
    }
    parts.push("");
    if (s % 3 === 0) {
      parts.push(`The heat-work model used for section ${s} is`, "");
      parts.push("$$", "W = \\int_{t_0}^{t_1} k \\, e^{-E_a / (R\\,T(t))} \\, dt", "$$", "");
      parts.push(`with inline $E_a \\approx ${(250 + r() * 50).toFixed(1)}\\,\\text{kJ/mol}$ for this body.`, "");
    }
    if (s % 4 === 0) {
      parts.push("```python", "def ramp(segment, rate_c_per_h, target_c):");
      parts.push('    """Program one controller segment."""');
      parts.push("    return {\"segment\": segment, \"rate\": rate_c_per_h, \"target\": target_c}", "```", "");
    }
    if (s % 5 === 0) {
      parts.push("```mermaid", "flowchart LR", "  A[Load] --> B{Bisque?}", "  B -- yes --> C[Glaze]", "  B -- no --> D[Fire bisque]", "  D --> C", "  C --> E[Glaze fire]", "```", "");
    }
  }
  return parts.join("\n");
}

// ── 2. 300-row data table ─────────────────────────────────────────────────
/** A CSV export pasted as a GFM table — the "just show me my data" case. */
export function bigDataTable(rows = 300, seed = 2): string {
  const r = rng(seed);
  const cols = ["Order", "Customer", "Region", "SKU", "Qty", "Unit $", "Total $", "Shipped", "Notes"];
  const lines = [
    "# Open orders export",
    "",
    `Pulled from the order system — ${rows} open orders.`,
    "",
    `| ${cols.join(" | ")} |`,
    `|${cols.map((_, i) => (i >= 4 && i <= 6 ? "---:" : "---")).join("|")}|`,
  ];
  const regions = ["West", "East", "Central", "North", "South"];
  for (let i = 0; i < rows; i++) {
    const qty = 1 + Math.floor(r() * 40);
    const unit = 5 + r() * 200;
    lines.push(
      `| SO-${20000 + i} | Customer ${Math.floor(r() * 900)} | ${regions[i % 5]} | SKU-${Math.floor(r() * 99999)} | ${qty} | ${unit.toFixed(2)} | ${(qty * unit).toFixed(2)} | ${r() < 0.5 ? "yes" : "no"} | ${r() < 0.2 ? sentence(r, 4, 9) : ""} |`,
    );
  }
  lines.push("", "_Totals are pre-tax._");
  return lines.join("\n");
}

// ── 3. AI answer with dozens of code blocks ───────────────────────────────
const LANG_SNIPPETS: Array<[string, string]> = [
  ["typescript", "export async function fetchOrders(orgId: string): Promise<Order[]> {\n  const { data, error } = await supabase.from('orders').select('*').eq('organization_id', orgId);\n  if (error) throw error;\n  return data ?? [];\n}"],
  ["python", "import asyncio\n\nasync def main():\n    results = await asyncio.gather(*(fetch(i) for i in range(10)))\n    print(sum(r.total for r in results))\n\nasyncio.run(main())"],
  ["sql", "SELECT customer_id, SUM(total) AS revenue\nFROM orders\nWHERE created_at >= now() - interval '30 days'\nGROUP BY customer_id\nORDER BY revenue DESC\nLIMIT 20;"],
  ["bash", "#!/usr/bin/env bash\nset -euo pipefail\nfor f in logs/*.gz; do\n  zcat \"$f\" | grep -c ERROR || true\ndone"],
  ["rust", "fn main() {\n    let v: Vec<u64> = (1..=20).map(|x| x * x).collect();\n    println!(\"{:?}\", v.iter().sum::<u64>());\n}"],
  ["go", "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tch := make(chan int)\n\tgo func() { ch <- 42 }()\n\tfmt.Println(<-ch)\n}"],
  ["java", "public class Main {\n  public static void main(String[] args) {\n    System.out.println(java.util.stream.IntStream.range(0, 10).sum());\n  }\n}"],
  ["css", ".card {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));\n  gap: 1rem;\n}"],
  ["html", "<section class=\"hero\">\n  <h1>Welcome</h1>\n  <p>Start your free trial.</p>\n  <button type=\"button\">Go</button>\n</section>"],
  ["json", "{\n  \"id\": \"ord_123\",\n  \"items\": [{ \"sku\": \"A1\", \"qty\": 2 }],\n  \"total\": 49.5,\n  \"shipped\": false\n}"],
  ["yaml", "services:\n  api:\n    image: api:latest\n    ports: [\"8000:8000\"]\n    environment:\n      LOG_LEVEL: info"],
  ["diff", "- const timeout = 1000;\n+ const timeout = 5000;\n  retry(fetchOrders, { timeout });"],
];

export function aiAnswerManyCodeBlocks(blocks = 60, seed = 3): string {
  const r = rng(seed);
  const parts = [
    "Here is a complete walkthrough of the order-sync service, one piece at a time.",
    "",
  ];
  for (let i = 0; i < blocks; i++) {
    const [lang, code] = LANG_SNIPPETS[i % LANG_SNIPPETS.length];
    parts.push(`### Step ${i + 1} — ${lang}`, "", paragraph(r, 2), "", "```" + lang, code, "```", "");
  }
  parts.push("That covers every piece. Let me know which step you want to go deeper on.");
  return parts.join("\n");
}

// ── 4. Deeply nested lists and quotes ─────────────────────────────────────
export function deeplyNested(depth = 12, seed = 4): string {
  const r = rng(seed);
  const parts = ["# Troubleshooting tree", ""];
  for (let d = 0; d < depth; d++) parts.push(`${"  ".repeat(d)}- Level ${d + 1}: ${sentence(r, 4, 10)}`);
  for (let d = depth - 1; d >= 0; d--) parts.push(`${"  ".repeat(d)}1. Back out ${d + 1}: ${sentence(r, 4, 10)}`);
  parts.push("");
  for (let d = 1; d <= depth; d++) parts.push(`${"> ".repeat(d)}${sentence(r, 5, 12)}`);
  parts.push("");
  // A quote containing a list containing code.
  parts.push("> - Quoted list item", ">   ```ts", ">   const inQuote = true;", ">   ```", "> - Second item", "");
  return parts.join("\n");
}

// ── 5. Mermaid + math heavy ───────────────────────────────────────────────
export function mermaidAndMath(diagrams = 12, equations = 80, seed = 5): string {
  const r = rng(seed);
  const parts = ["# Process design notes", ""];
  for (let i = 0; i < diagrams; i++) {
    parts.push(`## Diagram ${i + 1}`, "", "```mermaid", "sequenceDiagram", "  participant U as User", "  participant A as API", "  participant D as DB", "  U->>A: POST /orders", "  A->>D: insert", "  D-->>A: row", "  A-->>U: 201", "```", "");
  }
  for (let i = 0; i < equations; i++) {
    parts.push(`Equation ${i + 1}: $x_{${i}} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ and ${sentence(r, 4, 8)}`, "");
    if (i % 10 === 0) parts.push("$$", `\\sum_{k=0}^{${i + 5}} \\binom{n}{k} p^k (1-p)^{n-k} = 1`, "$$", "");
  }
  return parts.join("\n");
}

// ── 6. HTML fragments mixed with markdown ─────────────────────────────────
export function htmlFragments(repeats = 30, seed = 6): string {
  const r = rng(seed);
  const parts = ["# Release notes", ""];
  for (let i = 0; i < repeats; i++) {
    parts.push(
      `<details>`,
      `<summary>Version 3.${i}.0</summary>`,
      "",
      paragraph(r, 2),
      "",
      `<table><tr><th>Change</th><th>Owner</th></tr><tr><td>${sentence(r, 3, 6)}</td><td>team-${i % 4}</td></tr></table>`,
      "",
      `</details>`,
      "",
      `<kbd>Ctrl</kbd>+<kbd>K</kbd> opens search. <sup>${i}</sup> <mark>highlighted</mark> <br/>`,
      "",
    );
  }
  return parts.join("\n");
}

// ── 7. Long lines ─────────────────────────────────────────────────────────
/** Minified JSON, a base64 blob and a huge URL — pasted logs do this. */
export function longLines(seed = 7): string {
  const r = rng(seed);
  const b64 = Array.from({ length: 40_000 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[Math.floor(r() * 64)]).join("");
  const minified = JSON.stringify(Array.from({ length: 400 }, (_, i) => ({ id: i, name: `item-${i}`, tags: ["a", "b"], price: +(r() * 100).toFixed(2) })));
  const url = "https://example.com/search?" + Array.from({ length: 300 }, (_, i) => `q${i}=${Math.floor(r() * 1e6)}`).join("&");
  const paragraphLine = Array.from({ length: 300 }, () => sentence(r)).join(" ");
  return ["# Pasted log dump", "", paragraphLine, "", "```", minified, "```", "", url, "", "`" + b64 + "`", ""].join("\n");
}

// ── 8. Mixed JSON blocks ──────────────────────────────────────────────────
export function mixedJsonBlocks(count = 40, seed = 8): string {
  const r = rng(seed);
  const parts = ["The tool returned these records:", ""];
  for (let i = 0; i < count; i++) {
    const obj = { id: `rec_${i}`, score: +r().toFixed(3), nested: { path: ["a", "b", i], ok: r() < 0.5 }, notes: sentence(r, 3, 8) };
    if (i % 3 === 0) parts.push("```json", JSON.stringify(obj, null, 2), "```", "");
    else if (i % 3 === 1) parts.push(JSON.stringify(obj), "");
    else parts.push(`Record ${i}: \`${JSON.stringify(obj)}\``, "");
  }
  return parts.join("\n");
}

// ── 9. Pathological-but-plausible (a stream cut mid-construct) ────────────
export function pathological(seed = 9): string {
  const r = rng(seed);
  const parts = ["# Mid-stream snapshot", "", paragraph(r, 3), ""];
  // Emphasis delimiter soup — the classic quadratic trigger in inline parsers.
  parts.push(Array.from({ length: 2000 }, (_, i) => (i % 2 ? "*a" : "**b")).join(" "), "");
  parts.push(Array.from({ length: 1500 }, () => "[").join("") + "link" + Array.from({ length: 1500 }, () => "]").join(""), "");
  parts.push(Array.from({ length: 3000 }, () => "`").join(""), "");
  parts.push(Array.from({ length: 2000 }, () => "_").join("x"), "");
  parts.push("<" + "div ".repeat(2000), "");
  // Half-written table (header + delimiter + partial row).
  parts.push("| a | b | c |", "|---|---|---|", "| 1 | 2 ");
  parts.push("");
  // Unclosed math and unclosed details.
  parts.push("$$", "\\frac{a}{b", "", "<details><summary>open", "");
  // Unclosed fence swallowing the rest.
  parts.push("```typescript", "function unfinished(", ...Array.from({ length: 200 }, (_, i) => `  arg${i}: string,`));
  return parts.join("\n");
}

// ── 10. The megadoc ───────────────────────────────────────────────────────
/** Everything above, concatenated until the document reaches `targetBytes`. */
export function megaDoc(targetBytes: number, seed = 10): string {
  const pieces: string[] = [];
  let size = 0;
  let i = 0;
  const gens = [
    () => technicalReport(12, seed + i),
    () => bigDataTable(120, seed + i),
    () => aiAnswerManyCodeBlocks(24, seed + i),
    () => deeplyNested(8, seed + i),
    () => mermaidAndMath(3, 20, seed + i),
    () => htmlFragments(10, seed + i),
    () => mixedJsonBlocks(20, seed + i),
  ];
  while (size < targetBytes) {
    const next = gens[i % gens.length]();
    pieces.push(next);
    size += next.length + 2;
    i++;
  }
  return pieces.join("\n\n");
}

// ── 11. Many diagrams across a long document (the verifier's shape) ───────
/**
 * A 1 MB operations runbook with 46 diagrams of four kinds spread evenly
 * through it — the shape that froze the studio 38–75 s and a chat answer's
 * Preview 51 s before diagrams drew only near the viewport (verifier round 1).
 */
export function manyDiagramsLongDoc(targetBytes = 1_000_000, diagrams = 46, seed = 11): string {
  const r = rng(seed);
  const kinds = [
    (i: number) => `flowchart LR\n  A${i}[Ingest ${i}] --> B${i}{Healthy?}\n  B${i} -- yes --> C${i}[Serve]\n  B${i} -- no --> D${i}[Page on-call]`,
    (i: number) => `sequenceDiagram\n  participant C as Client\n  participant S as Service ${i}\n  C->>S: request\n  S-->>C: 200 OK`,
    (i: number) => `stateDiagram-v2\n  [*] --> Idle${i}\n  Idle${i} --> Busy${i}: job\n  Busy${i} --> Idle${i}: done`,
    (i: number) => `gantt\n  title Rollout ${i}\n  dateFormat YYYY-MM-DD\n  section Phase\n  Canary :a${i}, 2026-09-01, 3d\n  Fleet :after a${i}, 5d`,
  ];
  const perGap = Math.floor(targetBytes / (diagrams + 1));
  const parts: string[] = ["# Storage fleet runbook", ""];
  for (let d = 0; d <= diagrams; d++) {
    let size = 0;
    while (size < perGap) {
      const p = paragraph(r, 5);
      parts.push(p, "");
      size += p.length + 2;
    }
    if (d < diagrams) parts.push(`## Diagram ${d + 1}`, "", "```mermaid", kinds[d % kinds.length](d), "```", "");
  }
  return parts.join("\n");
}

export interface StressFixture {
  name: string;
  /** The real situation this document stands for. */
  useCase: string;
  build: () => string;
}

export const STRESS_CORPUS: StressFixture[] = [
  { name: "technical-report", useCase: "An agent-written quarterly operations report", build: () => technicalReport() },
  { name: "data-table-300", useCase: "A 300-row order export pasted as a table", build: () => bigDataTable() },
  { name: "ai-answer-60-code-blocks", useCase: "A coding answer with 60 code blocks in 12 languages", build: () => aiAnswerManyCodeBlocks() },
  { name: "deeply-nested", useCase: "A troubleshooting tree nested 12 levels deep", build: () => deeplyNested() },
  { name: "mermaid-math", useCase: "Design notes with diagrams and 80 equations", build: () => mermaidAndMath() },
  { name: "html-fragments", useCase: "Release notes mixing HTML details/tables with markdown", build: () => htmlFragments() },
  { name: "long-lines", useCase: "A pasted log dump: minified JSON, base64, a huge URL", build: () => longLines() },
  { name: "mixed-json", useCase: "Tool output mixing fenced, bare and inline JSON", build: () => mixedJsonBlocks() },
  { name: "pathological-midstream", useCase: "A stream cut mid-table, mid-math, mid-fence with delimiter soup", build: () => pathological() },
  { name: "mega-1mb", useCase: "A 1 MB knowledge-base document", build: () => megaDoc(1_000_000) },
  { name: "mega-5mb", useCase: "A 5 MB pasted book-length document", build: () => megaDoc(5_000_000) },
  { name: "diagrams-46-1mb", useCase: "A 1 MB runbook with 46 diagrams spread through it", build: () => manyDiagramsLongDoc() },
];
