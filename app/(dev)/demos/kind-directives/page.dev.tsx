"use client";

/**
 * Kind Directives — the live render proof (KD5b).
 *
 * Every fence below goes through the REAL pipeline: MarkdownStream →
 * content-splitter-v2 (`detectJsonBlockType`) → block dispatch (`matrx`) →
 * MatrxEnvelopeBlock → `decodeDirective` → the slug/class renderer registry.
 * Nothing here is a mock: these are the exact strings aidream mints (the
 * conversation-value fence is byte-for-byte what
 * `services/conversation_values/models.py:build_value_fence` produces) and the
 * exact strings stored conversations already hold.
 *
 * WHAT THIS PAGE EXISTS TO CATCH. Until 2026-08-25 the client detected a
 * directive by `"matrx_version" in value`, while aidream had been minting the
 * two-key `__kind` shell in production since 2026-08-23. Row 1 rendered to the
 * user as RAW JSON. If any row here ever shows raw JSON again, the same class
 * of break is back.
 *
 * Spec: docs/protocol/KIND_DIRECTIVES.md.
 */

import MarkdownStream from "@/components/MarkdownStream";

interface Row {
  title: string;
  note: string;
  markdown: string;
}

function fence(shell: unknown): string {
  return ["```matrx", JSON.stringify(shell, null, 2), "```"].join("\n");
}

const ROWS: Row[] = [
  {
    title: "1 · Reference · the current two-key shell (THE BREAK)",
    note: "What aidream mints today. Must render as a live chip, never as raw JSON.",
    markdown: `Here is the brief you asked about:\n\n${fence({
      __kind: "directive_v1_reference_conversation_value",
      items: [{ key: "research_brief", label: "Research brief" }],
    })}`,
  },
  {
    title: "2 · Reference · a record noun, from the copy-shortcut builders",
    note: "The prefix rule: nothing registers `note` by name — the `reference` class registration renders it.",
    markdown: fence({
      __kind: "directive_v1_reference_note",
      items: [{ id: "00000000-0000-4000-8000-000000000001", label: "Kickoff notes" }],
    }),
  },
  {
    title: "3 · Reference · a STORED 4-key fence (the legacy shim)",
    note: "Written before 2026-08-23 and still in conversations. Must render identically to row 2.",
    markdown: fence({
      matrx_version: 1,
      kind: "reference",
      type: "note",
      items: [{ id: "00000000-0000-4000-8000-000000000001", label: "Kickoff notes" }],
    }),
  },
  {
    title: "4 · Write · a side effect that arrived as CONTENT",
    note: "Position law: never auto-executed. The prefix FLOOR names it from the catalog and offers an explicit Apply.",
    markdown: fence({
      __kind: "directive_v1_create_agent",
      items: [{ name: "Research assistant", goals: "Summarize sources" }],
    }),
  },
  {
    title: "5 · Action · a Kind Action with a registered renderer",
    note: "`plan_tree` resolves by exact slug, overriding its class rule.",
    markdown: fence({
      __kind: "directive_v1_action_plan_tree",
      items: [
        {
          site_id: null,
          site: "example.com",
          nodes: [
            {
              label: "Pricing",
              node_type: "pillar",
              slug: "pricing",
              children: [{ label: "Pricing FAQ", node_type: "article" }],
            },
          ],
        },
      ],
    }),
  },
  {
    title: "6 · Not a directive — must stay raw",
    note: "An ordinary kind instance in a matrx fence is NOT a directive. The reserved prefix is what keeps the namespaces disjoint.",
    markdown: fence({ __kind: "flashcard_set", cards: [] }),
  },
];

export default function KindDirectivesDemoPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            Kind Directives — live render proof
          </h1>
          <p className="text-sm text-muted-foreground">
            Real fences through the real pipeline. Rows 1–5 must render as chips
            or cards; row 6 must stay raw.
          </p>
        </header>

        {ROWS.map((row) => (
          <section
            key={row.title}
            className="rounded-lg border border-border bg-card p-4"
          >
            <h2 className="text-sm font-medium text-foreground">{row.title}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{row.note}</p>
            <div className="rounded-md border border-border bg-background p-3">
              <MarkdownStream content={row.markdown} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
