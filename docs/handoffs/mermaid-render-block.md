---
status: active
updated: 2026-07-28
repos: [matrx-frontend]
vision: []
---

# Mermaid render block — operational turn-on

The web build is complete and user-confirmed live; the Diagram Editor agent is seeded
(Arman approved 2026-07-07: "Absolutely yes for diagram editor"). The replication recipe lives in
`.claude/skills/create-render-block-skill`.

## Resources

- Core: `components/mermaid/` (runtime, sanitize, adapters, workbench, visual/outline/code)
- Chat block: `components/mardown-display/blocks/mermaid/MermaidBlock.tsx`
- Agent menu resolution: `components/mermaid/hooks/useDiagramAgents.ts`
- Surface manifest: `features/surfaces/manifests/mermaid-editor.manifest.ts`
- Diagram Editor agent: `bdaf5ee0-b490-46a4-884c-3786121bb126` (builtin, `mermaid-diagrams` skill `a79122d6-…` attached, surface role default)
- Skills: `create-render-block-skill` (the paved recipe), `shape-system`
- Demo: `/demos/mermaid` · Defect record: `FOUND_DEFECTS.md` D5

## Remaining work

1. **Live round-trip test of the Edit rail with the seeded agent** — open a mermaid artifact,
   run an "Edit with AI" instruction, confirm the one-fence contract lands and versions save.
   Never actually run in a browser; this is the only unproven leg.
2. **Attach `mermaid-diagrams` to at least one general chat agent** (DB-side). Verified
   2026-07-28: `a79122d6-cd9f-4235-8ca2-ac386473f09d` is in exactly ONE agent's
   `skill_config.included` — the Diagram Editor. No general assistant carries it, so chat agents
   don't proactively emit diagrams (incidental ` ```mermaid ` fences still render).

## Done

- Full web vertical (render → sanitize → materialize → 3-mode edit → version → share → agent-edit) — `components/mermaid/`.
- Replication skill written — `.claude/skills/create-render-block-skill/SKILL.md`.
- Skill + 18 content blocks seeded + live-verified — `migrations/mermaid_render_block_platform.sql`, `mermaid_content_blocks.sql`.
- Diagram Editor agent seeded + wired (2026-07-07) — `agent.definition` row `bdaf5ee0-…`, `ui.ui_surface_agent_role.default_agent_id` set, manifest `defaultAgentId` set.
- Chat right-click → diagram-scoped agents on context-menu-v3 (2026-07-12) — `MermaidBlock` wraps `NonEditableContextMenu` (mermaid-editor surface scope); "Edit with Diagram Editor" opens the workbench with the AI rail preloaded.
- Agent↔surface binding landed as a canonical `platform.associations` edge (row `892a6ea8-…`, `payload_kind='surface_binding'`, role `binding:global`) — the condemned `agent_surface` junction is graveyarded (commit `8145162e7`). The old "wait for the surfaces-bindings replacement" blocker is gone.
