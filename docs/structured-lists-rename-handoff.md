# Structured Lists Rename Handoff

Date: 2026-07-14

## Summary

Picklists are now named **Structured Lists** at the database and platform-entity layer.

A Structured List is a reusable, editable, optionally grouped list of item objects. It can power dropdown
choices, dependent choices, agent variable choices, task lists, shopping lists, menus, lightweight
taxonomies, reusable labels, and other list-shaped data. The word "picklist" should be reserved for the
specific usage mode where a Structured List is projected into a dropdown/choice UI.

A Structured List is not a full UDT dataset. Its item shape is intentionally fixed:

- `label`
- protected `description`
- `help_text`
- optional `group_name`
- optional `icon_name`
- ownership, visibility, organization, actor, timestamp, and version metadata

A UDT dataset remains the true flexible table model: dynamic fields, typed row/cell data, validation,
history, imports/exports, and bulk table operations.

## Database Change

Canonical tables:

- `workbench.udt_structured_lists`
- `workbench.udt_structured_list_items`

Canonical platform entity:

- `platform.entity_types.token = 'structured_list'`

Canonical shareable resource:

- `platform.shareable_resource_registry.resource_type = 'structured_list'`
- `platform.shareable_resource_registry.schema_name = 'workbench'`
- `platform.shareable_resource_registry.table_name = 'udt_structured_lists'`

Columns were intentionally kept stable in this migration. Continue using `list_name` on the parent table
and `list_id` on the item table.

## Frontend Updates

Update direct Supabase table references:

- `udt_picklists` → `udt_structured_lists`
- `udt_picklist_items` → `udt_structured_list_items`

Update share/entity tokens:

- `udt_picklists` or `picklist` as a resource/entity token → `structured_list`

Keep UI copy aligned with the product language:

- Use **Structured List** for the editable data object.
- Use **picklist** only when describing dropdown/choice behavior.
- Do not describe Structured Lists as read-only or dropdown-only.

Expected frontend hotspots:

- `features/udt-picklist/usePicklists.ts`
- `features/user-lists/actions/list-actions.ts`
- list manager windows and picker surfaces
- generated Supabase database types
- sharing/resource registry helpers
- Matrx reference UI labels for list/group/item references

## Primary Server Updates

Update SQL and ORM/query code to use:

- `workbench.udt_structured_lists`
- `workbench.udt_structured_list_items`
- resource token `structured_list`

Expected server hotspots:

- user-data picklist/list query modules
- picklist creator/list creator tools
- Pydantic schemas and route names that expose list data
- generated ORM managers for UDT tables
- permission checks that pass a resource type into `has_permission` / `has_permission_for`
- Matrx reference resolvers for full list, group, and item references

Server API names may move in a second pass, but database-facing code should move now.

## matrx-extend Updates

Regenerate or update database/table metadata so package consumers see:

- `udt_structured_lists`
- `udt_structured_list_items`
- `structured_list`

Review any hard-coded reference types, bookmark types, dynamic entity unions, or resource registries. The
package should describe the object as a Structured List even when a consuming UI renders it as a dropdown.

## Naming Guidance

Preferred language:

- Structured List
- Structured List Item
- grouped Structured List
- list item
- choice projection
- dropdown/picklist usage

Avoid for the data model:

- custom list
- picklist table
- read-only list
- dropdown-only list

Dataset naming remains valid. Use **UDT Dataset** or **Typed Dataset** when clarity is needed; the table
family stays `udt_datasets`, `udt_dataset_fields`, and `udt_dataset_rows`.
