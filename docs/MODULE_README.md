# `` — Module Overview

> This document is partially auto-generated. Sections tagged `<!-- AUTO:id -->` are refreshed by the generator.
> Everything else is yours to edit freely and will never be overwritten.

<!-- AUTO:meta -->
## About This Document

This file is **partially auto-generated**. Sections wrapped in `<!-- AUTO:id -->` tags
are overwritten each time the generator runs. Everything else is yours to edit freely.

| Field | Value |
|-------|-------|
| Module | `` |
| Last generated | 2026-06-24 13:01 |
| Output file | `MODULE_README.md` |
| Signature mode | `signatures` |


**Child READMEs detected** (signatures collapsed — see links for detail):

| README | |
|--------|---|
| [`db_rebuild/MODULE_README.md`](db_rebuild/MODULE_README.md) | last generated 2026-06-24 13:00 |
**To refresh auto-sections:**
```bash
python utils/code_context/generate_module_readme.py  --mode signatures
```

**To add permanent notes:** Write anywhere outside the `<!-- AUTO:... -->` blocks.
<!-- /AUTO:meta -->

<!-- HUMAN-EDITABLE: This section is yours. Agents & Humans can edit this section freely — it will not be overwritten. -->

## Architecture

> **Fill this in.** Describe the execution flow and layer map for this module.
> See `utils/code_context/MODULE_README_SPEC.md` for the recommended format.
>
> Suggested structure:
>
> ### Layers
> | File | Role |
> |------|------|
> | `entry.py` | Public entry point — receives requests, returns results |
> | `engine.py` | Core dispatch logic |
> | `models.py` | Shared data types |
>
> ### Call Flow (happy path)
> ```
> entry_function() → engine.dispatch() → implementation()
> ```


<!-- AUTO:tree -->
## Directory Tree

> Auto-generated. 3 files across 3 directories.

```
./
├── .DS_Store
├── _current/
├── archive/
│   ├── tool-call-legacy/
│   │   ├── agents-analysis/
├── concepts/
│   ├── full-sync-boardcast-storage/
├── ctx/
├── db_rebuild/
│   ├── MODULE_README.md
├── files/
├── handoffs/
├── knowledge/
│   ├── visuals/
├── official/
│   ├── .DS_Store
│   ├── database/
├── other/
├── protocol/
├── sandbox/
├── superpowers/
│   ├── plans/
├── tasks/
│   ├── google-oauth/
# excluded: 143 .md, 5 .svg, 2 .sql, 1 .json
```
<!-- /AUTO:tree -->

<!-- AUTO:signatures -->
## API Signatures

> Auto-generated via `output_mode="{mode}"`. ~5-10% token cost vs full source.
> For full source, open the individual files directly.
> Submodules with their own `MODULE_README.md` are collapsed to a single stub line.

```
---
Filepath: .DS_Store  [unknown ()]

  # signature extraction not supported for this language



---
Filepath: official/.DS_Store  [unknown ()]

  # signature extraction not supported for this language
```
<!-- /AUTO:signatures -->

<!-- AUTO:config -->
## Generation Config

> Auto-managed. Contains the exact parameters used to generate this README.
> Used by parent modules to auto-refresh this file when it is stale.
> Do not edit manually — changes will be overwritten on the next run.

```json
{
  "subdirectory": "",
  "mode": "signatures",
  "scope": null,
  "project_noise": null,
  "include_call_graph": true,
  "entry_points": null,
  "call_graph_exclude": [
    "tests"
  ]
}
```
<!-- /AUTO:config -->
