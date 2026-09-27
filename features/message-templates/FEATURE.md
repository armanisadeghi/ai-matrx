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

- **2026-09-27** — page-pass iteration 6: the page menu acts on the DRAFT in edit mode; a menu opened inside a chip field names the field (shared v3 fix); Insert field adds a space when it would touch a word and returns the caret right after the chip; labelled Discard (X) apart from Save, with Discard wording; Save stays visible in the phone header while there are changes; info line reads "Edited N times" and never strands a "·"; the surface supplies content, selection, text around it and context.
- **2026-09-27** — page-pass iteration 5 (judge: "good" → excellent): unsaved edits guarded by the new shared `lib/navigation/useUnsavedChangesGuard` (refresh, header Back, in-app links, browser Back) with a Discard control and an "unsaved changes" sign in View; View/Edit switch client-side (`EntityModeHeader onModeSelect`, no server round-trip); Name/Subject/Message are `MergeFieldTextarea`s owning their right-click menus (the edit form resets menu presence); the view menu carries Edit template / Show example / Archive and reads fields by name; one-line fields stay one line with the toolbar in a right gutter, which also shows on focus; preview only as the filled-in example; meta separators stay with their items; the Agents menu no longer renames a job after load.
- **2026-09-27** — page-pass iteration 4: the subject and message are `MergeFieldTextarea` (`components/merge-field-input/`) — ProTextarea hosting the chip editor in its new `editor` slot, so they keep the one field toolbar (mic/dictation, "…" menu, page agents, right-click); the chip editor keeps its own undo history (typing, insert field, auto-chip, paste, dictation; Cmd/Ctrl+Z, Shift+Cmd+Z, Edit ▸ Undo/Redo); a failed server read offers Retry (`TemplateReadFailure`).
- **2026-09-27** — page-pass iteration 3 (judge: "good" → excellent), posture sharp after Linear/Stripe: subject and message edit in `MergeFieldInput` (`components/merge-field-input/`, new shared primitive — fields render as readable chips over the exact stored text, no raw braces), Insert field on each field (inserts at that field's caret); view mode is ONE record surface (header row, managing job, subject, body — no box-in-box); Save appears only with changes and "Saved" is status text; quiet visibility badge; compact Fields/Example switch; chip contrast from tokens in both themes; tags use the chip tag input.
- **2026-09-27** — page-pass iteration (judge: "mediocre"), posture sharp after Linear/Stripe: labelled edit fields (Name, Email subject, Message, Tags); merge fields named in plain words with an Example preview and an Insert field menu (`lib/merge-fields.ts`, mirrors the server renderer's grammar and the senders' bindings); the managing job and its note shown in view AND edit ("saving changes what … sends"); updated date and version shown; chat-message role hidden on email templates (Select matches the inputs); visibility switch says what it does; canonical two-icon copy pair; custom fields in both modes; agent twin `archive_template` + `template_fields` value; server read bounded (8s) with an honest failure instead of a 504.
- **2026-09-27** — page-pass: archive, never delete (Arman's standing rule). `archiveTemplate` sets `deleted_at` (Trash restores it); every browser read that lists or renders templates hides archived rows (service list/org/tags/by-id, `/chat/message-templates/[id]`, `/edit/[id]`, `/new?from=`; the org list and peek already did); the record page, list and admin manager confirm by saying the template moves to Trash and that anything sending it stops. aidream's senders (single send, sequence definition, reply drafting) already refuse `deleted_at` rows — no server change.
- **2026-09-27** — page-pass 2026-09-27: type single-record, posture ui-sharp after Linear's issue page, fixed `/chat/message-templates/[id]`: own agent surface `matrx-user/message-template` (record XML bundle + `template_draft` draft target, `lib/message-template-scope.ts`), right-click menu with the record entity, `EntityModeHeader` naming the record (View/Edit modes, Save, Delete), save shows the saved row (was stale) and writes only changed fields (no longer trims the body or turns an unset role into "user"), email subject shown and editable, ProInput/ProTextarea, canonical Copy/Copy-for-AI, unsaved-change guard, record name as tab title, access gate in place of a 404, delete confirm names the platform job a managed template feeds.
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
