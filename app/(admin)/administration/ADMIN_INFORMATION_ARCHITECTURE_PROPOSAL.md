# Administration Information Architecture Proposal

**Status:** Implemented from the canonical registry.

## Goal

Replace the current two-layer dashboard (`category → destination`) with three
meaningful layers:

```text
Top-level domain → focused section → destination
```

The top level answers “what kind of system am I administering?”, the section
narrows that domain to one coherent subsystem, and the final item opens a real
destination.

Three domain boundaries are non-negotiable:

- **AI** is the model/provider/runtime layer.
- **Agents** is the agent-building and agent-execution platform.
- **Chat** is the conversation and request system.

Knowledge is also a first-class domain. It spans acquisition, conversion,
extraction, RAG, retrieval, knowledge graphs, research, and knowledge-derived
publishing systems such as CMS and Podcasts. **Scopes & Context** remains a
separate domain even though it participates in knowledge retrieval.

## Top-level domains

| Domain | Sections | Current destinations |
| --- | ---: | ---: |
| AI | 2 | 10 |
| Agents | 5 | 28 |
| Chat | 1 | 5 |
| Knowledge | 4 | 7 |
| Scopes & Context | 1 | 2 |
| Database | 5 | 24 |
| UI | 4 | 7 |
| Automation | 1 | 7 |
| Applications | 1 | 5 |
| Users | 2 | 9 |
| Compute | 1 | 4 |
| Utilities | 3 | 11 |
| Documentation | 1 | 4 |
| Reporting | 1 | 2 |
| **Total** | **32** | **125** |

Counts cover the 125 unique destinations in the administration registry. Only
real administration destinations are included; product routes and hypothetical
admin hubs are intentionally absent.

## Current tree

### AI

- **Models**
  - AI Model Registry — `/administration/ai-models`
  - Data Audit — `/administration/ai-models/audit`
  - Deprecated Models — `/administration/ai-models/deprecated-audit`
  - Provider Model Sync — `/administration/ai-models/provider-sync`
  - Providers — `/administration/ai-models/providers`
  - Endpoints & APIs — `/administration/ai-models/endpoints`
  - Offerings — `/administration/ai-models/offerings`
  - Settings — `/administration/ai-models/settings`
  - Aliases — `/administration/ai-models/aliases`
- **Operations**
  - AI Tasks — `/administration/ai-tasks`

### Agents

- **System Agents**
  - Agents Dashboard — `/administration/system-agents`
  - Agents List — `/administration/system-agents/agents`
  - Agents Shortcuts — `/administration/system-agents/shortcuts`
  - Agents Categories — `/administration/system-agents/categories`
  - Agents Content Blocks — `/administration/system-agents/content-blocks`
  - Agents Apps — `/administration/system-agents/apps`
  - Agents Lineage — `/administration/system-agents/lineage`
  - New Agent — `/administration/system-agents/agents/new`
  - New Agent Manual — `/administration/system-agents/agents/new/manual`
  - New App — `/administration/system-agents/apps/new`
  - All Shortcuts — `/administration/system-agents/shortcuts/all`
- **Published Agent Apps**
  - Agent Apps Dashboard — `/administration/agent-apps`
  - All Agent Apps — `/administration/agent-apps/apps`
  - Agent App Categories — `/administration/agent-apps/categories`
  - Agent App Executions — `/administration/agent-apps/executions`
  - Agent App Analytics — `/administration/agent-apps/analytics`
  - Agent App Rate Limits — `/administration/agent-apps/rate-limits`
- **Skills**
  - Skills Registry — `/administration/skills`
  - Categories — `/administration/skills/categories`
  - Filesystem Ingest — `/administration/skills/ingest`
- **Tools & MCP**
  - Action Catalog — `/administration/relationships/actions`
  - Tool Definitions — `/administration/mcp-tools`
  - MCP Servers — `/administration/mcp-servers`
  - Bundles — `/administration/bundles`
  - Tool Runtimes — `/administration/executor-surfaces`
  - Lookups — `/administration/lookups`
  - New Tool Definition — `/administration/mcp-tools/new`
