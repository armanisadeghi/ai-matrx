/**
 * Surface manifest — Study guides (`matrx-user/education-learn`).
 *
 * The PUBLIC READER half of the `/education/learn` prefix: the anonymous,
 * server-rendered study-guide library index (`/education/learn`) and article
 * pages (`/education/learn/[...slug]`), both 100% SSR/ISR marketing/reader
 * content over `education.learn_doc` rows with `visibility='public'`. NOT the
 * authoring surface — see `education-learn-authoring.manifest.ts`, whose
 * header documents this exact split and explicitly left this half as future
 * work ("authoring it is real work, and honestly a separate job").
 *
 * WHY THIS MANIFEST EXISTS AT ALL. `route-to-surface.ts` maps the whole
 * `/education/learn` prefix to `matrx-user/education-learn`, and `ui.ui_surface`
 * already carries an ACTIVE row for it — but until now that name resolved to
 * nothing: no manifest, no emitter, not even a mount point. THE COMPLETENESS
 * LAW still applies to a server-rendered page: `EducationLearnPage` and
 * `LearnArticlePage` genuinely load doc data (the published list; one
 * published doc's full content), so that data is declared here even though it
 * can't be emitted at runtime yet — see the readiness note.
 *
 * WHY THERE IS NO EMITTER (readiness stays `stub`, not `partial`). Every
 * component in this path — `app/(core)/education/learn/page.tsx`,
 * `.../learn/[...slug]/page.tsx`, and `features/education/components/
 * LearnArticle.tsx` — is a Server Component with zero client-side state.
 * `SurfaceRuntimeProvider` requires a client mount point to expose a live
 * `getScope()` to the Agents chrome; wrapping this path would mean either
 * converting genuinely-static SEO content to a client component (a real
 * regression: these pages are ISR-cached and 100% server-rendered on purpose,
 * for SEO) or bolting on a thin client shell purely to host the provider. That
 * is a real decision, not a "forgot the emitter" gap, so it is left to a
 * follow-up rather than done here. If/when it lands, it most likely wants a
 * thin client wrapper around `<LearnArticle>` (a stable, cheap place to mount
 * `getScope` without touching the SSR body) — same shape as the pattern
 * `marketing-page.manifest.ts` documents for a server-rendered page with a
 * live runtime.
 *
 * Curated groups (band 0-899):
 *
 *   reader_view    Which of the two reader pages the visitor is on
 *   guide_library   The index's published guide list
 *   guide_article   The open article's full content
 */

import type {
  SurfaceManifest,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "reader_view",
    label: "Reader view",
    sortOrder: 100,
    description:
      "Which of the two public study-guide pages the visitor is on — the index or one open article.",
  },
  {
    key: "guide_library",
    label: "Guide library",
    sortOrder: 200,
    description:
      "The index page's list of every published study guide (/education/learn).",
  },
  {
    key: "guide_article",
    label: "Open guide",
    sortOrder: 300,
    description:
      "The full content of the one published study guide open on the article page (/education/learn/[...slug]).",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Reader view ────────────────────────────────────────────────────────
  {
    name: "view",
    label: "Current view",
    description:
      'Which public reader page is open: "index" (the study-guide library at /education/learn) or "article" (one open guide at /education/learn/[...slug]). Declared for completeness; NOT currently emitted at runtime — see the manifest header.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 300,
    group: "reader_view",
  },

  // ── Guide library (index) ──────────────────────────────────────────────
  {
    name: "guide_count",
    label: "Published guide count",
    description:
      "How many study guides are published and listed on the index. Zero is possible before the first guide ships. Only meaningful on the index view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 300,
    group: "guide_library",
  },
  {
    name: "guide_library",
    label: "Guide library",
    description:
      "Every published study guide listed on the index, as { title, summary, href }, in the order the index server-computes them. Only meaningful on the index view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 310,
    group: "guide_library",
  },

  // ── Open guide (article) ───────────────────────────────────────────────
  {
    name: "article_slug",
    label: "Guide slug",
    description:
      "URL path of the open guide under /education/learn (may contain '/' for hierarchy, e.g. 'biology/cell-structure'). Only meaningful on the article view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 300,
    group: "guide_article",
  },
  {
    name: "article_title",
    label: "Guide title",
    description:
      "Headline of the open guide, rendered as the page's <h1>. Only meaningful on the article view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
    group: "guide_article",
  },
  {
    name: "article_summary",
    label: "Guide summary",
    description:
      "Short summary of the open guide, shown as the hero lede and used verbatim as the meta description. Only meaningful on the article view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 320,
    group: "guide_article",
  },
  {
    name: "article_subject",
    label: "Guide subject",
    description:
      "The subject slug the open guide belongs to (e.g. 'biology'), when set. Absent for a guide with no subject assigned.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 330,
    group: "guide_article",
  },
  {
    name: "article_keywords",
    label: "Guide keywords",
    description:
      "SEO keywords stored on the open guide. Empty array when none were set.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 340,
    group: "guide_article",
  },
  {
    name: "article_updated",
    label: "Guide updated",
    description:
      "The author-controlled content date shown to readers as 'Updated', in YYYY-MM-DD form.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 350,
    group: "guide_article",
  },
  {
    name: "article_sections",
    label: "Guide body",
    description:
      "The open guide's article body — the full parsed EduSection[] the page renders (prose, feature-grid, steps, status-cards, stat-bar, faq, cta blocks). The whole content a visitor is reading. Large; bindable-only.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 360,
    group: "guide_article",
  },
  {
    name: "article_related",
    label: "Related links",
    description:
      "The open guide's conversion cross-links — { tools?, subjects?, exams? } slug arrays — deciding which app tools and hub pages the page funnels the reader into.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 370,
    group: "guide_article",
  },
];

export const educationLearnManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-learn",
  readiness: "stub",
  readinessNote:
    "Manifest-only, never audited against a live runtime: the vocabulary is declared from a code read of EducationLearnPage / LearnArticlePage / LearnArticle.tsx (all Server Components), but NO SurfaceRuntimeProvider is mounted anywhere in this path and none can be without either converting genuinely-static SEO content to a client component or adding a thin client shell purely to host the provider — see the manifest header for the real decision this needs. DB sync has not been run. No write targets (this is a public reader page, nothing is authored here — authoring lives on matrx-user/education-learn-authoring). No agent roles, no Locate anchors, no live-agent verification.",
  label: "Study guides",
  urlPattern: "/education/learn",
  intro: `<surface_intro>
You are on the PUBLIC study-guide reader at /education/learn — free, SEO-facing explainer articles, anonymous and server-rendered. This is not the authoring surface (that is a separate super-admin surface) and not a study session; it is what any visitor, signed in or not, reads.
On the index (\`view: "index"\`) \`guide_library\` lists every published guide. On an article (\`view: "article"\`) \`article_sections\` is the full body the reader is looking at, with \`article_title\`/\`article_summary\` as the header and \`article_related\` naming which app tools and hubs the page funnels toward.
This surface currently emits NOTHING at runtime — see readinessNote. Treat any value here as declared vocabulary for future binding, not as live data you can rely on today.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};
