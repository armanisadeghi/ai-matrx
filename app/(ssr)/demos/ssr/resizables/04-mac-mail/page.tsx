import { Panel } from "react-resizable-panels";
import {
  Inbox,
  Send,
  FileEdit,
  Trash,
  Star,
  Lightbulb,
  Search,
  Plus,
  Cuboid,
  ChevronDown,
} from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";
import { cn } from "@/styles/themes/utils";
import { ClientGroup } from "../_lib/ClientGroup";
import { Handle } from "../_lib/Handle";
import { PanelControlProvider } from "../_lib/PanelControlProvider";
import { RegisteredPanel } from "../_lib/RegisteredPanel";
import { readLayoutCookie } from "../_lib/readLayoutCookie";
import { MailHeaderControls } from "./HeaderControls";

export const metadata = createRouteMetadata("/demos/ssr/resizables/04-mac-mail", {
  title: "04 · Mac Mail (multi-sidebar)",
  description:
    "Folders + Messages + Reader + Inspector + Chat history. Four independent collapsibles, each with its own pre-collapse memory.",
});

const COOKIE_NAME = "panels:demo-04";

export default async function MacMailPage() {
  const defaultLayout = await readLayoutCookie(COOKIE_NAME);

  return (
    <PanelControlProvider>
      <PageHeader>
        <MailHeaderControls />
      </PageHeader>

      <div className="h-full overflow-hidden">
        <ClientGroup
          id="demo-04"
          groupKey="root"
          cookieName={COOKIE_NAME}
          orientation="horizontal"
          defaultLayout={defaultLayout}
          className="h-full w-full"
        >
          <RegisteredPanel
            registerAs="folders"
            groupKey="root"
            id="folders"
            collapsible
            collapsedSize="0%"
            defaultSize="13%"
            minSize="5%"
          >
            <Folders />
          </RegisteredPanel>
          <Handle hideWhenCollapsed={["folders", "messages"]} />

          <RegisteredPanel
            registerAs="messages"
            groupKey="root"
            id="messages"
            collapsible
            collapsedSize="0%"
            defaultSize="20%"
            minSize="5%"
          >
            <MessagesList />
          </RegisteredPanel>
          <Handle hideWhenCollapsed={["messages"]} />

          <Panel id="reader" minSize="20%">
            <Reader />
          </Panel>
          <Handle hideWhenCollapsed={["inspector"]} />

          <RegisteredPanel
            registerAs="inspector"
            groupKey="root"
            id="inspector"
            collapsible
            collapsedSize="0%"
            defaultSize="16%"
            minSize="5%"
          >
            <Inspector />
          </RegisteredPanel>
          <Handle hideWhenCollapsed={["inspector", "chat-history"]} />

          <RegisteredPanel
            registerAs="chat-history"
            groupKey="root"
            id="chat-history"
            collapsible
            collapsedSize="0%"
            defaultSize="14%"
            minSize="5%"
          >
            <ChatHistorySurface />
          </RegisteredPanel>
        </ClientGroup>
      </div>
    </PanelControlProvider>
  );
}

// ─── Server-rendered panel surfaces ─────────────────────────────────────────

function Folders() {
  const items = [
    { icon: Inbox, name: "Inbox", count: 124 },
    { icon: Star, name: "Starred", count: 8 },
    { icon: Send, name: "Sent", count: null },
    { icon: FileEdit, name: "Drafts", count: 2 },
    { icon: Trash, name: "Trash", count: null },
  ];
  return (
    <div className="h-full overflow-auto bg-muted pt-[var(--shell-header-h)]">
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        Mailboxes
      </div>
      <ul className="text-sm">
        {items.map(({ icon: Icon, name, count }) => (
          <li
            key={name}
            className={cn(
              "flex items-center gap-2 px-3 py-1 cursor-pointer",
              "hover:bg-accent text-foreground/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 truncate">{name}</span>
            {count != null && (
              <span className="text-xs text-muted-foreground">{count}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessagesList() {
  const messages = [
    { from: "Stripe", subject: "Your weekly summary", preview: "Total volume processed: $12,480" },
    { from: "GitHub", subject: "PR #2841 needs review", preview: "armani requested a review on" },
    { from: "Linear", subject: "MTX-104 moved to Done", preview: "Resizable panels demo set" },
    { from: "Vercel", subject: "Deployment ready", preview: "Production deployment for" },
  ];
  return (
    <div className="h-full overflow-auto bg-card pt-[var(--shell-header-h)]">
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        Inbox · {messages.length}
      </div>
      <ul className="divide-y divide-border">
        {messages.map((m, i) => (
          <li
            key={i}
            className={cn(
              "px-3 py-2 cursor-pointer hover:bg-accent",
              i === 1 && "bg-accent",
            )}
          >
            <div className="text-xs font-medium text-foreground">{m.from}</div>
            <div className="text-xs text-foreground/80 truncate">{m.subject}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {m.preview}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reader() {
  return (
    <div className="h-full overflow-auto bg-background pt-[var(--shell-header-h)]">
      <div className="px-4 py-3">
        <div className="text-sm font-medium text-foreground">
          PR #2841 needs review
        </div>
        <div className="text-xs text-muted-foreground">
          GitHub · today, 9:42 AM
        </div>
      </div>
      <div className="p-4 text-sm text-foreground/90 leading-relaxed space-y-2">
        <p>
          armani requested a review on apps#2841 — “Resizable panel demos with
          cookie-backed SSR.”
        </p>
        <p>
          Five demos in <code>app/(ssr)/ssr/demos/resizables</code>. Each one
          builds on the previous.
        </p>
      </div>
    </div>
  );
}

function Inspector() {
  return (
    <div className="h-full overflow-auto bg-muted pt-[var(--shell-header-h)]">
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Lightbulb className="h-3 w-3" /> AI summary
      </div>
      <div className="p-3 text-xs text-foreground/85 leading-relaxed">
        Three repos saw activity today — review GitHub PR first; Linear and
        Vercel items can wait.
      </div>
    </div>
  );
}

function ChatHistorySurface() {
  const chats = [
    { id: 1, title: "Inbox triage", time: "5m" },
    { id: 2, title: "PR review draft", time: "20m" },
    { id: 3, title: "Stripe summary", time: "1h" },
    { id: 4, title: "Quarterly digest", time: "2d" },
  ];
  return (
    <div className="h-full flex flex-col bg-muted pt-[var(--shell-header-h)]">
      <div className="p-2 space-y-1.5 shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-background">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            placeholder="Search chats"
            className="bg-transparent text-xs flex-1 outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button className="flex items-center gap-1.5 px-2 py-1 rounded bg-background w-full text-xs">
          <Cuboid className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="flex-1 text-left text-foreground">Mail Triage</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
        <button className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground w-full">
          <Plus className="h-3 w-3" />
          New Agent
        </button>
      </div>
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
        Recent
      </div>
      <ul className="flex-1 overflow-auto text-xs">
        {chats.map((c) => (
          <li
            key={c.id}
            className="px-3 py-1.5 cursor-pointer hover:bg-accent flex items-baseline gap-2"
          >
            <span className="flex-1 text-foreground/80 truncate">{c.title}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{c.time}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
