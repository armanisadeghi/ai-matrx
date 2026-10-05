"use client";

/**
 * Connect your AI (route /bring-your-work) — drive AI Matrx from the person's own AI (Claude
 * Code, the Claude app, ChatGPT, Cursor) and move their work in from Notion, Airtable, Sheets or
 * ClickUp.
 *
 * Lane NOTION-MIGRATE (Arman, 2026-10-04). Rebuilt the same day as a guided flow after Arman
 * called the first version "a wall of text": pick your AI → numbered steps for that AI only (each
 * one line + one action, checked once done) → "What do you want to do?" cards whose prompt text
 * stays collapsed until asked for. What it points at:
 *   · the AI Matrx MCP (aidream `api/mcp/people/`) at MATRX_MCP_URL, signed in with a personal
 *     key made right here through `personalApiKeysService` (the same doors as Settings → API
 *     keys). The secret lives in component state only and is filled into the connect command;
 *   · the public Claude plugin + skill zips served from `public/claude/` (rebuilt by
 *     `scripts/build-claude-plugin.sh`);
 *   · template prompts that the skills (or the MCP tools alone) carry out.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  KeyRound,
  ListChecks,
  MousePointer2,
  Network,
  Table2,
  Terminal,
} from "lucide-react";
import { Badge, Button, Select } from "@ai-matrx/design-system/controls";

import { BrandGlyph } from "@/components/icons/brand-glyphs";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { GoogleSheetsMark, NotionMark } from "@/features/connectors/marks";
import { useUserOrganizations } from "@/features/organizations/hooks";
import {
  createPersonalApiKey,
  listPersonalApiKeys,
  type CreatedPersonalApiKey,
} from "@/features/settings/personalApiKeysService";
import { cn } from "@/lib/utils";

const MATRX_MCP_URL = "https://server.app.matrxserver.com/api/matrx-mcp";
const MARKETPLACE_URL = "https://www.aimatrx.com/claude/marketplace.json";
const KEY_PLACEHOLDER = "YOUR_KEY";
const MANAGE_KEYS_HREF = "/user-settings/integrations/api-keys";

type Client = "claude-code" | "claude-app" | "chatgpt" | "cursor";

const CLIENTS: readonly { value: Client; label: string; mark: React.ReactNode }[] = [
  { value: "claude-code", label: "Claude Code", mark: <Terminal className="size-6" /> },
  { value: "claude-app", label: "Claude app", mark: <BrandGlyph brand="claude" colored className="size-6" /> },
  { value: "chatgpt", label: "ChatGPT", mark: <BrandGlyph brand="openai" colored className="size-6" /> },
  { value: "cursor", label: "Cursor", mark: <MousePointer2 className="size-6" /> },
];

/** One numbered step. `copy` is the text the person copies; `{key}` marks where their key goes. */
interface StepDef {
  id: "key" | "connect" | "plugin" | "skills";
  title: string;
  hint?: string;
  copy?: string;
}

