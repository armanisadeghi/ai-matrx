# My Classes — how to work on this page

You are on **My Classes** (`/education/classes`, surface `matrx-user/education-classes`).
This guide is for an agent helping the person here. Read it once before your first write.

## What a class is

A class holds one course's study material. It has a name, and optionally a description, teacher,
term, period, access mode, price and exam dates. Under the hood a class is a scope of the
workspace's "Class" scope type, but you never touch scopes. Every change goes through this page's
write targets, which run the same code as the page's own buttons, so each class keeps its
settings, join code and owner membership.

Access modes: `closed` (the default, a private class), `open` (publicly listed; anyone can join),
`paid` (people buy access; needs a price in US dollars, at least 1).

## What you can read

- `organization_state`: `"ready"` when a workspace is selected. Anything else is the reason the
  list cannot load (e.g. `"required"`). A create will then ask the person which workspace to use.
- `class_list` (shown to you in full, no lookup needed): what the page lists — the active classes
  by name, first 25, each `{ id, name, teacher, term, period, access_mode, next_exam }`. Start
  here; its ids work with every target. Look up `owned_classes` only when you need a class's
  description, all its exam dates or its price.
- `owned_classes`: the person's **active** classes, name-ordered, each
  `{ id, slug, name, description, teacher, term, period, access_mode, price_cents, exam_dates: [{ title, date }] }`.
  `price_cents` is set only for paid classes. It is absent while loading or with no workspace, and
  `[]` when they own none.
- `archived_classes`: the person's archived classes (hidden from the list, still intact), same
  shape. It is absent exactly when `owned_classes` is.
- `owned_class_count` and `archived_class_count`: the two counts.
- `joined_classes`: classes someone else owns that the person joined or asked to join, as
  `{ id, slug, name, access_mode, my_status }`. `my_status` is `active`, `pending` (waiting for the
  owner) or `entitled` (purchased, not yet enrolled). You cannot edit these.
- `class_dialog_open` and `new_class_draft`: whether the New class dialog is open and what it holds
  (`price` there is dollars as typed).

The class lists are meant to be shown to you in full up front. If one arrives as a look-up item
instead, read it ONCE with the `context` tool. Do not page through it item by item.

## What you can write

Call the write tool with `target` and `value`. Every target below asks the person first (one
approval card per write).

**`create_classes`** adds classes, saved immediately. The value is an ARRAY of 1-25 classes, and
only `name` is required. "Add my five courses" is ONE write:

```json
[
  { "name": "AP Biology", "teacher": "Ms. Rivera", "term": "Fall 2026", "period": "3" },
  { "name": "Calculus BC", "exam_dates": [{ "title": "Midterm", "date": "2026-10-20" }] },
  { "name": "Spanish II", "access_mode": "open" }
]
```

Set `access_mode` only when the person says who may join. A duplicate name in the list, or a name
the person already has, refuses the whole write, and nothing is created.

**`update_classes`** changes existing classes by `id` (from `owned_classes` or `archived_classes`).
Only the fields you send change. `""` clears a text field. `exam_dates` REPLACES the whole exam
list, so send every exam the class should keep. `archived: true` archives a class and
`archived: false` restores it.

```json
[
  { "id": "<id from owned_classes>", "description": "Honors chemistry",
    "exam_dates": [{ "title": "Midterm", "date": "2026-10-20" }, { "title": "Final", "date": "2026-12-15" }] },
  { "id": "<another id>", "archived": true }
]
```

Switching to `"paid"` needs `price`, unless the class already has one. A `price` on a class that is
not paid is refused.

**`delete_classes`** removes classes for good: `["<id>"]` or `[{ "id": "<id>" }]`. The class
disappears for every student, everything tagged to it loses that link, and nothing on the page can
undo it. Only a workspace owner or admin can delete. **Prefer archiving**
(`update_classes` with `archived: true`). Delete only when the person clearly asks, for example
for a class created by mistake or a duplicate.

**`new_class_draft`** fills the New class dialog without saving, so the person can review it and
press Create class. The value is ONE object:

```json
{ "name": "AP Biology", "access_mode": "paid", "price": 49, "exam_dates": [{ "title": "Final", "date": "2027-05-12" }] }
```

Use it when the person wants to look a class over first. Otherwise use `create_classes`.

## Rules

1. **Send arrays and objects, never strings.** `value` is the array or object itself, not a
   JSON-encoded string.
2. **Validation happens before the approval card.** A bad value (missing name, bad date, unknown
   id, duplicate) comes back refused with the reason, and the person never sees a card. Fix the
   value and call again. A refused write changed nothing.
3. **Results come back with ids.** A successful write returns what landed (names, ids, slugs). Use
   those ids for follow-up updates.
4. **The lists are a snapshot from when your run started.** After a write, trust the write result.
   Do not re-read `owned_classes` to "check"; it will not show your change yet. Never repeat a write
   that succeeded.
5. **A decline is a normal answer.** If the person declines the card, do not retry. Ask what they
   want instead.
6. **Never use `scope_system` (or any generic scope or context tool) for classes.** Those tools
   skip or wipe access mode, join code, exam dates and owner membership, and they can change the
   Class type for everyone in the workspace.
7. Dates are `YYYY-MM-DD`. Prices are dollars (whole or decimal), not cents.

## When you are stuck

If the person wants something no target here can do (e.g. manage a roster, change a joined class,
restore a deleted class), say so plainly. Then file it with the **`surface_feedback`** target so
the team can add it:

```json
{ "kind": "missing_capability", "message": "Person wanted to move students between classes; no target does this.", "target_or_value": "update_classes" }
```

Use `surface_feedback` also when a description here was wrong or unclear, or data you needed was
missing (`kind`: `missing_capability`, `wrong_or_unclear_description`, `bug`, `missing_data`,
`suggestion`). It changes nothing on the page and needs no approval.
