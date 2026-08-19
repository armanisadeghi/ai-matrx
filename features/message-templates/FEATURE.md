# Message templates — frontend implementation

Cross-repo authority: `/Users/armanisadeghi/code/common-docs/systems/message-templates/FEATURE.md`.
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
- `/settings/message-templates/new` is the repair door when the single-send surface finds no
  email-ready template.
- The Smart Agent Input `+` menu opens the canonical `TemplateBrowserModal` filtered to user
  messages. Selection prepends the template, then one blank line, then the byte-identical
  existing draft; the standard composer opens its expanded writing view automatically.

## Reuse-first record

The Phase 4 audit searched both repositories for template/render/merge/variable synonyms and
inspected notifications, assists, and agent messages. It found this existing full CRUD/editor,
so Phase 4 extended it instead of creating outreach-local authoring. The new runtime half lives
in aidream and is intentionally strict; the existing permissive AI variable replacement and
domain-local formatter were not safe send primitives.

The Smart Agent Input integration searched for existing template browsers, selectors, and draft
writers. It reused `TemplateBrowserModal`, the execution system's canonical user-input slice, and
the existing composer expansion path; only the domain-local prepend rule was added.

## Change log

- **2026-08-19** — Reused the canonical browser in chat's Smart Agent Input; template insertion
  preserves existing drafts and automatically expands the composer.
- **2026-08-15** — Added email-subject authoring and documented this existing feature as the
  shared frontend half of the message-template primitive.