- **Health & Drift**
  - Agent Drift Report — `/administration/reports/agent-drift`

### Chat

- **CX Conversations**
  - CX Dashboard — `/administration/cx-dashboard`
  - Conversations — `/administration/cx-dashboard/conversations`
  - User Requests — `/administration/cx-dashboard/requests`
  - Usage & Cost Analytics — `/administration/cx-dashboard/usage`
  - Errors & Issues — `/administration/cx-dashboard/errors`

### Knowledge

- **Knowledge Graph**
  - KG Cost Dashboard — `/administration/kg-cost`
  - KG Inspector — `/administration/kg-inspector`
- **Research**
  - Research Admin — `/administration/research-system`
- **Podcasts**
  - Podcasts Hub — `/administration/podcasts`
  - Podcast Manager — `/administration/podcasts/shows`
  - New Podcast Show — `/administration/podcasts/shows/new`
- **CMS**
  - CMS Agent Activity — `/administration/cms-agents`

### Scopes & Context

- **Context**
  - System Context — `/administration/system-context`
  - Context Inspector — `/administration/context-inspector`

### Database

- **Database Tools**
  - Database Tools Hub — `/administration/database`
  - Database Admin Dashboard — `/administration/database-admin`
  - SQL Editor — `/administration/database/sql-queries`
  - SQL Workbench — `/administration/database/workbench`
  - SQL Functions — `/administration/database/sql-functions`
  - Database Enums — `/administration/database/enums`
  - Schema Manager — `/legacy/administration/schema-manager`
- **Relationships & Access Graph**
  - Relationships Hub — `/administration/relationships`
  - Association Rules — `/administration/relationships/rules`
  - Entity Types — `/administration/relationships/entity-types`
  - Entity Explorer — `/administration/relationships/explorer`
  - Reachability Inspector — `/administration/relationships/reachability`
  - Sharing Registry & Link Policy — `/administration/relationships/sharing`
- **Canonicalization**
  - Canonicalization Toolkit — `/administration/canonicalization`
  - Summary — `/administration/canonicalization/summary`
  - Findings — `/administration/canonicalization/findings`
  - Broken Functions — `/administration/canonicalization/broken-functions`
  - Candidates — `/administration/canonicalization/candidates`
  - Function Dependencies — `/administration/canonicalization/function-deps`
  - Table Impact — `/administration/canonicalization/table-impact`
  - Verify — `/administration/canonicalization/verify`
- **Schema Visualization**
  - Schema Visualizer — `/administration/schema-visualizer`
  - Enhanced Schema Visualizer — `/administration/schema-visualizer-enhanced`
- **Integrity**
  - Data Integrity — `/administration/data-integrity`

### UI

- **Surfaces**
  - UI Surfaces — `/administration/surfaces`
  - Manifest Drift & Sync — `/administration/surfaces?drift=1`
- **Component Lab**
  - Official Components — `/administration/official-components`
  - Toggle Menu Demo — `/administration/official-components/to-be-added/toggle-menu-demo`
  - Toggle Menu — With Categories — `/administration/official-components/to-be-added/toggle-menu-demo/toggle-with-categories`
- **Experiments**
  - Experimental Routes — `/administration/experimental-routes`
- **Windowing**
  - Window Persistence Tester — `/administration/persistence-test`

### Automation

- **Scheduling**
  - Scheduling Overview — `/administration/scheduling`
  - Scheduled Tasks — `/administration/scheduling/tasks`
  - Run History — `/administration/scheduling/runs`
  - Orphan Leases — `/administration/scheduling/orphan-leases`
  - Cron Tester — `/administration/scheduling/cron-tester`
  - Scanner Health — `/administration/scheduling/scanner-health`
  - Schedule Templates — `/administration/scheduling/templates`

### Applications

