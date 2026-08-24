---
name: item-register-template
type: Reference
title: "Item Register — starting template"
description: "Copyable skeleton for a new Item Register. Replace every <angle-bracket> slot; delete instructional comments. Companion to the item-register skill."
tags: [register, template]
timestamp: 2026-08-24T00:00:00Z
---

# Item Register — starting template

Copy everything below the rule into `REGISTER.md` in the subject's node home, replace the
slots, delete the `<!-- -->` comments. The skill governing this document:
[/skills/item-register/SKILL.md](/skills/item-register/SKILL.md).

---

```markdown
---
type: Register
title: "<Subject> — Item Register"
description: "The single self-contained work register for <subject>: every goal, gap, and component as an atomic item with stable ID, vision, verified current state, status, owner, and sources. Supersedes <source doc(s)> as the tracking home."
tags: [<subject-tags>, register]
timestamp: <date>
---

# <Subject> — Item Register

**Purpose.** The one place <subject> is tracked, item by item. Every item is
self-contained: a developer with no project history can read one item cold and act on it.
Cross-references are by ID only. Supersedes <source doc> (archived in place with a pointer
here). <Links to the subject's VISION.md, decisions doc, and any governing plan.>

**Status vocabulary** (the only permitted values):
- **Not Started** — no work toward the vision exists.
- **In Progress** — actively being built or filled.
- **Blocked** — cannot proceed until a named ruling, dependency, or external event resolves.
- **Partially Met** — machinery exists and works, but the vision's outcome is not yet real
  (e.g. built-but-unused).
- **Met** — vision verified live against real data.
- **Superseded** — replaced by another item; kept for the record.

**Contribution protocol.** Vision fields: edited only by Arman or a session carrying his
explicit ruling — a vision edit cites the ruling in Updates. Status/Current/Updates: any
contributor may update, touching only their item and appending one Update line
(`date — author — change`). IDs are never reused or renumbered; new items append at the end
of their area with the next free ID. Items marked **(New <date>)** were authored during
register creation rather than carried from prior documents.

**Consensus marking.** An item reviewed by more than one agent carries a **Consensus**
line: **SETTLED** = every reviewer agrees and no ruling is outstanding, so it may be built
as written; **CONTESTED** = reviewers disagree or a decision is outstanding, followed by
the exact question and who must answer. Absence of the line means only one agent has
looked at it.

<!-- Optional: a shared-references block — DB project, key entity IDs, "counts verified
     <date>" — so items can stay terse. -->

---

## Index

| ID | Title | Status | Owner | Pri |
|---|---|---|---|---|
| <PREFIX>-001 | <title> | <status> | <owner> | <P0–P3> |

---

## Area A — <system area>

### <PREFIX>-001 — <Title>
**Vision.** <The intended outcome, present tense, ≤3 sentences. Merges the original
direction with every subsequently agreed change into one statement; any prior decision is
spelled out in full — no references to conversations.>
**Current.** <Factual assessment vs. the vision, ≤3 sentences, explicit gaps, verified
counts with their verification date.>
**Status.** <vocabulary value> — <one clause of why, if not obvious>.
**Owner.** <who> · **Priority.** <P0–P3>
**Sources.** <commits, migrations, tables, files, docs — or "unsourced beyond this item;
this item IS the record.">
**Updates.** <date> — <author> — created from <origin>.

<!-- A RULED item collapses to law:
### <PREFIX>-0NN — <Title> (LAW)
**The law.** <1–3 declarative sentences. No hedging, no history, no attribution.>
**Work.** <what remains to make reality match, if anything>
**Status.** … · **Owner.** … · **Priority.** …
**Updates.** <date> — ruled and collapsed to law; history in git.
-->

---

## Changelog
- <date> — <author> — Register created per the item-register skill from <sources>;
  <source doc> archived in place with a pointer.
```

# Changelog

- 2026-08-24 — Created alongside the item-register skill, distilled from the Keyword
  Intelligence register's proven structure.
