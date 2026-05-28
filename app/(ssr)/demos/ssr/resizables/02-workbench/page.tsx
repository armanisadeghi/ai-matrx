import { Panel } from "react-resizable-panels";
import {
  FileText,
  Folder,
  Image as ImageIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";
import { cn } from "@/styles/themes/utils";
import { ClientGroup } from "../_lib/ClientGroup";
import { Handle } from "../_lib/Handle";
import { PanelControlProvider } from "../_lib/PanelControlProvider";
import { RegisteredPanel } from "../_lib/RegisteredPanel";
import { readLayoutCookie } from "../_lib/readLayoutCookie";
import { WorkbenchHeaderControls } from "./HeaderControls";

export const metadata = createRouteMetadata(
  "/demos/ssr/resizables/02-workbench",
  {
    title: "02 · Workbench (collapsibles + cookies)",
    description:
      "Three-panel workbench. Toggle buttons live in the shell header (portaled via PageHeader); panel content is fully server-rendered.",
  },
);

const COOKIE_NAME = "panels:demo-02";

// SERVER COMPONENT. The only client islands here are:
//   - <PanelControlProvider> — Context bridge between header buttons and panel refs
//   - <WorkbenchHeaderControls> — the toggle buttons (read from context)
//   - <ClientGroup> — wraps <Group> with the cookie writer (function prop)
//   - <RegisteredPanel> — wraps <Panel> + registers ref + tracks collapse
//   - <Handle> — orientation-aware Separator wrapper
// FilesSidebar / EditorSurface / InspectorSurface are server components,
// composed inline below — they could await data, read cookies, etc.
export default async function WorkbenchDemoPage() {
  const defaultLayout = await readLayoutCookie(COOKIE_NAME);

  return (
    <PanelControlProvider>
      <PageHeader>
        <WorkbenchHeaderControls />
      </PageHeader>

      <div className="h-full overflow-hidden">
        <ClientGroup
          id="demo-02"
          groupKey="root"
          cookieName={COOKIE_NAME}
          orientation="horizontal"
          defaultLayout={defaultLayout}
          className="h-full w-full"
        >
          <RegisteredPanel
            registerAs="files"
            groupKey="root"
            id="files"
            collapsible
            collapsedSize="0%"
            defaultSize="20%"
            minSize="5%"
          >
            <FilesSidebar />
          </RegisteredPanel>

          <Handle hideWhenCollapsed={["files"]} />

          <Panel id="editor" minSize="30%">
            <EditorSurface />
          </Panel>

          <Handle hideWhenCollapsed={["inspector"]} />

          <RegisteredPanel
            registerAs="inspector"
            groupKey="root"
            id="inspector"
            collapsible
            collapsedSize="0%"
            defaultSize="22%"
            minSize="5%"
          >
            <InspectorSurface />
          </RegisteredPanel>
        </ClientGroup>
      </div>
    </PanelControlProvider>
  );
}

// ─── Server-rendered panel surfaces ─────────────────────────────────────────

function FilesSidebar() {
  const items = [
    { icon: Folder, name: "components" },
    { icon: Folder, name: "features" },
    { icon: FileText, name: "page.tsx" },
    { icon: FileText, name: "layout.tsx" },
    { icon: ImageIcon, name: "logo.svg" },
  ];
  // Static title at top — pt clears the shell header so it doesn't render behind
  // the header tap targets. Items below scroll under the header on overflow.
  return (
    <div className="h-full overflow-auto bg-muted pt-[var(--shell-header-h)]">
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        Files
      </div>
      <ul className="text-sm">
        {items.map(({ icon: Icon, name }) => (
          <li
            key={name}
            className={cn(
              "flex items-center gap-2 px-3 py-1 cursor-pointer",
              "hover:bg-accent text-foreground/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditorSurface() {
  // Static "file tab" at top + non-scrolling code area — pt-[shell-header-h]
  // keeps the tab visible below the header.
  return (
    <div className="h-full overflow-auto bg-card pt-[var(--shell-header-h)]">
      <div className="px-4 py-2 text-xs text-muted-foreground">page.tsx</div>
      <pre className="p-4 text-xs leading-relaxed text-foreground/90 font-mono">
{`export default async function Page() {
  const layout = await readLayoutCookie("panels:demo-02");
  return (
    <PanelControlProvider>
      <PageHeader>
        <WorkbenchHeaderControls />
      </PageHeader>
      <ClientGroup defaultLayout={layout}>
        <RegisteredPanel registerAs="files" collapsible>
          <FilesSidebar />     // ← server component
        </RegisteredPanel>
        ...
      </ClientGroup>
    </PanelControlProvider>
  );
}`}
      </pre>
    </div>
  );
}

function InspectorSurface() {
  return (
    <div className="h-full overflow-auto bg-muted pt-[var(--shell-header-h)]">
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <SettingsIcon className="h-3 w-3" /> Inspector
      </div>
      <dl className="px-3 py-2 text-xs space-y-2">
        <div>
          <dt className="text-muted-foreground">id</dt>
          <dd className="text-foreground">demo-02</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">cookie</dt>
          <dd className="text-foreground font-mono">{COOKIE_NAME}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">sidebar minSize</dt>
          <dd className="text-foreground">5%</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">page rendering</dt>
          <dd className="text-foreground">server (with client islands for refs)</dd>
        </div>
      </dl>
    </div>
  );
}
