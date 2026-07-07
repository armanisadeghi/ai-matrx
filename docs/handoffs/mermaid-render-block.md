---
status: blocked
updated: 2026-07-07
repos: [matrx-frontend]
vision: []
---

# Mermaid render block — operational turn-on

The web build is complete and user-confirmed live: render (9 editable diagram-type adapters),
forgiving sanitizer, materialize-to-canvas, MermaidWorkbench (Diagram/Outline/Code), AgentEditRail
("Edit with AI"), fullscreen, public share, and the `matrx-user/mermaid-editor` surface manifest.
The replication recipe this build paved now exists as `.claude/skills/create-render-block-skill`.
What remains is entirely the operational turn-on — and both open items are Arman decisions.

## Vision — Arman's words

- "custom agents scoped specifically to this artifact and this render block style."
- Deferred by the user to the *next* stage (after "the basics work"): the operational turn-on —
  seeding a Diagram Editor agent, attaching the skill to chat agents, the chat-block per-type
  agent menu.

## Resources

- Core: `components/mermaid/` (runtime, sanitize, adapters, workbench, visual/outline/code)
- Chat block: `components/mardown-display/blocks/mermaid/MermaidBlock.tsx`
- Surface manifest: `features/surfaces/manifests/mermaid-editor.manifest.ts`
- Platform rows: skill `mermaid-diagrams` (`skl_definitions`) + 18 "Diagrams" content blocks — live
- Skills: `create-render-block-skill` (the paved recipe), `shape-system`
- Demo: `/demos/mermaid` · Defect record: `KNOWN_DEFECTS.md` D5

## Remaining work

1. **Seed a system "Diagram Editor" agent** (gated on Decision 1): attach the `mermaid-diagrams`
   skill (`skill_config.included`), bind it to `matrx-user/mermaid-editor`, set it as the
   manifest role's default — `mermaid-editor.manifest.ts:133` is `defaultAgentId: null` today —
   then filter `AgentEditRail`'s picker to surface-bound agents and live-test the round-trip.
2. **Attach `mermaid-diagrams` to at least one chat agent** (DB-side; same decision): no chat
   agent carries the skill, so nothing proactively emits diagrams (incidental ` ```mermaid `
   fences still render).
3. **Chat right-click scoping** (gated on Decision 2): if pursued, the fix path is the new
   **context-menu-v3** system (`context-menu-v3` skill) — NOT a v2
   `useUnifiedAgentContextMenu` extension.

## Done

- Full web vertical (render → sanitize → materialize → 3-mode edit → version → share → agent-edit) — `components/mermaid/`.
- Replication skill written — `.claude/skills/create-render-block-skill/SKILL.md`.
- Skill + 18 content blocks seeded + live-verified — `migrations/mermaid_render_block_platform.sql`, `mermaid_content_blocks.sql`.

## Decisions needed

- Every mermaid code path is wired, but no agent is operationally bound: the manifest has no
  default agent and no chat agent carries the mermaid-diagrams skill, so out of the box nothing
  proactively creates or edits diagrams. Decide: seed one system "Diagram Editor" agent (skill
  attached + surface binding + manifest defaultAgentId), or defer the operational turn-on.
- Right-clicking a mermaid diagram in chat shows generic assistant agents, not diagram-scoped
  ones. A June triage called this not-a-defect since the workbench Edit rail covers editing.
  Decide: close it as won't-do, or schedule it onto the new context-menu-v3 system.
