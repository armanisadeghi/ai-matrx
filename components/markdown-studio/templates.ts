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
create table users.user_markdown_samples (
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
  {
    id: "extended-syntax",
    title: "Every syntax",
    blurb: "Callouts, front matter, wikilinks, tabs, footnotes, equations — every extended construct, in a kiln manual.",
    icon: "PenTool",
    blocks: ["text", "code"],
    content: `---
title: Kiln operating manual
owner: Studio lead
revision: 4
tags: [kiln, safety, glaze]
---

# Kiln operating manual

[[toc]]

## Before you load {#sec:loading}

> [!WARNING]
> Never open the lid above 150 °C — the thermal shock cracks shelves.

> [!tip]- Why witness cones?
> The controller measures air; a cone measures *heat work* on the ware.

!!! note "Loading order"
    Heavy pieces low, glazed pieces on posts, nothing touching the elements.

:::important[Read the schedule]
Follow [[Kiln schedule]] for today's firing, and file notes in [[Glaze notes|the glaze book]].
:::

Checklist (tick them off — the preview writes back to the source):

- [ ] Vacuum the element grooves
- [ ] Check the kiln sitter
- [x] Log the previous firing

## Firing ranges

::::tabs
:::tab[Cone 06 bisque]
About 999 °C. Slow ramp through quartz inversion.
:::
:::tab[Cone 6 glaze]
About 1,222 °C — see @fig:shelves for the shelf layout.
:::
::::

::::columns
:::column
**Bisque** hardens clay so glaze sticks.
:::
:::column
**Glaze** melts the surface into glass.
:::
::::

:::figure[Shelf layout for a full glaze load]{#fig:shelves}
Three shelves on 3-inch posts, heaviest ware on the bottom shelf.
:::

:::details[What if a shelf cracks?]
Stop the firing, let it cool fully, and replace the shelf before the next load.
:::

Glossary
: **Bisque** — the first, lower firing.
: **Cone** — a pyrometric indicator that bends at a set heat work.

## Chemistry and heat {#sec:chem}

Water leaves the clay as H~2~O vapor; heat work grows roughly with t^2^ at the peak. ==Never skip the candling hold.== :fire:

$$
\\ce{CaCO3 -> CaO + CO2 ^}
$$

\\[ Q = m c \\Delta T \\label{eq:heat} \\]

Equation \\eqref{eq:heat} sets the energy per load; see @sec:loading for safety.

Temperatures are in :span[degrees Celsius]{color=danger}; the :mark[vent]{color=yellow} must stay open. Press :kbd[Ctrl] + :kbd[S] to save a log, or <kbd>Esc</kbd> to cancel.

*[PPE]: Personal protective equipment

Wear PPE at the kiln. PPE includes kiln gloves and shade 5 glasses.[^1]

<details><summary>Kiln specs</summary>

48 cubic feet, 240 V, 60 A.

</details>

\`\`\`csv
Firing,Cone,Peak °C,Hold min
Bisque,06,999,10
Glaze,6,1222,15
Raku,010,900,0
\`\`\`

<!-- pagebreak -->

## Maintenance log

Replace elements every ~150 firings.

[^1]: Shade 5 welding glasses — ordinary sunglasses do not protect against infrared.
`,
  },
];

export function findTemplateById(id: string): StudioTemplate | undefined {
  return STUDIO_TEMPLATES.find((t) => t.id === id);
}
