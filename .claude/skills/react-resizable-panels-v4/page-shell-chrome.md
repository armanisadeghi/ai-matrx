# react-resizable-panels v4 — page body under the shell header

### The `<main>` is pulled UP under the header — content extends behind it (this is the design)

`styles/shell.css` defines `.shell-main` with `margin-top: calc(-1 * var(--shell-header-h))`. The shell header is **transparent**, the page does not scroll vertically, and the design intent is that **content extends all the way to the top of the page, behind the glass header**. That gives panels (chat conversations especially) the maximum possible vertical real estate and feels open.

**Default page wrapper:**

```tsx
<div className="h-full overflow-hidden">
  <ClientGroup .../>
</div>
```

**No `paddingTop: var(--shell-header-h)`** on the outer wrapper — that forces every panel below the header and creates the "boxed" feeling the design rejects.

**Per-panel top-spacing is each column's own responsibility.** The page wrapper does NOT impose top padding; each panel surface decides based on its content. [`PageHeader.tsx`](../../../features/shell/components/header/PageHeader.tsx) says the route owns its top offset because `.shell-header-inject` spans the whole header center zone with pointer events on — **a row left inside the header band renders but every click on it is swallowed.** In a resizable shell that reservation sits on each panel's outermost element, never on the wrapper around the Group — live consumer: [`features/tasks/components/TasksDesktopShell.tsx`](../../../features/tasks/components/TasksDesktopShell.tsx) pads all three panels.

- **Scrolling content (no `pt-` needed)** — chat conversations, message lists, any panel where the user scrolls. Content flows behind the header icons; if something is obscured, scrolling reveals it. Latest messages stay at the bottom (visible) by default. Example: the chat panel in [`03-vscode-shell/page.dev.tsx`](../../../app/(dev)/demos/resizables/03-vscode-shell/page.dev.tsx) has no `pt-` and no top label — messages flow all the way to the top edge.

- **Static or interactive top content (`pt-[var(--shell-header-h)]` required)** — anything that sits at the top and won't scroll out of the way: panel titles, file tabs, terminal tabs, search inputs, agent dropdowns, "+New" buttons, list toolbars. These MUST clear the shell header zone, otherwise the glass icons render on top of important UI and swallow its clicks. Add the padding at the OUTERMOST element of the panel surface so everything inside is safely below the header.

```tsx
// SCROLLING — no top padding, content can flow up under the header
function ChatSurface() {
  return (
    <div className="h-full flex flex-col bg-muted">
      <div className="flex-1 overflow-auto p-3 …">{messages}</div>
      <div className="shrink-0 p-2">{input}</div>
    </div>
  );
}

// STATIC / INTERACTIVE TOP — pt clears the header
function FilesSidebar() {
  return (
    <div className="h-full overflow-auto bg-muted pt-[var(--shell-header-h)]">
      <div className="px-3 py-1.5 text-[11px] uppercase …">Files</div>
      <ul>{items}</ul>
    </div>
  );
}
```

Tailwind arbitrary-value `pt-[var(--shell-header-h)]` is preferred over the inline `style={{paddingTop: "var(--shell-header-h)"}}` — same effect, less noise, still resolves the live CSS var so a future header-height change propagates everywhere.

The agent builder ([`features/agents/components/builder/AgentBuilderDesktop.tsx`](../../../features/agents/components/builder/AgentBuilderDesktop.tsx)) uses inline `paddingTop: "var(--shell-header-h)"` on individual single-column readers — same idea, just inline-style flavor. Both are valid; pick what reads cleanest in context.

### `<PageHeader>` rules (non-negotiable)

- `<PageHeader>` is a **server component** that portals its children into the shell header center slot. The shell header already has the glass background; you don't add it.
- **Do NOT render your own `<header>` element inside the page body.** If you do, you double-stack headers and leave a gap at the bottom.
- Children must be **self-contained and transparent at the root** — never give the root child `bg-card`, `bg-muted`, or any background class. The shell header is the surface; let it show through.
- Use **TapTargetButtons** for icons (`PanelLeftTapButton`, `PanelRightTapButton`, `TerminalTapButton`, `MessageTapButton`, etc., from `@ai-matrx/tap-target/buttons`). They include their own padding, glass disc, focus ring, and tooltip — **don't wrap them in extra padding** or add `className="p-1 rounded hover:bg-accent"` around them.
- For non-icon content (titles, subtitles), use plain text spans/h1 with no bg — see [`_lib/DemoTitle.tsx`](../../../app/(dev)/demos/resizables/_lib/DemoTitle.tsx).
