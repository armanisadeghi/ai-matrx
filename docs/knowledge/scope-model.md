# Scopes — What They Are

> Full detail for the scope model. Summarized in [`02_KNOWLEDGE_ARCHITECTURE.md`](02_KNOWLEDGE_ARCHITECTURE.md) §4 and [`03_KNOWLEDGE_MODULE.md`](03_KNOWLEDGE_MODULE.md) §5. Companion: the entity catalogue → [`scopeable_entities.md`](scopeable_entities.md).

**The problem:** We can't hardcode dimensions like Salesforce does ("Client", "Order", "Product"). Not every org has those. A law firm has clients, cases, and practice areas; a marketing team has clients and departments; a parent has kids. So the user defines their own dimensions.

**The model:** A user defines a **scope type** (a dimension), creates **scopes** (instances of it), defines **items** (fields) on the type, and fills in **values** per scope.

## The four-level chain

```
scope type   →   scope        →   item        →   value
(dimension)      (instance)       (field)         (the data)
```

Concrete (a parent's personal org):

| Level | Example |
|---|---|
| Scope type | `Kids` |
| Scopes | `Ava`, `Sara` |
| Items | `name`, `age`, `grade_level` |
| Values (for Ava) | name=Ava Sadeghi, age=15, grade_level=10 |

Key point: **items are defined on the type, not the scope.** Defining `age` on `Kids` means every kid scope has an `age` cell. Items are columns; scopes are rows; values are cells.

## Two ways something relates to a scope

Don't confuse these — they attach at different points and mean different things:

1. **It's an attribute of the scope** → an item/value (above). Ava's `age` *is* Ava. Items are defined on the **type**; values are set per **scope**.
2. **It's an entity tagged to the scope** → an M2M assignment. A note, message, task, agent, etc. The note isn't part of Ava; it's *about* Ava.

```
(entity_type, entity_id)  ←→  scope
        e.g. ('note', <note_id>)  ↔  Ava
```

An entity is tagged to a **scope**, never to a scope type. One entity can carry many scopes; one scope tags many entities.

> **Automating both attach points.** When new content arrives, a Helpful Agent matches it to *known* scopes (path 2 → assignment) and, once a scope is known, extracts values for that scope-type's *known* items (path 1 → value). Both are **suggestions** the user confirms, scored by a **match confidence** that is *not* a trust/quality score. Full spec: [`scope-association-pipeline.md`](scope-association-pipeline.md).

## Treat scope values as ground truth

A scope value is a curated, authoritative fact about the scope — not a guess to second-guess. A value is free-form: a word, a paragraph, a long document, or JSON. Each value records a `source_type` (`user_input` / `ai_generated` / `imported` / `system`), which is how to tell a human-confirmed fact from an unreviewed AI extraction.

## Where this lives

- A **user** belongs to **orgs**.
- An **org** owns its **scope types** (dimensions are per-org).
- **Projects** and **tasks** are a *separate* system — not scopes. They can optionally be associated with scopes (via the same M2M assignment), but they are not part of the scope hierarchy.

## Runtime context — three layers (NEVER conflate them)

At runtime, "context" splits into three distinct things. Reaching into the wrong one is the single biggest source of rot in this codebase (it silently binds entities to scopes the user never chose).

| Layer | What it is | Where it lives | Who writes it |
|---|---|---|---|
| **A — Active (passive) context** | The user's working "ground rules" right now: active org + active scopes + active scope *types* + active project/task. Sitting there because it's loaded. | `lib/redux/slices/appContextSlice.ts` | **Surface A only** (`features/scopes/components/active-context/**`) |
| **B — Reference tree** | What *exists*: the full org → scope type → scope → project catalogue. Read-only cache. | Canonical owner: `features/scopes/redux/scopesSlice.ts` (`state.scopesTree`). The legacy `features/agent-context/redux/*` fan-out slices are **being retired into it.** | Fetched once at boot (`ensureScopeTree`); **durably warm-cached across reload** (`scopesTreePolicy`, sync engine); refreshed only by `scopeTreeInvalidationMiddleware` on structural mutations |
| **C — Object assignment** | What the user is setting *on* a specific object ("tag THIS note with Ava"). | `ctx_scope_assignments` / canonical `platform.associations` | `setEntityScopes` chokepoint, from the user's **explicit UI selection** |

**The load-bearing rule:** a user **action** (binding, tagging, assigning — Layer C) MUST read the user's **explicit UI selection**, *never* Layer A just because it's convenient and loaded. Layer A is "where I'm working," not "what I'm acting on." A successful write that sourced Layer A instead of the explicit selection is *worse* than a failure — it silently mis-binds.

**Active scopes are multi, and so are active types.** Layer A holds *any number* of active scopes across *any number* of types (`scope_selections`, keyed by scope id since 2026-06-12). Separately and more rarely, a user can activate a whole scope **type with no specific scope chosen** — "I'm working in Clients" / an HR manager activating "Departments" / a parent activating "Kids" without picking one. That lives in `appContextSlice.active_scope_type_ids` (added 2026-06-30); a type with a chosen scope doesn't need to be listed there.

> **Associations are the only M2M.** Object assignment (Layer C), and every agent/entity↔scope/project/task link, goes through the canonical `platform.associations` system. No bespoke per-table M2M (the condemned `agent_surface` binding in `features/surfaces` is the cautionary example). project_id / task_id are M2M now — not single FK columns.

## Tables (look up the DB for columns)

| Table | Holds |
|---|---|
| `ctx_scope_types` | dimensions (per org) |
| `ctx_scopes` | instances of a dimension |
| `ctx_context_items` | fields defined on a type |
| `ctx_context_item_values` | values per scope × item — *versioned*: many rows per cell, the live one is `is_current = true` |
| `ctx_scope_assignments` | M2M: scope ↔ any entity |

## Condensed Example:
{
    'user_id': '4cf62e4e-2679-484f-b652-034e697418df',
    'organizations': [
        {
            'id': '3e790542-fdaf-40b2-8bf3-658bf94fe67f',
            'name': "Arman Sadeghi's Workspace",
            'slug': 'arman',
            'is_personal': True,
            'role': 'owner',
            'scope_type_count': 2,
            'scope_types': [
                {
                    'id': '1527565e-7296-4397-a76b-312ca80962e2',
                    'label_singular': 'Hobby',
                    'label_plural': 'Hobbies',
                    'item_definition_count': 0,
                    'scope_count': 2,
                    'scopes': [
                        {
                            'id': 'c235381d-adbd-4453-98e8-18ba6e81f25a',
                            'name': 'Fitness',
                            'items': [],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': '0512c55e-8c24-4a34-9b88-620a4d9fcb72',
                            'name': 'Girl CEO',
                            'items': [],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        }
                    ],
                    'child_types': []
                },
                {
                    'id': 'c9d7ccbe-c53e-4e3b-af66-30ce50a474fd',
                    'label_singular': 'Kid',
                    'label_plural': 'Kids',
                    'item_definition_count': 5,
                    'scope_count': 2,
                    'scopes': [
                        {
                            'id': '2400c4db-6789-4868-9280-0899fe024d69',
                            'name': 'Ava',
                            'items': [
                                {'key': 'current_class_list', 'has_value': False},
                                {'key': 'current_school', 'has_value': False},
                                {'key': 'date_of_birth', 'has_value': False},
                                {'key': 'grade_level', 'has_value': False},
                                {'key': 'weekly_allowance', 'has_value': False}
                            ],
                            'assignment_counts': {
                                'total': 5,
                                'by_entity_type': {'note': 4, 'task': 1}
                            },
                            'children': []
                        },
                        {
                            'id': '134b97b5-4427-4c5c-85ff-dcba08a2bfe7',
                            'name': 'Sara',
                            'items': [
                                {'key': 'current_class_list', 'has_value': False},
                                {'key': 'current_school', 'has_value': False},
                                {'key': 'date_of_birth', 'has_value': False},
                                {'key': 'grade_level', 'has_value': False},
                                {'key': 'weekly_allowance', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        }
                    ],
                    'child_types': []
                }
            ]
        },
        {
            'id': '5dc930e9-bd65-44a1-8369-af773f6e1a5b',
            'name': 'AI Matrx',
            'slug': 'ai-matrx',
            'is_personal': False,
            'role': 'owner',
            'scope_type_count': 2,
            'scope_types': [
                {
                    'id': '5155b79c-4c54-4694-b644-2e21ea6833b7',
                    'label_singular': 'App',
                    'label_plural': 'Apps',
                    'item_definition_count': 4,
                    'scope_count': 8,
                    'scopes': [
                        {
                            'id': 'c5c4a09d-6368-40c6-aae3-723ccc57d01f',
                            'name': 'AI Dream',
                            'items': [
                                {'key': 'core_principles', 'has_value': False},
                                {'key': 'non_negotiable_dev_standards', 'has_value': False},
                                {'key': 'repository', 'has_value': False},
                                {'key': 'tech_stack', 'has_value': True}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': '3a8fe68d-6219-4cd7-8a03-0036c884aab4',
                            'name': 'Matrx AI',
                            'items': [
                                {'key': 'core_principles', 'has_value': False},
                                {'key': 'non_negotiable_dev_standards', 'has_value': False},
                                {'key': 'repository', 'has_value': False},
                                {'key': 'tech_stack', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': '202b7327-5fab-4598-af94-6785a0e61cde',
                            'name': 'Matrx Chrome',
                            'items': [
                                {'key': 'core_principles', 'has_value': False},
                                {'key': 'non_negotiable_dev_standards', 'has_value': False},
                                {'key': 'repository', 'has_value': False},
                                {'key': 'tech_stack', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': '2ba5cb52-9530-4682-a12c-3ededff23c2c',
                            'name': 'Matrx Frontend',
                            'items': [
                                {'key': 'core_principles', 'has_value': True},
                                {'key': 'non_negotiable_dev_standards', 'has_value': True},
                                {'key': 'repository', 'has_value': True},
                                {'key': 'tech_stack', 'has_value': True}
                            ],
                            'assignment_counts': {'total': 2, 'by_entity_type': {'task': 2}},
                            'children': []
                        },
                        {
                            'id': 'a913306c-abea-4a67-9c87-941d04f9e8c5',
                            'name': 'Matrx Local',
                            'items': [
                                {'key': 'core_principles', 'has_value': False},
                                {'key': 'non_negotiable_dev_standards', 'has_value': False},
                                {'key': 'repository', 'has_value': False},
                                {'key': 'tech_stack', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': 'd3b56219-5a7a-4c43-94da-ede7f178f8bb',
                            'name': 'Matrx ORM',
                            'items': [
                                {'key': 'core_principles', 'has_value': False},
                                {'key': 'non_negotiable_dev_standards', 'has_value': False},
                                {'key': 'repository', 'has_value': False},
                                {'key': 'tech_stack', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': '5612d1d4-a84f-4dd4-adce-e791e94158ec',
                            'name': 'Matrx Scraper',
                            'items': [
                                {'key': 'core_principles', 'has_value': False},
                                {'key': 'non_negotiable_dev_standards', 'has_value': False},
                                {'key': 'repository', 'has_value': False},
                                {'key': 'tech_stack', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': 'd3ebfa03-1951-4ac6-8c53-90fa496022b3',
                            'name': 'Matrx Utils',
                            'items': [
                                {'key': 'core_principles', 'has_value': False},
                                {'key': 'non_negotiable_dev_standards', 'has_value': False},
                                {'key': 'repository', 'has_value': False},
                                {'key': 'tech_stack', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        }
                    ],
                    'child_types': []
                },
                {
                    'id': 'b2594416-1c8d-4ed1-984a-a70c72eb4a1d',
                    'label_singular': 'Internal System',
                    'label_plural': 'Internal Systems',
                    'item_definition_count': 0,
                    'scope_count': 0,
                    'scopes': [],
                    'child_types': []
                }
            ]
        },
        {
            'id': 'f9cb3e35-2a65-4f2a-8525-088d6551071c',
            'name': 'Titanium',
            'slug': 'titanium',
            'is_personal': False,
            'role': 'owner',
            'scope_type_count': 2,
            'scope_types': [
                {
                    'id': '37fd85b9-c25a-4b29-8048-e770bc8bd26f',
                    'label_singular': 'Client',
                    'label_plural': 'Clients',
                    'item_definition_count': 9,
                    'scope_count': 4,
                    'scopes': [
                        {
                            'id': '5e6e4cae-3139-40ee-a6ff-ea3121e929cd',
                            'name': 'AI Matrx',
                            'items': [
                                {'key': 'brand_personality', 'has_value': False},
                                {'key': 'brand_type', 'has_value': False},
                                {'key': 'brand_voice', 'has_value': False},
                                {'key': 'credentials', 'has_value': False},
                                {'key': 'industry', 'has_value': False},
                                {'key': 'location', 'has_value': False},
                                {'key': 'marketing_package_details', 'has_value': False},
                                {'key': 'primary_service', 'has_value': False},
                                {'key': 'primary_website', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': '04448810-ade8-4b2a-8370-68a0eb2e0d74',
                            'name': 'All Green Electronics Recycling',
                            'items': [
                                {'key': 'brand_personality', 'has_value': False},
                                {'key': 'brand_type', 'has_value': False},
                                {'key': 'brand_voice', 'has_value': False},
                                {'key': 'credentials', 'has_value': False},
                                {'key': 'industry', 'has_value': False},
                                {'key': 'location', 'has_value': False},
                                {'key': 'marketing_package_details', 'has_value': False},
                                {'key': 'primary_service', 'has_value': False},
                                {'key': 'primary_website', 'has_value': False}
                            ],
                            'assignment_counts': {
                                'total': 2,
                                'by_entity_type': {'note': 1, 'project': 1}
                            },
                            'children': []
                        },
                        {
                            'id': 'e8403f15-9dce-40c0-a073-df432d36e620',
                            'name': 'Cosmetics Injectables Medspa',
                            'items': [
                                {'key': 'brand_personality', 'has_value': False},
                                {'key': 'brand_type', 'has_value': False},
                                {'key': 'brand_voice', 'has_value': False},
                                {'key': 'credentials', 'has_value': False},
                                {'key': 'industry', 'has_value': False},
                                {'key': 'location', 'has_value': False},
                                {'key': 'marketing_package_details', 'has_value': False},
                                {'key': 'primary_service', 'has_value': False},
                                {'key': 'primary_website', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': '4378d74f-3adc-4112-b79c-76ce43dda8d8',
                            'name': 'Data Destruction, Inc',
                            'items': [
                                {'key': 'brand_personality', 'has_value': False},
                                {'key': 'brand_type', 'has_value': False},
                                {'key': 'brand_voice', 'has_value': False},
                                {'key': 'credentials', 'has_value': False},
                                {'key': 'industry', 'has_value': False},
                                {'key': 'location', 'has_value': False},
                                {'key': 'marketing_package_details', 'has_value': False},
                                {'key': 'primary_service', 'has_value': False},
                                {'key': 'primary_website', 'has_value': False}
                            ],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        }
                    ],
                    'child_types': []
                },
                {
                    'id': 'e216a4de-3d73-4927-b31f-492c7b42c0c0',
                    'label_singular': 'Department',
                    'label_plural': 'Departments',
                    'item_definition_count': 0,
                    'scope_count': 4,
                    'scopes': [
                        {
                            'id': 'e3e0e9a2-fa97-4831-b47e-9e56b6e87cdc',
                            'name': 'Branding',
                            'items': [],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        },
                        {
                            'id': '63298cf8-fa33-43a0-9bbf-5087f3cef421',
                            'name': 'Content Writing',
                            'items': [],
                            'assignment_counts': {'total': 1, 'by_entity_type': {'note': 1}},
                            'children': []
                        },
                        {
                            'id': 'eaa982ac-0a5c-4d04-86df-5a0e9f0afadb',
                            'name': 'SEO',
                            'items': [],
                            'assignment_counts': {'total': 1, 'by_entity_type': {'project': 1}},
                            'children': []
                        },
                        {
                            'id': '249d5976-8a9a-43c3-ab5f-0ccc50ccaa32',
                            'name': 'Web Development',
                            'items': [],
                            'assignment_counts': {'total': 0, 'by_entity_type': {}},
                            'children': []
                        }
                    ],
                    'child_types': []
                }
            ]
        }
    ]
}