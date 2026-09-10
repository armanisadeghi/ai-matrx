# Module-audit protocol — sweep a feature BEFORE wiring

When assigned a whole feature/module (not one page), do the coverage audit
first and emit the gap list; only then wire, batch by batch:

1. **Enumerate surfaces.** Routes (`app/**` for the feature — remember thin
   wrappers delegate to `features/*`), window panels, overlays/dialogs that
   show data, and demo routes. The feature's `/[feature]/admin` map and
   FEATURE.md are the fast index; `grep` for `.map(` in its components to
   find every rendered list.
2. **Classify each rendered data element** as one of: **list/table** (needs
   row control + view menu with export), **record/detail** (header control +
   per-field), **field group / metric cards** (hover-reveal `xs` controls),
   **whole page** (one pair with Groomer inside its AI menu when multi-section), or **non-record
   tool** (composer/visualizer — SKIP, no forced buttons).
3. **Size each one's AI control** (single icon / `aiVariants` dropdown /
   `+aiCustom` composer) per the sized-to-data table in SKILL.md, and note truncated
   lists that lack a show-all — those are defects, list them.
4. **Audit EXISTING payloads against the MISSION.** A wired surface whose
   payload is a raw dump, reads saved rows instead of live state, or misses
   rendered errors/KPIs is a defect even though the buttons exist — list
   these too.
5. **Emit the coverage table** (surface → element → class → current state →
   planned control) in your summary/handoff BEFORE writing code, then wire in
   per-page commits using the step-by-step in SKILL.md.
