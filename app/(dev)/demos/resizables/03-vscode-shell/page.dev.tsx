import { Panel } from "react-resizable-panels";
import {
  Files,
  Search,
  GitBranch,
  Settings as SettingsIcon,
  ChevronDown,
  Plus,
  X,
  SquareStack,
} from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";
import { cn } from "@/styles/themes/utils";
import { ClientGroup } from "../_lib/ClientGroup";
import { Handle } from "../_lib/Handle";
import { PanelControlProvider } from "../_lib/PanelControlProvider";
import { RegisteredPanel } from "../_lib/RegisteredPanel";
import { readLayoutCookie } from "../_lib/readLayoutCookie";
import { VSCodeHeaderControls } from "./HeaderControls";

export const metadata = createRouteMetadata(
  "/demos/resizables/03-vscode-shell",
  {
    title: "03 · VSCode shell (nested groups)",
    description:
      "Activity bar + sidebar + (editor over [tabs / terminal split]) + chat + chat history. Three cookies — one per group — read in parallel server-side.",
  },
);

const ROOT_COOKIE = "panels:demo-03:root";
const MAIN_COOKIE = "panels:demo-03:main";
const TERMINAL_COOKIE = "panels:demo-03:terminal";

export default async function VSCodeShellPage() {
  const [rootLayout, mainLayout, terminalLayout] = await Promise.all([
    readLayoutCookie(ROOT_COOKIE),
    readLayoutCookie(MAIN_COOKIE),
    readLayoutCookie(TERMINAL_COOKIE),
  ]);

  return (
    <PanelControlProvider>
      <PageHeader>
        <VSCodeHeaderControls />
      </PageHeader>

      <div className="h-full overflow-hidden">
        <ClientGroup
          id="demo-03-root"
          groupKey="root"
          cookieName={ROOT_COOKIE}
          orientation="horizontal"
          defaultLayout={rootLayout}
          className="h-full w-full"
        >
          <Panel
            id="activity-bar"
            defaultSize="44px"
            minSize="44px"
            maxSize="44px"
          >
            <ActivityBar />
          </Panel>
          <Handle disabled />

          <RegisteredPanel
            registerAs="sidebar"
            groupKey="root"
            id="sidebar"
            collapsible
            collapsedSize="0%"
            defaultSize="16%"
            minSize="5%"
          >
            <Sidebar />
          </RegisteredPanel>
          <Handle hideWhenCollapsed={["sidebar"]} />

          <Panel id="main" minSize="30%">
            <ClientGroup
              id="demo-03-main"
              groupKey="main"
              cookieName={MAIN_COOKIE}
              orientation="vertical"
              defaultLayout={mainLayout}
              className="h-full w-full"
            >
              <Panel id="editor" minSize="20%">
                <EditorSurface />
              </Panel>
              <Handle hideWhenCollapsed={["terminal"]} />
              <RegisteredPanel
                registerAs="terminal"
                groupKey="main"
                id="terminal"
                collapsible
                collapsedSize="0%"
                defaultSize="32%"
                minSize="5%"
              >
                <TerminalLayout terminalCookie={TERMINAL_COOKIE} terminalLayout={terminalLayout} />
              </RegisteredPanel>
            </ClientGroup>
          </Panel>
          <Handle hideWhenCollapsed={["chat"]} />

          <RegisteredPanel
            registerAs="chat"
            groupKey="root"
            id="chat"
            collapsible
            collapsedSize="0%"
            defaultSize="18%"
            minSize="5%"
          >
            <ChatSurface />
          </RegisteredPanel>
          <Handle hideWhenCollapsed={["chat", "chat-history"]} />

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

function ActivityBar() {
  const icons = [Files, Search, GitBranch, SettingsIcon];
  // Vertical icon rail — top icons would sit behind the shell header tap targets
  // without the pt offset.
  return (
    <div className="h-full bg-muted flex flex-col items-center pb-2 gap-1 pt-[var(--shell-header-h)]">
      {icons.map((Icon, i) => (
        <div
          key={i}
          className={cn(
            "p-1.5 rounded text-muted-foreground",
            i === 0 && "text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      ))}
    </div>
  );
}

function Sidebar() {
  const items = ["src", "components", "features", "app", "package.json", "README.md"];
  return (
    <div className="h-full overflow-auto bg-muted pt-[var(--shell-header-h)]">
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        Explorer
      </div>
      <ul className="text-sm">
        {items.map((name) => (
          <li
            key={name}
            className="px-3 py-1 cursor-pointer hover:bg-accent text-foreground/80 hover:text-foreground"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditorSurface() {
  const tabs = [
    { name: "page.tsx", active: true },
    { name: "Shell.tsx", active: false },
    { name: "globals.css", active: false },
  ];
  // Tab strip is interactive (file tabs with X) — pt clears shell header so it
  // never sits behind the header tap targets.
  return (
    <div className="h-full flex flex-col bg-card pt-[var(--shell-header-h)]">
      <div className="h-8 flex items-center gap-px bg-muted/50 px-1 text-xs shrink-0">
        {tabs.map((t) => (
          <div
            key={t.name}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 cursor-pointer",
              t.active
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{t.name}</span>
            <X className="h-3 w-3 opacity-60 hover:opacity-100" />
          </div>
        ))}
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs leading-relaxed text-foreground/90 font-mono">
{`<ClientGroup id="demo-03-root" defaultLayout={rootLayout}>
  <Panel id="activity-bar" defaultSize="44px" />
  <Handle disabled />
  <RegisteredPanel registerAs="sidebar" collapsible defaultSize="16%" />
  <Handle />
  <Panel id="main">
    <ClientGroup id="demo-03-main" orientation="vertical">
      <Panel id="editor" />
      <Handle />
      <RegisteredPanel registerAs="terminal" collapsible defaultSize="32%">
        <TerminalLayout>
          <TerminalTabs />              {/* fixed tab strip */}
          <ClientGroup id="demo-03-terminal" orientation="horizontal">
            <Panel id="term-left" />     {/* one shell */}
            <Handle />
            <Panel id="term-right" />    {/* split shell */}
          </ClientGroup>
        </TerminalLayout>
      </RegisteredPanel>
    </ClientGroup>
  </Panel>
  <Handle />
  <RegisteredPanel registerAs="chat" collapsible defaultSize="18%" />
  <Handle />
  <RegisteredPanel registerAs="chat-history" collapsible defaultSize="14%" />
</ClientGroup>`}
      </pre>
    </div>
  );
}

interface TerminalLayoutProps {
  terminalCookie: string;
  terminalLayout: Awaited<ReturnType<typeof readLayoutCookie>>;
}

function TerminalLayout({ terminalCookie, terminalLayout }: TerminalLayoutProps) {
  const tabs = [
    { name: "Problems", count: 2 },
    { name: "Output", count: null },
    { name: "Debug Console", count: null },
    { name: "Terminal", count: null, active: true },
    { name: "Ports", count: null },
  ];
  // Terminal tabs at top are interactive — pt clears the header. Vertical
  // group's top edge always sits below the editor (which is in a different
  // panel), so this pt only matters when the terminal panel is at the very top
  // of the screen — but the rule applies uniformly: any panel whose top is
  // interactive clears the header.
  return (
    <div className="h-full flex flex-col bg-background pt-[var(--shell-header-h)]">
      <div className="h-8 flex items-center gap-px bg-muted/50 px-1 text-xs shrink-0 border-t border-border/40">
        {tabs.map((t) => (
          <div
            key={t.name}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 cursor-pointer",
              t.active
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{t.name}</span>
            {t.count != null && (
              <span className="text-[10px] px-1 rounded bg-accent text-foreground">
                {t.count}
              </span>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1 px-2">
          <Plus className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-pointer" />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ClientGroup
          id="demo-03-terminal"
          cookieName={terminalCookie}
          orientation="horizontal"
          defaultLayout={terminalLayout}
          className="h-full w-full"
        >
          <Panel id="term-left" defaultSize="50%" minSize="20%">
            <TerminalPane index={1} command="pnpm dev" />
          </Panel>
          <Handle />
          <Panel id="term-right" defaultSize="50%" minSize="20%">
            <TerminalPane index={2} command="git status" />
          </Panel>
        </ClientGroup>
      </div>
    </div>
  );
}

function TerminalPane({ index, command }: { index: number; command: string }) {
  return (
    <div className="h-full overflow-auto p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        zsh · {index}
      </div>
      <pre className="text-xs leading-relaxed text-green-500 font-mono">
{`$ ${command}\n${
  command === "pnpm dev"
    ? "> next dev (Turbopack)\nready - started server on http://localhost:3000"
    : "On branch main\nnothing to commit, working tree clean"
}`}
      </pre>
    </div>
  );
}

function ChatSurface() {
  // No top label / heading — the conversation flows all the way to the top
  // edge of the panel and behind the transparent shell header. Typical chat
  // pattern: latest messages live at the bottom, older messages scroll up
  // under the glass header.
  return (
    <div className="h-full flex flex-col bg-muted">
      <div className="flex-1 overflow-auto p-3 space-y-2 text-xs">
        <div className="bg-accent rounded p-2 text-foreground">
          Refactor the layout to use nested Groups.
        </div>
        <div className="bg-card rounded p-2 text-foreground/80">
          Done — outer is horizontal, inner is vertical for the terminal.
        </div>
        <div className="bg-accent rounded p-2 text-foreground">
          Now add a horizontal split inside the terminal.
        </div>
        <div className="bg-card rounded p-2 text-foreground/80">
          Added — third nested ClientGroup with its own cookie.
        </div>
      </div>
      <div className="shrink-0 p-2">
        <div className="rounded border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
          Plan, build, /<span className="text-foreground/60"> for commands…</span>
        </div>
      </div>
    </div>
  );
}

function ChatHistorySurface() {
  const chats = [
    { id: 1, title: "VSCode editor refactor", time: "2m" },
    { id: 2, title: "Resizable panels demos", time: "1h" },
    { id: 3, title: "SSR cookie persistence", time: "3h" },
    { id: 4, title: "Hydration error in Demo 05", time: "1d" },
    { id: 5, title: "Mac Mail layout", time: "2d" },
  ];
  // Search input + agent dropdown + +New are interactive — pt to keep them
  // visible. Recent chat list below scrolls.
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
          <SquareStack className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="flex-1 text-left text-foreground">Claude Sonnet 4.6</span>
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
