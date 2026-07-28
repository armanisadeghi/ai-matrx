# Agent System Audits

Post-unification audit reports. Generated after Phase 9 package scaffold
landed; use as reference for follow-up cleanup work.

- [`01-new-work-audit.md`](./01-new-work-audit.md) — correctness bugs + integration gaps in Phase 5–9 work. Critical items were fixed in-session.
- [`02-chat-rewrite-gap-map.md`](./02-chat-rewrite-gap-map.md) — what to keep / rewrite / delete in `features/cx-chat/`, `cx-conversation/`, `conversation/`, `chat/` when rebuilding the chat UI on `@matrx/agents`.
- [`03-type-duplication-scan.md`](./03-type-duplication-scan.md) — local types that shadow global / DB / shared definitions. Prioritized list.
- [`04-legacy-obliteration-plan.md`](./04-legacy-obliteration-plan.md) — wave-by-wave deletion of deprecated aliases, legacy shims, and vestigial naming.

---

These audits are **tactical checklists**. They are referenced from the three strategic docs at the parent level:

- [`../agent-system-mental-model.md`](../agent-system-mental-model.md) — the architecture: Build → Test → Consume, Shortcuts, Apps, Widget Handle, Redux layout.
- [`../conversation-invocation-reference.md`](../conversation-invocation-reference.md) — the `ConversationInvocation` contract every surface hands to `launchConversation`.
- [`../ROADMAP-agent-ecosystem-rebuild.md`](../ROADMAP-agent-ecosystem-rebuild.md) — ordered workstreams (Chat, Shortcuts, Apps, Widget Handle) plus the retirement schedule that pulls from audits 02 + 04.
