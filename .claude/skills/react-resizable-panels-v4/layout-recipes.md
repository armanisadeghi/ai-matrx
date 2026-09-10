# react-resizable-panels v4 — layout recipes

## §6 — VSCode-style nested layout

```tsx
"use client";
import { Group, Panel, Separator } from "react-resizable-panels";

export function VSCodeShell() {
  return (
    <Group id="root" orientation="horizontal" className="h-dvh">
      <Panel id="activity-bar" defaultSize="48px" minSize="48px" maxSize="48px">
        <ActivityBar />
      </Panel>
      <Separator disabled />

      <Panel id="sidebar" defaultSize="240px" minSize="180px" collapsible collapsedSize="0%">
        <Sidebar />
      </Panel>
      <Separator />

      <Panel id="main" minSize="40%">
        <Group id="main-vertical" orientation="vertical">
          <Panel id="editor" minSize="20%"><Editor /></Panel>
          <Separator />
          <Panel id="terminal" defaultSize="30%" collapsible collapsedSize="0%">
            <Terminal />
          </Panel>
        </Group>
      </Panel>
      <Separator />

      <Panel id="chat" defaultSize="320px" minSize="240px" collapsible collapsedSize="0%">
        <Chat />
      </Panel>
    </Group>
  );
}
```

Rules for nesting:
- Each `<Group>` needs its own stable `id` (and therefore its own cookie).
- Panels and Separators must be **direct DOM children of their Group**. Never wrap them in a `<div>`. (TSDoc spec.)
- A nested Group goes **inside** a parent Panel's children, not as a sibling of other Panels.
- For the immovable activity-bar pattern, set `defaultSize=minSize=maxSize` to the same pixel value AND mark the adjacent `<Separator disabled />`.

---

## §7 — Apple Mail / Notes multi-sidebar layout

```tsx
"use client";
import { Group, Panel, Separator } from "react-resizable-panels";

export function MailShell() {
  return (
    <Group id="mail" orientation="horizontal" className="h-dvh">
      <Panel id="folders"  defaultSize="200px" minSize="160px" collapsible collapsedSize="0%"><Folders /></Panel>
      <Separator />
      <Panel id="messages" defaultSize="300px" minSize="220px" collapsible collapsedSize="0%"><Messages /></Panel>
      <Separator />
      <Panel id="reader"   minSize="40%"><Reader /></Panel>
      <Separator />
      <Panel id="inspector" defaultSize="280px" minSize="200px" collapsible collapsedSize="0%"><Inspector /></Panel>
    </Group>
  );
}
```

Each separator is independent — pulling separator B doesn't move separator A. Each collapsible panel remembers its own pre-collapse size.
