"use client";

/**
 * Bring your work — everything a person needs to drive AI Matrx from their own AI (Claude,
 * ChatGPT, Cursor) and move their work in from Notion, Airtable, Sheets or ClickUp.
 *
 * Lane NOTION-MIGRATE (Arman, 2026-10-04). "Bring your work" is Arman's own working label
 * (the vocabulary has no word for this surface yet). The page is layout, not prose: each
 * section is a group of rows with a copy or download control. What it points at:
 *   · the AI Matrx MCP (aidream `api/mcp/people/`) at MATRX_MCP_URL, signed in with a personal
 *     key made right here (ApiKeysTab, the same component as Settings → API keys);
 *   · the public Claude plugin + skill zips served from `public/claude/` (rebuilt by
 *     `scripts/build-claude-plugin.sh`);
 *   · template prompts that the skills (or the MCP tools alone) carry out.
 */

import { useState } from "react";
import { Download } from "lucide-react";
import { Badge, Button, RowGroup, SettingRow, Tabs } from "@ai-matrx/design-system/controls";

import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import ApiKeysTab from "@/features/settings/tabs/ApiKeysTab";

const MATRX_MCP_URL = "https://server.app.matrxserver.com/api/matrx-mcp";
const MARKETPLACE_URL = "https://www.aimatrx.com/claude/marketplace.json";

type Client = "claude-code" | "claude-app" | "chatgpt" | "cursor";

const CLIENTS: readonly { value: Client; label: string }[] = [
  { value: "claude-code", label: "Claude Code" },
  { value: "claude-app", label: "Claude app" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "cursor", label: "Cursor" },
];

interface Step {
  label: string;
  /** Text the person copies; absent when the step is a click in another app. */
  copy?: string;
}

const CONNECT: Record<Client, Step[]> = {
  "claude-code": [
    { label: "Make a personal key below, then run",
      copy: `claude mcp add --transport http ai-matrx ${MATRX_MCP_URL} --header "Authorization: Bearer YOUR_KEY"` },
    { label: "For the import scripts", copy: "export AI_MATRX_API_KEY=YOUR_KEY" },
  ],
  "claude-app": [
    { label: "Settings → Connectors → Add custom connector" },
    { label: "Connector URL", copy: MATRX_MCP_URL },
    { label: "Sign in to AI Matrx when asked" },
  ],
  chatgpt: [
    { label: "Settings → Connectors → Create" },
    { label: "MCP server URL", copy: MATRX_MCP_URL },
    { label: "Authentication: OAuth, then sign in to AI Matrx" },
  ],
  cursor: [
    { label: "Add to ~/.cursor/mcp.json",
      copy: JSON.stringify(
        { mcpServers: { "ai-matrx": { url: MATRX_MCP_URL, headers: { Authorization: "Bearer YOUR_KEY" } } } },
        null,
        2,
      ) },
  ],
};

const PLUGIN_STEPS: Step[] = [
  { label: "Add the AI Matrx marketplace", copy: `claude plugin marketplace add ${MARKETPLACE_URL}` },
  { label: "Install the plugin", copy: "claude plugin install ai-matrx@ai-matrx" },
  { label: "Give it your key", copy: "export AI_MATRX_API_KEY=YOUR_KEY" },
];

const SKILLS: readonly { name: string; label: string; line: string }[] = [
  { name: "migrate-notion-to-ai-matrx", label: "Copy Notion into AI Matrx", line: "Every database, row, link, file, page and view" },
  { name: "build-ai-matrx-agents", label: "Split a task into agents", line: "One big Claude task → a team of AI Matrx agents" },
];

function moveIn(source: string, key: string, read: string): string {
  return [
    `Copy my entire ${source} into AI Matrx.`,
    `Read everything with the ${read}. For each table, make an AI Matrx table with the AI Matrx MCP (tables create_table) that has a unique "${key}" text column, a "Page content" rich_text column when rows have bodies, and one column per field with the closest type.`,
    `Once every table exists, add the links as relation columns with "many": true. Upsert every row in batches of 100 with key_column "${key}", then write the links as {"match": "${key}", "keys": [...]} and the attachments as {"url": ..., "name": ...}.`,
    `Recreate my views with create_view. Show me the plan in plain words before writing anything, and finish with a count of every table, ${source} against AI Matrx.`,
  ].join("\n\n");
}

const PROMPTS: readonly { id: string; label: string; badge?: string; text: string }[] = [
  {
    id: "notion",
    label: "Notion",
    badge: "Skill",
    text: "Copy my entire Notion into AI Matrx. Use the migrate-notion-to-ai-matrx skill: show me the plan in plain words, and move everything once I say yes.",
  },
  { id: "airtable", label: "Airtable", text: moveIn("Airtable base", "Airtable ID", "Airtable MCP") },
  { id: "sheets", label: "Google Sheets", text: moveIn("Google Sheets workbook", "Row key", "Google Drive connector, one sheet per table") },
  { id: "clickup", label: "ClickUp", text: moveIn("ClickUp workspace", "ClickUp ID", "ClickUp MCP, one list per table") },
  {
    id: "agents",
    label: "Split my task into agents",
    badge: "Skill",
    text: "Split my big Claude task into AI Matrx agents. Use the build-ai-matrx-agents skill: read my task, propose one agent per job working on my AI Matrx tables, and build and test them once I say yes.",
  },
];

function StepRows({ steps }: { steps: Step[] }) {
  return (
    <>
      {steps.map((step) => (
        <div key={step.label} className="flex flex-col gap-1 px-3 py-2">
          <div className="flex min-h-7 items-center gap-2">
            <span className="flex-1 text-[13px] text-foreground">{step.label}</span>
            {step.copy ? <CopyButton content={step.copy} label={step.label} /> : null}
          </div>
          {step.copy ? (
            <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
              {step.copy}
            </pre>
          ) : null}
        </div>
      ))}
    </>
  );
}

export function BringYourWorkPage() {
  const [client, setClient] = useState<Client>("claude-code");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">Connect your AI</h2>
        <Tabs value={client} onValueChange={setClient} data={CLIENTS} aria-label="Your AI app" />
        <RowGroup>
          <SettingRow label="AI Matrx MCP">
            <CopyButton content={MATRX_MCP_URL} label="AI Matrx MCP URL" />
          </SettingRow>
          <StepRows steps={CONNECT[client]} />
        </RowGroup>
      </section>

      <section className="flex flex-col gap-2">
        <ApiKeysTab />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">Claude plugin</h2>
        <RowGroup>
          <StepRows steps={PLUGIN_STEPS} />
        </RowGroup>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">Skills</h2>
        <RowGroup>
          {SKILLS.map((skill) => (
            <SettingRow key={skill.name} label={skill.label} line={skill.line}>
              <Button variant="outline" icon={<Download />} asChild>
                <a href={`/claude/skills/${skill.name}.zip`} download>
                  Download
                </a>
              </Button>
            </SettingRow>
          ))}
        </RowGroup>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">Template prompts</h2>
        <RowGroup>
          {PROMPTS.map((prompt) => (
            <div key={prompt.id} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-foreground">{prompt.label}</span>
                {prompt.badge ? <Badge tone="info">{prompt.badge}</Badge> : null}
                <span className="flex-1" />
                <CopyButton content={prompt.text} label={`${prompt.label} prompt`} />
              </div>
              <p className="m-0 whitespace-pre-wrap text-xs text-muted-foreground">{prompt.text}</p>
            </div>
          ))}
        </RowGroup>
      </section>
    </div>
  );
}
