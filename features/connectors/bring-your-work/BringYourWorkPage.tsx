"use client";

/**
 * Connect your AI (route /bring-your-work) — use AI Matrx from the person's own AI (Claude,
 * ChatGPT, Claude Code, Cursor) and move their work in from Notion, Airtable, Sheets or ClickUp.
 *
 * Lane NOTION-MIGRATE (Arman, 2026-10-04), round 2. Four numbered steps: pick your AI → connect
 * AI Matrx (one click + AI Matrx sign-in, OAuth — never an API key, never a terminal command) →
 * try it → what do you want to do. Every prompt is a plain sentence the person hands their AI;
 * the AI Matrx MCP server (aidream `api/mcp/people/`) carries the know-how, so there are no
 * skill downloads here. The four `data-tour` targets feed the `connect-your-ai` tutorial
 * (`features/guided-tutorials/registry.ts`).
 */

import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  CodeXml,
  Copy,
  ExternalLink,
  ListChecks,
  MousePointer2,
  Network,
  Table2,
} from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

import { BrandGlyph } from "@/components/icons/brand-glyphs";
import { copyContent } from "@/components/agent-copy/copy-commands";
import { GoogleSheetsMark, NotionMark } from "@/features/connectors/marks";
import { cn } from "@/lib/utils";

const MATRX_MCP_URL = "https://server.app.matrxserver.com/api/matrx-mcp";

type Client = "claude" | "chatgpt" | "claude-code" | "cursor";

const CLIENTS: readonly { value: Client; label: string; mark: React.ReactNode }[] = [
  { value: "claude", label: "Claude", mark: <BrandGlyph brand="claude" colored className="size-6" /> },
  { value: "chatgpt", label: "ChatGPT", mark: <BrandGlyph brand="openai" colored className="size-6" /> },
  { value: "claude-code", label: "Claude Code", mark: <CodeXml className="size-6" /> },
  { value: "cursor", label: "Cursor", mark: <MousePointer2 className="size-6" /> },
];

const TRY_PROMPT = "Say hello to AI Matrx and tell me what you can see there.";

const CLAUDE_CODE_CONNECT = `Please connect me to AI Matrx: add the MCP server ${MATRX_MCP_URL} (HTTP) as "ai-matrx" and sign me in.`;

