# The verb contract — how a feature fills the right-click menu

Arman, 2026-10-02: a feature duplicating the menu's own verbs ("Duplicate table" next to "Duplicate") is why our menus are bloated. **The generic verb IS the object's verb when the object supplies it.** The code is in `verbs.ts`, and it is demo-local until the package adopts it. The round-2 designs in `round2.ts` are built from it.

## The verbs (one fixed catalog, `VERBS`)

| Verb | Kind | Unbound behaviour |
|---|---|---|
| Open in new tab, Copy link, Share, Duplicate, Favorite, Move to, Rename, History, Settings, Import, Archive | object | **Absent.** There is no text meaning of "Archive". |
| Copy, Export, Read aloud, Find, Select all | content | **Falls back** to the platform's text/content behaviour: copy the words, export the content, read it aloud. |

Each verb has a fixed node id, icon, label and shortcut (Copy ⌘C, Copy link ⌘L, Duplicate ⌘D, Rename F2, Find ⌘F, Select all ⌘A, Archive ⌘⌫, Open in new tab ⌘↵). Archive is destructive and always last in the strip, after a gap.

## Binding

```ts
const table: FeatureMenu = {
  noun: "table",
  bind: {
    duplicate: { run: duplicateTable },
    archive: { run: archiveTable, label: "Archive table", unavailable: viewer ? "Only editors can archive" : undefined },
    export: { run: openExportDialog, label: "Export table", menu: [{ id: "table-export-csv", label: "CSV" }, …] },
    copy: { run: copyRows, label: "Copy rows" },
    …
  },
  rows: [open, newRecord, editFields, builtOnIt],   // at most 4 — a 5th does not compile
  more: [openPublicLink, membersAccess, automations, …],
};
```

- **Bind, never add.** A row whose label is a verb's label throws in `assertFeature`, and the message names the `bind.<verb>` to use instead.
- `label` renames the verb for this object in the tooltip ("Archive table"). The slot and icon stay the menu's own.
- `unavailable`: viewer rights. The icon is greyed and the tooltip gives the reason. The shape is the same for every seat: the name, then the shortcut or the reason.
- `menu`: options the object adds above the platform's own. For Export, CSV and Excel sit above PDF, Word, Markdown, Print and Save. They live behind the icon's chevron, so the strip stays one icon per verb.
- **Selection outranks the object** for Copy and Read aloud. With words selected, Copy copies the words. Every other verb still acts on the object.

## The 4 + 1 rule

A feature gets **4 rows that one icon cannot tell** (Open, New record, Edit fields…, Built on it ▸), plus **one** opener, "More <noun> options" ▸, which holds everything else. The menu draws the opener; the feature only fills `more`. So the feature never has more than 5 rows, and it never runs out of room.

## Where everything else goes

- **Intelligence** (after the feature rows): every AI row, in one place. That covers AI Actions, Agents, My Items, Org Items, Send to another agent, Custom agent, Chat, Summarize & listen, and Summarize without playing. A feature never adds AI rows of its own; it binds agents through the platform.
- **Platform utilities** (the footer icon row): Save to Notes, Task (Save to task, Create Task), Add to Rulebook, Quick Actions, Submit feedback, This page and Admin Tools.
- **Clipboard extras** (behind Copy's chevron): Copy as ▸, Copy reference… and Compare. **Export extras** (behind Export's chevron): the formats and Save ▸. **Voice settings** sit behind Read aloud's chevron.
- Lossless: all 27 of today's generic rows, and every row inside them, are still reachable. The demo counts this live under each design.

## Open questions for the owner

- "Intelligence" is a reserved product word (Intelligence = Mandates, with the `BrainCircuit` icon). Arman named the AI group "Intelligence" for this menu. The heading is not in the package's `APPROVED_HEADINGS`, so the demo draws it with its own heading. Adopting it in the package means adding it to that list, which is his call, and settling the clash with the reserved meaning.