- **Shipped Clients**
  - Applications Overview — `/administration/applications`
  - Application Configuration — `/administration/applications/configuration`
  - Application Catalogs — `/administration/applications/catalogs`
  - Installations — `/administration/applications/installations`
  - Application History — `/administration/applications/history`

### Users

- **Accounts & Access**
  - Users & Access Hub — `/administration/users`
  - Preferences Drift — `/administration/users/preferences`
  - Admins & Levels — `/administration/users/admins`
  - Invitations — `/administration/users/invitations`
  - Entitlements & Usage — `/administration/users/entitlements`
  - Usage & Cost — `/administration/users/usage`
- **Communications**
  - Email Users — `/administration/users/email`
  - Announcements — `/administration/users/announcements`
  - Feedback Management — `/administration/feedback`

### Compute

- **Sandbox & Infrastructure**
  - Sandbox Infrastructure — `/administration/sandbox-infra`
  - Sandbox Management — `/administration/sandbox`
  - Server Logs — `/administration/server-logs`
  - Resilience Lab — `/administration/resilience-lab`

### Utilities

- **Content & Rendering**
  - Content Blocks — `/administration/content-blocks`
  - Content Templates — `/administration/content-templates`
  - Markdown Content Tester — `/administration/markdown-tester`
  - Kind Registry — `/administration/kind-registry`
- **Files & Browser Storage**
  - Local Storage Admin — `/administration/local-storage`
  - Blob Cache Observability — `/administration/blob-cache`
- **Developer Utilities**
  - All Administration Routes — `/administration/all-routes`
  - Server Cache — `/administration/server-cache`
  - TypeScript Error Analyzer — `/administration/typescript-errors`
  - Utilities Hub — `/administration/utils`
  - Text Cleaner — `/administration/utils/text-cleaner`

### Documentation

- **Feature Documentation**
  - Feature Docs Hub — `/administration/feature-docs`
  - Feature Docs — Codebase Sync — `/administration/feature-docs/codebase`
  - Feature Docs — Docs Browser — `/administration/feature-docs/docs`
  - Feature Docs — Dot Directories — `/administration/feature-docs/dotdirs`

### Reporting

- **Platform Reporting**
  - Reports Hub — `/administration/reports`
  - Activity Events — `/administration/events`

## What the Knowledge domain actually contains

The repository describes Knowledge as one end-to-end system, not just the
knowledge graph:

```text
Acquire → Convert → Clean → Enrich → Store → Retrieve → Publish
```

- **Acquire and convert:** files, PDFs, transcripts, scraping, repositories.
- **Structure and enrich:** page extraction, cleaning, segmenting, embeddings,
  NER, knowledge assets, lineage, and trust metadata.
- **Store and retrieve:** RAG library, data stores, search, citations, and the
  knowledge graph.
- **Synthesize:** Research turns sources into analysis, synthesis, documents,
  and downstream outputs.
- **Publish:** CMS and Podcasts turn knowledge into durable user-facing media.

This explains why CMS, Podcasts, Research, RAG, and the Knowledge Graph belong
together while Agents, Chat, and Scopes & Context remain separate top-level
domains.

RAG belongs conceptually inside Knowledge, but it is not rendered in this tree
because no administration destination currently exists for it. The registry
never creates placeholder links.

## Implemented system

`features/admin/constants/admin-navigation.ts` is the single hierarchy. The
same object drives the dashboard, injected desktop/mobile admin menu, footer
flyout, header tree, route directory, search labels, and route audit. Existing
destination URLs did not change.

Search should continue to return final destinations directly while showing the
full breadcrumb, for example:

```text
Agents → System Agents → Agents Lineage
Knowledge → Podcasts → Podcast Manager
Chat → CX Conversations → Errors & Issues
```

Every filesystem page under `app/(admin)/administration` is declared exactly as
a visible destination or as an owned detail route. `release.sh` runs the audit
advisorially: a missing or stale declaration produces a loud red report but
never blocks the release.
