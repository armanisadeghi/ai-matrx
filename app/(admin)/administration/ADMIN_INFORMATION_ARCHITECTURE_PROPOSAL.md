# Administration Information Architecture Proposal

**Status:** Implemented from the shared registry.

## Goal

Maintain three semantic navigation layers:

```text
Top-level domain → focused section → destination
```

The URL contract uses the domain and destination layers:

```text
/administration/<domain>
/administration/<domain>/<destination>
```

Sections organize links visually but do not add empty routing steps. The top
level answers “what kind of system am I administering?”, the section
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
  - AI Model Registry — `/administration/ai/ai-models`
  - Data Audit — `/administration/ai/ai-models/audit`
  - Deprecated Models — `/administration/ai/ai-models/deprecated-audit`
  - Provider Model Sync — `/administration/ai/ai-models/provider-sync`
  - Providers — `/administration/ai/ai-models/providers`
  - Endpoints & APIs — `/administration/ai/ai-models/endpoints`
  - Offerings — `/administration/ai/ai-models/offerings`
  - Settings — `/administration/ai/ai-models/settings`
  - Aliases — `/administration/ai/ai-models/aliases`
- **Operations**
  - AI Tasks — `/administration/ai/ai-tasks`

### Agents

- **System Agents**
  - Agents Dashboard — `/administration/agents/system-agents`
  - Agents List — `/administration/agents/system-agents/agents`
  - Agents Shortcuts — `/administration/agents/system-agents/shortcuts`
  - Agents Categories — `/administration/agents/system-agents/categories`
  - Agents Content Blocks — `/administration/agents/system-agents/content-blocks`
  - Agents Apps — `/administration/agents/system-agents/apps`
  - Agents Lineage — `/administration/agents/system-agents/lineage`
  - New Agent — `/administration/agents/system-agents/agents/new`
  - New Agent Manual — `/administration/agents/system-agents/agents/new/manual`
  - New App — `/administration/agents/system-agents/apps/new`
  - All Shortcuts — `/administration/agents/system-agents/shortcuts/all`
- **Published Agent Apps**
  - Agent Apps Dashboard — `/administration/agents/agent-apps`
  - All Agent Apps — `/administration/agents/agent-apps/apps`
  - Agent App Categories — `/administration/agents/agent-apps/categories`
  - Agent App Executions — `/administration/agents/agent-apps/executions`
  - Agent App Analytics — `/administration/agents/agent-apps/analytics`
  - Agent App Rate Limits — `/administration/agents/agent-apps/rate-limits`
- **Skills**
  - Skills Registry — `/administration/agents/skills`
  - Categories — `/administration/agents/skills/categories`
  - Filesystem Ingest — `/administration/agents/skills/ingest`
- **Tools & MCP**
  - Action Catalog — `/administration/agents/relationships/actions`
  - Tool Definitions — `/administration/agents/mcp-tools`
  - MCP Servers — `/administration/agents/mcp-servers`
  - Bundles — `/administration/agents/bundles`
  - Tool Runtimes — `/administration/agents/executor-surfaces`
  - Lookups — `/administration/agents/lookups`
  - New Tool Definition — `/administration/agents/mcp-tools/new`
- **Health & Drift**
  - Agent Drift Report — `/administration/agents/reports/agent-drift`

### Chat

- **CX Conversations**
  - CX Dashboard — `/administration/chat/cx-dashboard`
  - Conversations — `/administration/chat/cx-dashboard/conversations`
  - User Requests — `/administration/chat/cx-dashboard/requests`
  - Usage & Cost Analytics — `/administration/chat/cx-dashboard/usage`
  - Errors & Issues — `/administration/chat/cx-dashboard/errors`

### Knowledge

- **Knowledge Graph**
  - KG Cost Dashboard — `/administration/knowledge/kg-cost`
  - KG Inspector — `/administration/knowledge/kg-inspector`
- **Research**
  - Research Admin — `/administration/knowledge/research-system`
- **Podcasts**
  - Podcasts Hub — `/administration/knowledge/podcasts`
  - Podcast Manager — `/administration/knowledge/podcasts/shows`
  - New Podcast Show — `/administration/knowledge/podcasts/shows/new`
- **CMS**
  - CMS Agent Activity — `/administration/knowledge/cms-agents`

### Scopes & Context

- **Context**
  - System Context — `/administration/scopes-context/system-context`
  - Context Inspector — `/administration/scopes-context/context-inspector`

### Database

- **Database Tools**
  - Database Tools Hub — `/administration/database`
  - Database Admin Dashboard — `/administration/database/database-admin`
  - SQL Editor — `/administration/database/sql-queries`
  - SQL Workbench — `/administration/database/workbench`
  - SQL Functions — `/administration/database/sql-functions`
  - Database Enums — `/administration/database/enums`
  - Schema Manager — `/legacy/administration/schema-manager`