/** Cursor's one-click install link; the config is base64 JSON, built at render. */
function cursorInstallHref(): string {
  const config = btoa(JSON.stringify({ url: MATRX_MCP_URL }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=ai-matrx&config=${encodeURIComponent(config)}`;
}

const NOTION_MCP_URL = "https://mcp.notion.com/mcp";

/** Claude Code can add both servers itself, so its Notion prompt carries the whole job. */
const NOTION_CLAUDE_CODE_TEXT = `Move my whole Notion workspace into AI Matrx: pages become Spaces (sub-pages, comments, icons and covers kept), databases become tables with all their rows.
1. Make sure two MCP servers are connected; add any that are missing: claude mcp add --transport http notion ${NOTION_MCP_URL} and claude mcp add --transport http ai-matrx ${MATRX_MCP_URL}. If one needs sign-in, tell me to run /mcp and sign in, then wait.
2. Call the AI Matrx how_to tool with topic "notion" and follow it exactly, in its order.
3. Finish with the check list from how_to: counts per database, pages moved, and what could not come over.`;

const MOVES: readonly {
  id: string;
  label: string;
  mark: React.ReactNode;
  app?: string;
  text: string;
  /** Replaces `text` when the person picked Claude Code. */
  claudeCodeText?: string;
}[] = [
  {
    id: "notion",
    label: "Move from Notion",
    mark: <NotionMark className="size-5" />,
    app: "Notion",
    text: "Please move everything from my Notion into AI Matrx: my pages as Spaces, my databases as tables. Keep it all just the way it is, and tell me when it's done.",
    claudeCodeText: NOTION_CLAUDE_CODE_TEXT,
  },
  {
    id: "airtable",
    label: "Move from Airtable",
    mark: <Table2 className="size-5" />,
    app: "Airtable",
    text: "Please move everything from my Airtable into AI Matrx. Keep it all just the way it is, and tell me when it's done.",
  },
  {
    id: "sheets",
    label: "Move from Google Sheets",
    mark: <GoogleSheetsMark colored className="size-5" />,
    app: "Google Sheets",
    text: "Please move my Google Sheets into AI Matrx so each sheet becomes a table. Keep everything, and tell me when it's done.",
  },
  {
    id: "clickup",
    label: "Move from ClickUp",
    mark: <ListChecks className="size-5" />,
    app: "ClickUp",
    text: "Please move my ClickUp tasks and lists into AI Matrx. Keep everything, and tell me when it's done.",
  },
  {
    id: "agents",
    label: "Split my task into agents",
    mark: <Network className="size-5" />,
    text: "Look at the work I usually ask you to do and turn it into a team of AI Matrx helpers, one for each job. Show me the list before you make them.",
  },
];

/** A Copy button that flips to "Copied" and reports the copy so its step can check itself. */
function CopyAction({
  text,
  label,
  variant = "primary",
  onCopied,
}: {
  text: string;
  label: string;
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
        void copyContent(text, {
          formatJson: false,
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

function Step({
  index,
  done,
  title,
  hint,
  "data-tour": tour,
  children,
}: {
  index: number;
  done: boolean;
  title: string;
  hint?: string;
  "data-tour": string;
  children: React.ReactNode;
}) {
  return (
    <section data-tour={tour} className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full type-secondary font-semibold",
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-3.5" /> : index}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col">
          <h2 className="m-0 type-title text-foreground">
            {title}
            {done ? <span className="sr-only"> (done)</span> : null}
          </h2>
          {hint ? <span className="type-secondary text-muted-foreground">{hint}</span> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

/** Claude's own "Add custom connector" dialog, opened directly. */
const CLAUDE_ADD_CONNECTOR_URL = "https://claude.ai/new?modal=add-custom-connector#customize/connectors/yours";
const CONNECTOR_NAME = "AI Matrx";

/** One box of the other app's form: what to type, with a copy. */
function ConnectorField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <dt className="w-28 shrink-0 type-secondary text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 flex-1 truncate font-mono type-secondary text-foreground" title={value}>
        {value}
      </dd>
      <CopyAction text={value} label="Copy" variant="outline" />
    </div>
  );
}

function ConnectActions({ client, onDone }: { client: Client; onDone: () => void }) {
  switch (client) {
    case "claude":
    case "chatgpt": {
      const href = client === "claude" ? CLAUDE_ADD_CONNECTOR_URL : "https://chatgpt.com/#settings/Connectors";
      return (
        <div className="flex flex-col gap-3">
          <div>
            <Button variant="primary" icon={<ExternalLink />} asChild>
              <a href={href} target="_blank" rel="noopener noreferrer" onClick={onDone}>
                {client === "claude" ? "Open Claude" : "Open ChatGPT"}
              </a>
            </Button>
          </div>
          <dl className="m-0 flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            <ConnectorField label="Name" value={CONNECTOR_NAME} />
            <ConnectorField label={client === "claude" ? "MCP server URL" : "MCP Server URL"} value={MATRX_MCP_URL} />
          </dl>
        </div>
      );
    }
    case "cursor":
      return (
        <div className="flex flex-wrap items-center gap-0">
          <Button variant="primary" icon={<ExternalLink />} asChild>
            <a href={cursorInstallHref()} onClick={onDone}>
              Add to Cursor
            </a>
          </Button>
        </div>
      );
    case "claude-code":
      return (
        <div className="flex flex-wrap items-center gap-0">
          <CopyAction text={CLAUDE_CODE_CONNECT} label="Copy for Claude" onCopied={onDone} />
        </div>
      );
  }
}

const CONNECT_HINT: Record<Client, string> = {
  claude: "Open it, fill in these two, click Add, then Connect",
  chatgpt: "Open it, click Create, fill in these two, sign in",
  "claude-code": "Paste it into Claude — it does the rest",
  cursor: "Opens Cursor — then sign in to AI Matrx",
};

export function BringYourWorkPage() {
  const [client, setClient] = useState<Client>("claude");
  const [picked, setPicked] = useState(false);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [openPrompt, setOpenPrompt] = useState<string | null>(null);

  const markDone = (id: string) =>
    setDone((current) => (current.has(id) ? current : new Set(current).add(id)));
  const aiLabel = CLIENTS.find((c) => c.value === client)?.label ?? "Claude";
  const copyFor = `Copy for ${aiLabel}`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6">
      <Step index={1} done={picked} title="Pick your AI" hint="Choose the app you already use" data-tour="byw-pick-ai">
        <div role="radiogroup" aria-label="Your AI" className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {CLIENTS.map((c) => {
            const selected = c.value === client;
            return (
              <Button variant="outline" pressed={selected} key={c.value} role="radio" aria-checked={selected} onClick={() => {
                  setClient(c.value);
                  setPicked(true);
                }}>
                {c.mark}
                {c.label}
              </Button>
            );
          })}
        </div>
      </Step>

      <Step
        index={2}
        done={done.has(`connect:${client}`)}
        title="Connect AI Matrx"
        hint={CONNECT_HINT[client]}
        data-tour="byw-connect"
      >
        <ConnectActions client={client} onDone={() => markDone(`connect:${client}`)} />
      </Step>

      <Step
        index={3}
        done={done.has(`try:${client}`)}
        title="Try it"
        hint="Paste it in — you should see your AI Matrx"
        data-tour="byw-get-key"
      >
        <div className="flex flex-wrap items-center gap-0">
          <CopyAction text={TRY_PROMPT} label={copyFor} onCopied={() => markDone(`try:${client}`)} />
        </div>
      </Step>

      <Step index={4} done={false} title="What do you want to do?" hint="Copy one and paste it into your AI" data-tour="byw-move-work">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {MOVES.map((move) => {
            const open = openPrompt === move.id;
            const promptText = client === "claude-code" && move.claudeCodeText ? move.claudeCodeText : move.text;
            return (
              <div
                key={move.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3",
                  open && "md:col-span-2",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                    {move.mark}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate type-title text-foreground">{move.label}</span>
                    {move.app ? (
                      <span className="type-secondary text-muted-foreground">
                        {client === "claude-code" && move.claudeCodeText
                          ? `Claude connects ${move.app} for you`
                          : `Connect ${move.app} in your AI too`}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-0">
                  <CopyAction text={promptText} label={copyFor} />
                  <Button
                    variant="quiet"
                    iconEnd={<ChevronDown className={cn("transition-transform", open && "rotate-180")} />}
                    aria-expanded={open}
                    onClick={() => setOpenPrompt(open ? null : move.id)}
                  >
                    {open ? "Hide prompt" : "Show prompt"}
                  </Button>
                </div>
                {open ? (
                  <p className="m-0 whitespace-pre-line rounded-md bg-muted/50 px-3 py-2 type-secondary text-muted-foreground">{promptText}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Step>
    </div>
  );
}
