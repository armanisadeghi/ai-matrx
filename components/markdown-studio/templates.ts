// components/markdown-studio/templates.ts
// Curated starter samples. Each one is hand-picked to exercise a
// specific block type the V2 splitter can detect, so users can
// discover the platform's capabilities by clicking through them.

export interface StudioTemplate {
  id: string;
  title: string;
  blurb: string;
  /** Lucide icon name — referenced at render time. */
  icon:
    | "FileCode"
    | "Table"
    | "Brain"
    | "Image"
    | "Quote"
    | "ListChecks"
    | "GitBranch"
    | "BarChart3"
    | "Mic"
    | "PenTool";
  blocks: string[];
  content: string;
}

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: "kitchen-sink",
    title: "Kitchen sink",
    blurb: "Every common block type at once — the fastest way to see what's possible.",
    icon: "PenTool",
    blocks: ["code", "table", "thinking", "image"],
    content: `# Markdown Studio

Welcome to the **kitchen sink** sample — every common block type, side by side.

## A regular paragraph

Markdown Studio reads your content through the same V2 block splitter that powers \`MarkdownStream\` everywhere in the app. Try editing this paragraph and watch the live block count update in the header.

## Code block (with language)

\`\`\`ts
type Block = {
  type: "code" | "table" | "thinking" | "text";
  content: string;
};

function classify(input: string): Block {
  return { type: "text", content: input };
}
\`\`\`

## Table

| Block type | Detected by | Renderer |
|-----------|-------------|----------|
| code | fence parser | \`<pre>\` with syntax highlighting |
| table | pipe parser | \`<table>\` |
| thinking | XML tag parser | collapsible panel |
| text | fallback | plain paragraph |

## Hidden reasoning

<thinking>
The model uses these blocks to show its work without polluting the main response. Click to expand in the live preview.
</thinking>

## And a closing image

![Sample chart](https://placehold.co/600x300/png?text=Block+detection)

That's the sketch — load other templates from the picker to dig deeper.
`,
  },
  {
    id: "code-showcase",
    title: "Code showcase",
    blurb: "Fenced code blocks across languages, plus inline code.",
    icon: "FileCode",
    blocks: ["code"],
    content: `# Code blocks

A simple TypeScript example:

\`\`\`ts
export interface Sample {
  id: string;
  name: string;
  detectedBlocks: string[];
}

export function detect(content: string): Sample[] {
  return [];
}
\`\`\`

A Python sibling:

\`\`\`python
def detect(content: str) -> list[dict]:
    """Return every render block found in the input."""
    return []
\`\`\`

A SQL snippet:

\`\`\`sql
create table public.user_markdown_samples (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid not null references auth.users(id)
);
\`\`\`

Inline code stays inline: use \`detectRenderBlocks(content)\` for a quick sanity check.
`,
  },
  {
    id: "data-tables",
    title: "Data tables",
    blurb: "Pipe-style tables — alignment, headers, multiple rows.",
    icon: "Table",
    blocks: ["table"],
    content: `# Quarterly metrics

| Quarter | Users | MRR     | Churn |
|--------:|------:|--------:|------:|
| Q1 2025 | 1,240 | $14,300 |  3.1% |
| Q2 2025 | 1,890 | $21,800 |  2.7% |
| Q3 2025 | 2,510 | $29,400 |  2.4% |
| Q4 2025 | 3,180 | $37,900 |  2.1% |

A second table — text alignment, mixed types:

| Block type | Frequency | Notes |
|:-----------|:---------:|------:|
| text       | very high | the default fallback |
| code       | high      | most common XML-fenced block |
| table      | medium    | parsed via pipe rules |
| thinking   | medium    | rendered as collapsible |
| image      | low       | url-anchored |
`,
  },
  {
    id: "thinking-blocks",
    title: "Thinking & reasoning",
    blurb: "Hidden \`<thinking>\` and \`<reasoning>\` blocks that collapse in the preview.",
    icon: "Brain",
    blocks: ["thinking", "reasoning"],
    content: `# Visible answer

Here's the short version of the answer for the user.

<thinking>
This is where the model would normally lay out its scratch work — exploring multiple branches, ruling out approaches, and arriving at the final answer. The renderer collapses this by default so users can focus on the conclusion.
</thinking>

# A more involved example

<reasoning>
Step 1: Restate the problem in your own words.
Step 2: Identify the constraints and unknowns.
Step 3: Recall related techniques.
Step 4: Plan a path forward.
Step 5: Execute and verify.
</reasoning>

The final answer lives in plain text outside the reasoning block.
`,
  },
  {
    id: "decision-tree",
    title: "Decision prompt",
    blurb: "An interactive \`<decision>\` block with multiple options.",
    icon: "GitBranch",
    blocks: ["decision"],
    content: `# Choose your direction

Before I draft the email, I'd like to confirm the tone.

<decision prompt="Pick a tone for the outreach email" id="tone-choice">
<option label="Warm">
A friendly opener, light humor, sign off with a small personal note.
</option>
<option label="Direct">
Skip the small talk. State the ask in the first sentence, list the next steps, done.
</option>
<option label="Formal">
Full salutations, no contractions, end with a complete sign-off block.
</option>
</decision>

Once you've picked, I'll generate the draft.
`,
  },
  {
    id: "lists-and-quotes",
    title: "Lists & quotes",
    blurb: "Nested lists, ordered lists, and blockquotes.",
    icon: "Quote",
    blocks: ["text"],
    content: `# Project checklist

## Today
- [ ] Wire up the editor state
- [x] Migrate samples to Supabase
- [ ] Build the analysis tab

## This week
1. Ship the user-level playground
2. Add streaming simulation visuals
3. Write the FEATURE.md

> "Premature optimization is the root of all evil — yet we should not pass up our opportunities in that critical 3%."
>
> — Donald Knuth, *Structured Programming with go to Statements*

A second quote, this time multi-line:

> The reasonable person adapts themselves to the world; the unreasonable
> one persists in trying to adapt the world to themselves. Therefore all
> progress depends on the unreasonable person.
`,
  },
];

export function findTemplateById(id: string): StudioTemplate | undefined {
  return STUDIO_TEMPLATES.find((t) => t.id === id);
}
