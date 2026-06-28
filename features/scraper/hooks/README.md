# Scraper hooks

## `useScraperApi`

Primary hook for all scraper HTTP endpoints (Python backend, NDJSON streaming).

Location: `hooks/useScraperApi.ts`

Methods: `scrapeUrl`, `scrapeUrls`, `search`, `searchAndScrape`, `searchAndScrapeLimited`, `cancel`, `reset`.

Used by routes under `app/(transitional)/scraper/` and `parts/ScraperFloatingWorkspace.tsx`.

## `useScraperAgentAnalysis`

One-shot agent runs for full-scrape analysis tabs (Fact Checker, Keyword Analysis).

Wraps `useRunAgent` with streaming text state and abort-on-unmount. Agent and variable slot UUIDs live in `constants/analysis-agents.ts`.

See `features/agents/migration/MIGRATE-recipe-to-agent-execution.md` for the migration pattern.

## `useScraperKeywordSearchForm`

Form state for keyword search mode (`/scraper/search`).
