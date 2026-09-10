# Surface authoring — inheritance and families

Read this when a surface declares `inheritsFrom`, is the parent of other surfaces, or a family's vocabulary is being fixed.

## THE FAMILY DOCTRINE — what a parent conveys, what a child owns

Inheritance is not a convenience; it is how one CONCEPT keeps ONE name across a
whole family so an agent bound once works everywhere. Get the division of
labour right and children stay tiny; get it wrong and you split the vocabulary.

**The division of labour**

| The PARENT conveys | The CHILD owns |
|---|---|
| The **container's identity** — the ids and names every descendant is inside (`brand_id`, `site_id`, `project_id`). Almost always `alwaysAvailable`. | **What only this screen can see** — the record on screen, the selection, the editor's live state (`page_content`, `current_note`, `draft_content`). |
| **Context every descendant would otherwise refetch** — the shared blob an agent needs to reason at all (`brand_context`, `site_context`). | Its **own identity**: `label`, `readiness`, `intro`, curated `groups`, its own scope builder. Never inherited. |
| **Family-wide rollups** that are true anywhere in the family (`open_findings_total`, `pages_total`). | Its **write targets** and **agent roles** — a child binds its own agents; it does not inherit a parent's job. |

**The five rules**

1. **Inherit only when the parent's whole vocabulary is TRUE on the child.** A sibling that cannot emit the parent's values must NOT inherit — it is a different family. (Same shape ≠ same surface: `working-document` and `scratchpad` share a value set and stay separate because purpose and bound agents differ.)
2. **Never re-declare what the parent conveys** — that is a SHADOW: one concept, two declarations, and bindings land on whichever copy the author happened to see. Same meaning → delete the child's copy (the scope builder still takes it as a param). Different meaning → it needs its OWN name. `pnpm check:surface-impact` reports these as `SHADOWED_VALUE`.
   **The one exception — THE AVAILABILITY OVERRIDE:** the parent always has the value, this child only sometimes does. Re-declare it with the SAME name and type and `alwaysAvailable: false`. That is the honest declaration, the screamer does not flag it, and deleting it would convert an under-promise into a promise the child cannot keep — the value-mapping guard then screams at runtime. Widening (child `true` where the parent says `false`) is forbidden unless the child truly emits it every time.
3. **Push a value UP the moment a second child needs it.** Two siblings declaring the same concept is the missing-parent smell: move it to the parent (or introduce one), delete both copies, repoint nothing — the name did not change.
4. **A parent value is load-bearing for the whole family.** Before you touch one, run `pnpm check:surface-impact <parent>` — it prints every descendant plus every binding/shortcut/write-twin, including ones that arrived `via child <name>`. `brand_id` on `marketing-brand` has 21 descendants; renaming it is 21 scope builders and every binding under them.
5. **Depth ≤ 3, and never inherit for convenience.** The registry throws at module init on an unknown parent, a cycle, or depth > 3. If you want a parent only to avoid retyping five values, you want a copy, not a family.

**The shape, in the live marketing family** (`brand → site → page`, the deepest we have):

```
marketing-brand   12 own   brand_id*, brand_name, brand_context, brand_profile, …        21 descendants
  marketing-site  11 own   site_id*, site_name, site_root_url, site_context, …           18 descendants
    marketing-page 60 own  page_id*, page_url*, page_content, observed_*, findings, …    leaf
```
The child declares ONLY its own layer; `site_id` and `brand_id` arrive by
inheritance and become REQUIRED params of `createMarketingPageScope`, so a page
can never launch an agent without its ancestry's identity. That is the whole
point: the agent bound to `brand_context` works on the brand cockpit, on every
site, and on every page, with one binding.

**Mount-less / server-emitted children.** "Inherited `alwaysAvailable` → REQUIRED param" and "`...base` spread FIRST" assume a client `SurfaceRuntimeProvider` that can hand the child its parent's scope. When the scope is assembled server-side (or by a job) there is no parent scope at runtime, and forcing the params would make callers fabricate values they do not have. Then: keep inherited keys OPTIONAL, take an optional `inheritedBase` and spread it FIRST in the body, and write the reason beside the builder. Honor the rule structurally, not ceremonially.

**Fixing a family that is already wrong** — do it in this order, in one change:
run `check:surface-impact` on the parent and each child · move the concept to
the parent · delete the children's shadows · update each child's scope builder
(inherited `alwaysAvailable` → required param, `...base` spread FIRST) ·
re-run the screamer until the `SHADOWED_VALUE` rows for that family are gone ·
sync the DB · `pnpm check:surface-drift`.

## INHERITANCE WORKED EXAMPLE — marketing-page → marketing-site

`marketing-page` declares `inheritsFrom: "matrx-user/marketing-site"` (which itself inherits `marketing-brand`). What that means for the child's scope helper:

- **Inherited `alwaysAvailable: true` keys become REQUIRED params in the child's builder.** `site_id` / `brand_id` are guaranteed by the parent, so `buildMarketingPageScope` takes them as non-optional inputs and `createMarketingPageScope` requires them — the child can never launch without its ancestry's identity.
- **Inherited optionals become `?` params** — `site_context` / `brand_context` flow down when the host loaded them.
- The child's builder composes: build/receive the parent's scope, `return createMarketingPageScope({ ...base, page_id, page_url, ... })` — spread `...base` FIRST so child keys win on collision.
- In the resolved registry, inherited values land in synthesized `inherited:matrx-user/marketing-site` / `inherited:matrx-user/marketing-brand` groups, sorted after the child's curated groups and before baselines.
- Inherit only when the parent's vocabulary is TRUE on the child. A sibling that doesn't emit the parent's values must NOT inherit.
