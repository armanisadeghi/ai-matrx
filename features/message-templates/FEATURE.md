# Message templates — frontend implementation

Cross-repo authority: `/Users/armanisadeghi/code/common-docs/systems/communications/message-templates/FEATURE.md`.
This file records only the browser implementation.

`features/message-templates/` is the one authoring and discovery surface for
`agent.message_template`. Outreach did not add a template table or a private editor. Email
subjects extend the generic row through `metadata.subject_template`; the body remains
`content`, so agent/assist/notification consumers keep the same primitive.

The editor deliberately does not claim that a syntactically valid merge field can be sent.
Only aidream's strict renderer has the real target bindings. The email workflow previews the
template against the selected CRM member and refuses missing, null, blank, empty, malformed,
or unresolved paths before it creates an approvable interaction.

## Browser contracts

- Row and write types derive from `types/database.types.ts`; only the `metadata` JSON field is
  narrowed with `readMessageTemplateMetadata()`.
- An email-ready template has a non-blank string `metadata.subject_template` and non-blank
  `content`.
- Template visibility and organization RLS remain the discovery authority. Public templates
  may be consumed cross-org; internal templates may not.
- `/chat/message-templates` is the canonical authoring home; the former Settings routes
  permanently redirect to their exact chat counterparts.
- `/chat/message-templates/new` is the repair door when the single-send surface finds no
  email-ready template.
- The Smart Agent Input `+` menu renders its user-message template picker inside the same
  resource panel used by Tools and Skills. Row selection applies immediately; preview and
  new-tab doors remain separate controls. Selection prepends the template, then one blank line,
  then the byte-identical existing draft; the standard composer expands automatically.
- Assistant-message **Save as → Message Template** opens the reusable quick-save window. It
  seeds the full visible turn, defaults role to `assistant`, reuses the shared content-refine
  editor, and supports New or Existing with Append or compare-confirmed Overwrite. New rows
  carry the explicitly selected `organization_id`; missing organization context refuses before
  Supabase I/O. Existing updates preserve metadata such as `subject_template`.

## Reuse-first record

The Phase 4 audit searched both repositories for template/render/merge/variable synonyms and
inspected notifications, assists, and agent messages. It found this existing full CRUD/editor,
so Phase 4 extended it instead of creating outreach-local authoring. The new runtime half lives
in aidream and is intentionally strict; the existing permissive AI variable replacement and
domain-local formatter were not safe send primitives.

The Smart Agent Input integration searched for existing template browsers, selectors, resource
drill-ins, doors, and draft writers. It reuses the canonical template service, `ProInput`,
`ResourcePickerSubViewHeader`, `EntityDoorControls`, the canonical user-input slice, and the
existing composer expansion path. The full `TemplateBrowserModal` stays dedicated to its
preview-before-use authoring flow.

The assistant-message integration searched the Notes quick-save family, template selectors,
editor/service paths, overlay openers, WindowPanel registry, and entity doors. It reuses
`RefinableContentEditor`, the canonical template service and generated row types, `WindowPanel`,
`lazyOverlay`, the typed opener pattern, and the registered `message_template` `EntityRef` door;
no table or parallel writer was added.

## Change log

- **2026-08-24** — Added assistant-message quick save to message templates: shared refinement,
  new/existing targets, append/overwrite comparison, template-native fields, typed window
  overlay, post-save door, and explicit selected-organization create writes.
- **2026-08-21** — Moved the canonical authoring route from Settings to Chat, updated every
  internal door, and retained permanent redirects for existing links.
- **2026-08-20** — Replaced chat's modal detour with an in-panel, mobile-friendly picker whose
  rows apply immediately and whose preview/open doors remain independent.
- **2026-08-19** — Reused the canonical browser in chat's Smart Agent Input; template insertion
  preserves existing drafts and automatically expands the composer.
- **2026-08-15** — Added email-subject authoring and documented this existing feature as the
  shared frontend half of the message-template primitive.