- **Relationships & Access Graph**
  - Relationships Hub — `/administration/database/relationships`
  - Association Rules — `/administration/database/relationships/rules`
  - Entity Types — `/administration/database/relationships/entity-types`
  - Entity Explorer — `/administration/database/relationships/explorer`
  - Reachability Inspector — `/administration/database/relationships/reachability`
  - Sharing Registry & Link Policy — `/administration/database/relationships/sharing`
- **Canonicalization**
  - Canonicalization Toolkit — `/administration/database/canonicalization`
  - Summary — `/administration/database/canonicalization/summary`
  - Findings — `/administration/database/canonicalization/findings`
  - Broken Functions — `/administration/database/canonicalization/broken-functions`
  - Candidates — `/administration/database/canonicalization/candidates`
  - Function Dependencies — `/administration/database/canonicalization/function-deps`
  - Table Impact — `/administration/database/canonicalization/table-impact`
  - Verify — `/administration/database/canonicalization/verify`
- **Schema Visualization**
  - Schema Visualizer — `/administration/database/schema-visualizer`
  - Enhanced Schema Visualizer — `/administration/database/schema-visualizer-enhanced`
- **Integrity**
  - Data Integrity — `/administration/database/data-integrity`

### UI

- **Surfaces**
  - UI Surfaces — `/administration/ui/surfaces`
  - Manifest Drift & Sync — `/administration/ui/surfaces?drift=1`
- **Component Lab**
  - Official Components — `/administration/ui/official-components`
  - Toggle Menu Demo — `/administration/ui/official-components/to-be-added/toggle-menu-demo`
  - Toggle Menu — With Categories — `/administration/ui/official-components/to-be-added/toggle-menu-demo/toggle-with-categories`
- **Experiments**
  - Experimental Routes — `/administration/ui/experimental-routes`
- **Windowing**
  - Window Persistence Tester — `/administration/ui/persistence-test`

### Automation

- **Scheduling**
  - Scheduling Overview — `/administration/automation/scheduling`
  - Scheduled Tasks — `/administration/automation/scheduling/tasks`
  - Run History — `/administration/automation/scheduling/runs`
  - Orphan Leases — `/administration/automation/scheduling/orphan-leases`
  - Cron Tester — `/administration/automation/scheduling/cron-tester`
  - Scanner Health — `/administration/automation/scheduling/scanner-health`
  - Schedule Templates — `/administration/automation/scheduling/templates`

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
  - Feedback Management — `/administration/users/feedback`

### Compute

- **Sandbox & Infrastructure**
  - Sandbox Infrastructure — `/administration/compute/sandbox-infra`
  - Sandbox Management — `/administration/compute/sandbox`
  - Server Logs — `/administration/compute/server-logs`
  - Resilience Lab — `/administration/compute/resilience-lab`

### Utilities

- **Content & Rendering**
  - Content Blocks — `/administration/utilities/content-blocks`
  - Content Templates — `/administration/utilities/content-templates`
  - Markdown Content Tester — `/administration/utilities/markdown-tester`
  - Kind Registry — `/administration/utilities/kind-registry`
- **Files & Browser Storage**
  - Local Storage Admin — `/administration/utilities/local-storage`
  - Blob Cache Observability — `/administration/utilities/blob-cache`
- **Developer Utilities**
  - All Administration Routes — `/administration/utilities/all-routes`
  - Server Cache — `/administration/utilities/server-cache`
  - TypeScript Error Analyzer — `/administration/utilities/typescript-errors`
  - Utilities Hub — `/administration/utilities/utils`
  - Text Cleaner — `/administration/utilities/utils/text-cleaner`

### Documentation

- **Feature Documentation**
  - Feature Docs Hub — `/administration/documentation/feature-docs`
  - Feature Docs — Codebase Sync — `/administration/documentation/feature-docs/codebase`
  - Feature Docs — Docs Browser — `/administration/documentation/feature-docs/docs`
  - Feature Docs — Dot Directories — `/administration/documentation/feature-docs/dotdirs`

### Reporting

- **Platform Reporting**
  - Reports Hub — `/administration/reporting/reports`
  - Activity Events — `/administration/reporting/events`

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
flyout, header tree, route directory, search labels, and route audit. Every
domain has a static App Router page, and every destination is physically nested
below that domain. Legacy flat paths and the retired `?domain=` URLs redirect
to their canonical replacements.

The Administration dashboard renders compact direct links for every
destination. Domain pages provide focused views without becoming a mandatory
extra click.

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
