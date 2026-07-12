---
status: active
updated: 2026-07-07
repos: [matrx-frontend]
vision: []
---

# Mermaid render block — operational turn-on

The web build is complete and user-confirmed live; the Diagram Editor agent is now seeded
(Arman approved 2026-07-07: "Absolutely yes for diagram editor"). The replication recipe lives in
`.claude/skills/create-render-block-skill`.

## Resources

- Core: `components/mermaid/` (runtime, sanitize, adapters, workbench, visual/outline/code)
- Chat block: `components/mardown-display/blocks/mermaid/MermaidBlock.tsx`
- Surface manifest: `features/surfaces/manifests/mermaid-editor.manifest.ts`
- Diagram Editor agent: `bdaf5ee0-b490-46a4-884c-3786121bb126` (builtin, skill attached, role default)
- Skills: `create-render-block-skill` (the paved recipe), `shape-system`
- Demo: `/demos/mermaid` · Defect record: `FOUND_DEFECTS.md` D5

## Remaining work

1. **Live round-trip test of the Edit rail with the seeded agent** — open a mermaid artifact,
   run an "Edit with AI" instruction, confirm the one-fence contract lands and versions save.
2. **Attach `mermaid-diagrams` to at least one general chat agent** (DB-side): the Diagram Editor
   carries the skill, but no general assistant does, so chat agents don't proactively emit
   diagrams (incidental ` ```mermaid ` fences still render).
3. **`agent.agent_surface` association edge** — deliberately skipped (mechanism condemned
   2026-07-02); add the agent↔surface edge on `platform.associations` when the replacement in
   `docs/handoffs/surfaces-bindings.md` item 1 lands.
4. **Chat right-click scoping — APPROVED onto context-menu-v3** (Arman 2026-07-07: "context menu
   v3 probably sounds like the right call"): right-clicking a mermaid block in chat should offer
   diagram-scoped agents (the Diagram Editor first). Build with the `context-menu-v3` skill — NOT
   a v2 extension. Natural to pair with `docs/handoffs/notes-sidebar-menu.md` (same skill, same
   sweep).

## Done

- Full web vertical (render → sanitize → materialize → 3-mode edit → version → share → agent-edit) — `components/mermaid/`.
- Replication skill written — `.claude/skills/create-render-block-skill/SKILL.md`.
- Skill + 18 content blocks seeded + live-verified — `migrations/mermaid_render_block_platform.sql`, `mermaid_content_blocks.sql`.
- Diagram Editor agent seeded + wired (2026-07-07) — `agent.definition` row `bdaf5ee0-…`
  (Gemini 3.5 Flash, `skill_config.included` = mermaid-diagrams, `diagram_source` variable),
  `ui_surface_agent_role.default_agent_id` set, manifest `defaultAgentId` set; live-verified in
  `agent.card`.

## Decisions needed

- Right-clicking a mermaid diagram in chat shows generic assistant agents, not diagram-scoped
  ones. A June triage called this not-a-defect since the workbench Edit rail covers editing.
  Decide: close it as won't-do, or schedule it onto the new context-menu-v3 system.
