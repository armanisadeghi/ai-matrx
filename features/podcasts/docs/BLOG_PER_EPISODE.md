# Blog Post per Episode — design

> **Status: PLANNED (Wave 4).** Schema + agent + public route to be built.

## The idea

Every podcast episode gets a companion **blog article** — a real, richly-written,
SEO-optimized post derived from the episode. This is **distinct from a transcript**:

- A **transcript** is the verbatim spoken dialogue.
- A **blog** is an *edited article*: proper prose, headings, pull-quotes,
  **backlinks**, cited **resources**, images, and added context that wasn't spoken.

We already generate the content (research + script); turning it into a blog is
near-free value and a major SEO/discovery multiplier — it'd be "stupid not to."

## Pieces

### 1. The agent (via the `.md → build_agents.py` system)
File `aidream/internal_agents/podcast_blog_writer.md` (see the agent template at
`internal_agents/TEMPLATE.md`), then `uv run python scripts/build_agents.py
podcast_blog_writer`. Inputs: episode transcript/script + show + episode metadata
(+ optional research sources for backlinks). Output: **markdown** article with
headings, intro/outro, internal + external links, and a resources section.

(Sibling agents from the same system: `podcast_show_notes_generator`, and — for the
live vision — `podcast_relevance_checker`.)

### 2. Storage — `pc_articles` (recommended) vs a column
Recommended: a standalone **`pc_articles`** table (a blog is its own publishable
entity, can be edited/regenerated independently, has its own slug + SEO):

```
pc_articles(
  id uuid pk, show_id uuid fk, episode_id uuid fk, user_id uuid,
  slug text unique, title text, content_markdown text,
  og_image_url text, canonical_url text,
  status text default 'draft',   -- draft | published
  created_at, updated_at
)
```
(Alternative: `pc_episodes.blog_markdown` — simpler but conflates entities.)

### 3. Public route + render (reuse RichDocument)
- `app/(core)/podcast/[slug]/blog/page.tsx` — server component resolves the
  article (reuse the slug-resolution pattern in `app/(core)/podcast/[slug]/page.tsx`),
  renders markdown via **`features/rich-document/`** (`<RichDocument>` /
  `MarkdownStream`), with full `generateMetadata` (`openGraph.type:'article'`,
  `publishedTime`, `author`, **canonical URL**, OG image) for SEO.
- Episode page gets a **"Read the blog post"** CTA (live when an article exists,
  Coming soon otherwise).

### Reuse map
- Markdown render + actions: `features/rich-document/**`.
- Markdown persistence patterns: `features/notes/service`.
- SEO/metadata + slug resolution: `app/(core)/podcast/[slug]/page.tsx`.
- Durable images inside the article: `<InlineMediaRef>` (`@/features/files`).