function steps(client: Client): StepDef[] {
  switch (client) {
    case "claude-code":
      return [
        { id: "key", title: "Get your key" },
        {
          id: "connect",
          title: "Connect",
          hint: "Run in your terminal",
          copy: `claude mcp add --transport http ai-matrx ${MATRX_MCP_URL} --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`,
        },
        {
          id: "plugin",
          title: "Add the AI Matrx plugin",
          hint: "Run in your terminal",
          copy: [
            `claude plugin marketplace add ${MARKETPLACE_URL}`,
            "claude plugin install ai-matrx@ai-matrx",
            `export AI_MATRX_API_KEY=${KEY_PLACEHOLDER}`,
          ].join("\n"),
        },
      ];
    case "claude-app":
      return [
        {
          id: "connect",
          title: "Connect",
          hint: "Settings → Connectors → Add custom connector, then sign in",
          copy: MATRX_MCP_URL,
        },
        { id: "skills", title: "Add the skills", hint: "Settings → Capabilities → Skills → Upload" },
      ];
    case "chatgpt":
      return [
        {
          id: "connect",
          title: "Connect",
          hint: "Settings → Connectors → Create · OAuth, then sign in",
          copy: MATRX_MCP_URL,
        },
      ];
    case "cursor":
      return [
        { id: "key", title: "Get your key" },
        {
          id: "connect",
          title: "Connect",
          hint: "Add to ~/.cursor/mcp.json",
          copy: JSON.stringify(
            {
              mcpServers: {
                "ai-matrx": { url: MATRX_MCP_URL, headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` } },
              },
            },
            null,
            2,
          ),
        },
      ];
  }
}

const SKILLS: readonly { name: string; label: string }[] = [
  { name: "migrate-notion-to-ai-matrx", label: "Notion skill" },
  { name: "build-ai-matrx-agents", label: "Agents skill" },
];

function moveIn(source: string, key: string, read: string): string {
  return [
    `Copy my entire ${source} into AI Matrx.`,
    `Read everything with the ${read}. For each table, make an AI Matrx table with the AI Matrx MCP (tables create_table) that has a unique "${key}" text column, a "Page content" rich_text column when rows have bodies, and one column per field with the closest type.`,
    `Once every table exists, add the links as relation columns with "many": true. Upsert every row in batches of 100 with key_column "${key}", then write the links as {"match": "${key}", "keys": [...]} and the attachments as {"url": ..., "name": ...}.`,
    `Recreate my views with create_view. Show me the plan in plain words before writing anything, and finish with a count of every table, ${source} against AI Matrx.`,
  ].join("\n\n");
}

const PROMPTS: readonly { id: string; label: string; mark: React.ReactNode; badge?: string; text: string }[] = [
  {
    id: "notion",
    label: "Move from Notion",
    mark: <NotionMark className="size-5" />,
    badge: "Skill",
    text: "Copy my entire Notion into AI Matrx. Use the migrate-notion-to-ai-matrx skill: show me the plan in plain words, and move everything once I say yes.",
  },
  {
    id: "airtable",
    label: "Move from Airtable",
    mark: <Table2 className="size-5" />,
    text: moveIn("Airtable base", "Airtable ID", "Airtable MCP"),
  },
  {
    id: "sheets",
    label: "Move from Google Sheets",
    mark: <GoogleSheetsMark colored className="size-5" />,
    text: moveIn("Google Sheets workbook", "Row key", "Google Drive connector, one sheet per table"),
  },
  {
    id: "clickup",
    label: "Move from ClickUp",
    mark: <ListChecks className="size-5" />,
    text: moveIn("ClickUp workspace", "ClickUp ID", "ClickUp MCP, one list per table"),
  },
  {
    id: "agents",
    label: "Split my task into agents",
    mark: <Network className="size-5" />,
    badge: "Skill",
    text: "Split my big Claude task into AI Matrx agents. Use the build-ai-matrx-agents skill: read my task, propose one agent per job working on my AI Matrx tables, and build and test them once I say yes.",
  },
];

/** A Copy button that flips to "Copied" and reports the copy so the step can check itself. */
function CopyAction({
  text,
  label = "Copy",
  variant = "outline",
  onCopied,
}: {
  text: string;
  label?: string;
  variant?: "primary" | "outline";
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant={variant}
      icon={copied ? <Check /> : <Copy />}
      onClick={() =>
        void copyToClipboard(text, {
          onSuccess: () => {
            setCopied(true);
            onCopied?.();
          },
        })
      }
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <pre /* rich-content-exempt: scraped page text or prompt text shown verbatim */ className="m-0 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-foreground">
      {text}
    </pre>
  );
}

function StepShell({
  index,
  done,
  title,
  hint,
  action,
  children,
}: {
  index: number;
  done: boolean;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-3.5" /> : index}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium text-foreground">
              {title}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
            {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
          </div>
          {action}
        </div>
        {children}
      </div>
    </li>
  );
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function KeyStep({
  index,
  client,
  created,
  onCreated,
}: {
  index: number;
  client: Client;
  created: CreatedPersonalApiKey | null;
  onCreated: (key: CreatedPersonalApiKey) => void;
}) {
  const { organizations, loading: orgsLoading } = useUserOrganizations();
  const [orgId, setOrgId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeKeys, setActiveKeys] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void listPersonalApiKeys().then(
      (rows) => live && setActiveKeys(rows.filter((k) => k.status === "active").length),
      () => live && setActiveKeys(null),
    );
    return () => {
      live = false;
    };
  }, []);

  // Sole membership needs no choice; with several, the person picks.
  const chosenOrgId = orgId || (organizations.length === 1 ? organizations[0].id : "");
  const label = CLIENTS.find((c) => c.value === client)?.label ?? "My AI";

  const create = async () => {
    if (!chosenOrgId) return;
    setCreating(true);
    setError(null);
    await createPersonalApiKey(label, chosenOrgId).then(onCreated, (e: unknown) =>
      setError(errorMessage(e)),
    );
    setCreating(false);
  };

  const manage = (
    <Link href={MANAGE_KEYS_HREF} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
      Manage keys
    </Link>
  );

  if (created) {
    return (
      <StepShell
        index={index}
        done
        title="Get your key"
        hint="Shown once · filled into the steps below"
        action={<CopyAction text={created.api_key} label="Copy key" />}
      >
        <CodeBlock text={created.api_key} />
        <div>{manage}</div>
      </StepShell>
    );
  }

  const hint =
    activeKeys && activeKeys > 0
      ? `You have ${activeKeys} active · a new one is fine`
      : "A key that lets your AI work as you";

  return (
    <StepShell
      index={index}
      done={false}
      title="Get your key"
      hint={hint}
      action={
        <div data-tour="byw-get-key" className="flex flex-wrap items-center gap-0">
          {organizations.length > 1 ? (
            <Select
              aria-label="Organization"
              value={orgId}
              onValueChange={setOrgId}
              options={[
                { value: "", label: "Pick an organization" },
                ...organizations.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          ) : null}
          <Button
            variant="primary"
            icon={<KeyRound />}
            disabled={!chosenOrgId || creating || orgsLoading}
            onClick={() => void create()}
          >
            {creating ? "Creating…" : "Create key"}
          </Button>
        </div>
      }
    >
      {error ? <p className="m-0 text-xs text-destructive">{error}</p> : null}
      <div>{manage}</div>
    </StepShell>
  );
}

export function BringYourWorkPage() {
  const [client, setClient] = useState<Client>("claude-code");
  const [created, setCreated] = useState<CreatedPersonalApiKey | null>(null);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [openPrompt, setOpenPrompt] = useState<string | null>(null);

  const markDone = (id: string) =>
    setDone((current) => (current.has(id) ? current : new Set(current).add(id)));
  const withKey = (text: string) =>
    created ? text.replaceAll(KEY_PLACEHOLDER, created.api_key) : text;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6">
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-medium text-foreground">Pick your AI</h2>
        <div data-tour="byw-pick-ai" role="radiogroup" aria-label="Your AI" className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {CLIENTS.map((c) => {
            const selected = c.value === client;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setClient(c.value)}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border bg-card px-3 py-4 text-sm font-medium text-foreground transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary ring-1 ring-primary" : "border-border hover:bg-accent",
                )}
              >
                {c.mark}
                {c.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-medium text-foreground">Set it up</h2>
        <ol data-tour="byw-connect" className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
          {steps(client).map((step, i) => {
            const index = i + 1;
            const doneKey = `${client}:${step.id}`;
            if (step.id === "key") {
              return (
                <KeyStep key={doneKey} index={index} client={client} created={created} onCreated={setCreated} />
              );
            }
            if (step.id === "skills") {
              return (
                <StepShell
                  key={doneKey}
                  index={index}
                  done={done.has(doneKey)}
                  title={step.title}
                  hint={step.hint}
                  action={
                    <div className="flex flex-wrap items-center gap-0">
                      {SKILLS.map((skill) => (
                        <Button key={skill.name} variant="outline" icon={<Download />} asChild>
                          <a
                            href={`/claude/skills/${skill.name}.zip`}
                            download
                            onClick={() => markDone(doneKey)}
                          >
                            {skill.label}
                          </a>
                        </Button>
                      ))}
                    </div>
                  }
                />
              );
            }
            const text = withKey(step.copy ?? "");
            return (
              <StepShell
                key={doneKey}
                index={index}
                done={done.has(doneKey)}
                title={step.title}
                hint={step.hint}
                action={<CopyAction text={text} variant="primary" onCopied={() => markDone(doneKey)} />}
              >
                <CodeBlock text={text} />
              </StepShell>
            );
          })}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-medium text-foreground">What do you want to do?</h2>
        <div data-tour="byw-move-work" className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {PROMPTS.map((prompt) => {
            const open = openPrompt === prompt.id;
            return (
              <div
                key={prompt.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3",
                  open && "md:col-span-2",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                    {prompt.mark}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{prompt.label}</span>
                  {prompt.badge ? <Badge tone="info">{prompt.badge}</Badge> : null}
                </div>
                <div className="flex flex-wrap items-center gap-0">
                  <CopyAction text={prompt.text} label="Copy prompt" variant="primary" />
                  <Button
                    variant="quiet"
                    iconEnd={<ChevronDown className={cn("transition-transform", open && "rotate-180")} />}
                    aria-expanded={open}
                    onClick={() => setOpenPrompt(open ? null : prompt.id)}
                  >
                    {open ? "Hide prompt" : "Show prompt"}
                  </Button>
                </div>
                {open ? (
                  <p className="m-0 whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {prompt.text}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
