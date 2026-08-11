/**
 * `seo_package` — the STREAMING bridge contract.
 *
 * This kind exists so the Research Outputs Studio's SEO generator renders LIVE
 * in the floating run window instead of behind a spinner. The behavior pinned
 * here:
 *
 *  1. MID-STREAM with NOTHING but the discriminator: serverData is defined
 *     (nulls + empty lists) — the component mounts immediately and never falls
 *     through to a JSON code block.
 *  2. MID-STREAM: the title lands long before the rest, which is the whole
 *     point of emitting it first — the character budget is checkable while the
 *     FAQ is still being written.
 *  3. MID-STREAM: `faq` is an array of the CHILD kind `faq_item`, so entries
 *     appear one at a time; a question whose answer has not arrived renders as
 *     a question with a null answer, never as a dropped row.
 *  4. `keywords` is a SCALAR array — it commits whole at `]` (kernel
 *     granularity, same as `page_brief.brief`).
 *  5. COMPLETE: every field maps, isComplete=true.
 *  6. `seoPackageDataFromValue` maps a PERSISTED payload identically, so a
 *     reloaded OutputAsset can never render differently from the live run.
 *  7. The markdown facet is human-readable prose, never a JSON dump of the
 *     whole payload, and keeps unknown keys under "Additional details".
 */

import { ParseSession } from "../session/parse-session";
import type { KindSchema } from "../core/kind-schema.types";
import type { SchemaResolver } from "../core/kind-parser";
import {
  SEO_PACKAGE_KIND_SCHEMAS,
  seoPackageDataFromValue,
  seoPackageMarkdownFromValue,
  seoPackageServerDataFromEnvelope,
} from "../kinds/seo-package";

const resolver: SchemaResolver = {
  get: (kind: string): KindSchema | undefined =>
    SEO_PACKAGE_KIND_SCHEMAS.find((schema) => schema.kind === kind),
  request: () => {},
};

const SEO_VALUE = {
  __kind: "seo_package",
  title: "Dental Implant Financing: What It Actually Costs Per Month",
  meta_description:
    "A plain-English breakdown of the three ways to finance dental implants, with real monthly numbers and what to bring to your first consultation.",
  slug: "dental-implant-financing-monthly-cost",
  primary_keyword: "dental implant financing",
  keywords: [
    "dental implant financing",
    "dental implant cost per month",
    "implant payment plans",
  ],
  faq: [
    {
      __kind: "faq_item",
      question: "Can I finance dental implants with bad credit?",
      answer:
        "Yes — in-house payment plans and third-party medical lenders both approve applicants outside prime credit, usually at a higher APR.",
    },
    {
      __kind: "faq_item",
      question: "Does insurance cover any of the implant cost?",
      answer:
        "Most plans cover the crown but not the post, which is why quotes vary so widely.",
    },
  ],
  schema_org: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
  },
  open_graph: {
    "og:title": "Dental Implant Financing: What It Actually Costs Per Month",
    "og:type": "article",
  },
};

const SEO_JSON = JSON.stringify(SEO_VALUE);

describe("seo_package — streaming bridge", () => {
  it("MID-STREAM: the bare discriminator already yields renderable data", () => {
    const session = new ParseSession({ identity: "seo-empty", schemas: resolver });
    session.write('{"__kind":"seo_package","title":');

    const serverData = seoPackageServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData).toBeDefined();
    expect(serverData?.isComplete).toBe(false);
    expect(serverData?.title).toBeNull();
    expect(serverData?.keywords).toEqual([]);
    expect(serverData?.faq).toEqual([]);
    expect(serverData?.schemaOrg).toBeNull();
    session.dispose();
  });

  it("MID-STREAM: the title lands first, long before the rest", () => {
    const session = new ParseSession({ identity: "seo-title", schemas: resolver });
    const cut = SEO_JSON.indexOf(',"meta_description"');
    session.write(SEO_JSON.slice(0, cut));

    const serverData = seoPackageServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData?.title).toBe(SEO_VALUE.title);
    expect(serverData?.metaDescription).toBeNull();
    expect(serverData?.isComplete).toBe(false);
    session.dispose();
  });

  it("MID-STREAM: keywords commit whole at array close (scalar-array granularity)", () => {
    const session = new ParseSession({ identity: "seo-kw", schemas: resolver });
    // Cut just after the keywords array closes, before `faq` exists. Pins the
    // kernel rule: a string[] commits as ONE value at its `]` — only child-kind
    // arrays stream per element. If that changes, this is where you learn it.
    const cut = SEO_JSON.indexOf('],"faq"') + 1;
    session.write(SEO_JSON.slice(0, cut));

    const serverData = seoPackageServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData?.keywords).toEqual(SEO_VALUE.keywords);
    expect(serverData?.faq).toEqual([]);
    session.dispose();
  });

  it("MID-STREAM: FAQ entries appear one at a time; a question with no answer yet still renders", () => {
    const session = new ParseSession({ identity: "seo-faq", schemas: resolver });
    // Cut inside the FIRST faq_item, after its question closes but before the
    // answer's value arrives — the child-kind array streams per element.
    const cut = SEO_JSON.indexOf('","answer"', SEO_JSON.indexOf('"faq"')) + 10;
    session.write(SEO_JSON.slice(0, cut));

    const serverData = seoPackageServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData?.faq).toHaveLength(1);
    expect(serverData?.faq[0].question).toBe(SEO_VALUE.faq[0].question);
    expect(serverData?.faq[0].answer).toBeNull();
    session.dispose();
  });

  it("COMPLETE: every field maps, isComplete=true", () => {
    const session = new ParseSession({ identity: "seo-done", schemas: resolver });
    session.write(SEO_JSON);
    session.end();

    const serverData = seoPackageServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData).toMatchObject({
      title: SEO_VALUE.title,
      metaDescription: SEO_VALUE.meta_description,
      slug: SEO_VALUE.slug,
      primaryKeyword: SEO_VALUE.primary_keyword,
      isComplete: true,
    });
    expect(serverData?.keywords).toEqual(SEO_VALUE.keywords);
    expect(serverData?.faq).toEqual([
      { question: SEO_VALUE.faq[0].question, answer: SEO_VALUE.faq[0].answer },
      { question: SEO_VALUE.faq[1].question, answer: SEO_VALUE.faq[1].answer },
    ]);
    expect(serverData?.schemaOrg).toMatchObject({ "@type": "FAQPage" });
    expect(serverData?.openGraph).toMatchObject({ "og:type": "article" });
    session.dispose();
  });

  it("ignores a foreign root kind", () => {
    const session = new ParseSession({ identity: "seo-foreign", schemas: resolver });
    session.write('{"__kind":"task_list","tasks":[]}');
    session.end();
    expect(
      seoPackageServerDataFromEnvelope(session.buildEnvelope()),
    ).toBeUndefined();
    session.dispose();
  });
});

describe("seo_package — persisted payload maps identically", () => {
  it("a stored OutputAsset meta.seo payload produces the same serverData", () => {
    const session = new ParseSession({ identity: "seo-parity", schemas: resolver });
    session.write(SEO_JSON);
    session.end();
    const live = seoPackageServerDataFromEnvelope(session.buildEnvelope());
    session.dispose();

    // The persisted shape is the same snake_case payload, minus the streaming
    // status — which is exactly what the `true` argument supplies.
    const persisted = seoPackageDataFromValue(SEO_VALUE, true);
    expect(persisted).toEqual(live);
  });

  it("maps a pre-kind asset (no __kind key) without a shim", () => {
    const { __kind: _discard, ...legacy } = SEO_VALUE;
    const mapped = seoPackageDataFromValue(legacy, true);
    expect(mapped.title).toBe(SEO_VALUE.title);
    expect(mapped.keywords).toEqual(SEO_VALUE.keywords);
    expect(mapped.faq).toHaveLength(2);
  });
});

describe("seo_package — markdown facet", () => {
  it("renders prose sections and keeps unknown keys", () => {
    const markdown = seoPackageMarkdownFromValue({
      ...SEO_VALUE,
      reviewer_note: "verify the APR before publishing",
    });
    expect(markdown).toContain("# SEO package");
    expect(markdown).toContain(`**Title:** ${SEO_VALUE.title}`);
    expect(markdown).toContain(`**Slug:** ${SEO_VALUE.slug}`);
    expect(markdown).toContain("**Keywords:** dental implant financing,");
    expect(markdown).toContain("## FAQ");
    expect(markdown).toContain(SEO_VALUE.faq[0].question);
    expect(markdown).toContain("## schema.org");
    expect(markdown).toContain("## Open Graph");
    expect(markdown).toContain("Additional details");
    expect(markdown).toContain("verify the APR before publishing");
    expect(markdown).not.toContain("__kind");
  });
});
