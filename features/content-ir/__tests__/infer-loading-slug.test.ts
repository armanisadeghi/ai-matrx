/**
 * The DERIVED loading slug — the smart floor under the declared one.
 *
 * Context (2026-08-25): 354 of 357 renderable ACTIVE kinds declare no
 * `loading_component`, so the declared-only path sent nearly every kind to
 * the shapeless `generic` skeleton. Derivation reads the kind's SCHEMA and
 * picks the loader whose silhouette matches. Declaration always wins.
 */

import type { KindSchema } from "@ai-matrx/content-ir";
import {
  inferLoadingSlug,
  inferLoadingSlugFromJsonSchema,
} from "../react/loading/infer-loading-slug";
import { KIND_LOADING_SLUGS } from "../react/loading/kind-loading-slugs";
import { kindRegistry } from "../registry/kind-registry";

const schema = (fields: KindSchema["fields"]): KindSchema => ({
  kind: "t",
  fields,
});

describe("inferLoadingSlug", () => {
  it("only ever returns a slug the loading library actually has", () => {
    const cases: KindSchema[] = [
      schema({ article_body: { type: "string" } }),
      schema({ images: { type: "array", itemKinds: ["img"] } }),
      schema({ items: { type: "array", itemKinds: ["x"] } }),
      schema({ a: { type: "string" }, b: { type: "number" } }),
    ];
    for (const s of cases) {
      const slug = inferLoadingSlug(s);
      expect(slug).not.toBeNull();
      expect(KIND_LOADING_SLUGS).toContain(slug!);
    }
  });

  it("a prose body wins over its supporting lists — the newsjacking article case", () => {
    // The REAL shape the Kind Creator built on 2026-08-25, whose author
    // intended `document` but could not store it.
    const newsjacking = schema({
      headline: { type: "string", required: true },
      meta_title: { type: "string" },
      meta_description: { type: "string" },
      news_hook_summary: { type: "string" },
      article_body: { type: "string", required: true },
      target_keywords: { type: "string[]" },
      expert_quotes: { type: "array", itemKinds: ["newsjacking_article_expert_quote"] },
      research_sources: { type: "array", itemKinds: ["article_research_source"] },
      faqs: { type: "array", itemKinds: ["article_faq_item"] },
    });
    expect(inferLoadingSlug(newsjacking)).toBe("document");
  });

  it("a list of structured items reads as a list", () => {
    expect(
      inferLoadingSlug(
        schema({
          title: { type: "string" },
          questions: { type: "array", itemKinds: ["quiz_question"] },
        }),
      ),
    ).toBe("list");
  });

  it("media and gallery shapes beat everything else", () => {
    expect(
      inferLoadingSlug(schema({ title: { type: "string" }, video_url: { type: "string" } })),
    ).toBe("media");
    expect(
      inferLoadingSlug(
        schema({
          body: { type: "string" },
          gallery: { type: "array", itemKinds: ["img"] },
        }),
      ),
    ).toBe("gallery");
  });

  it("timeline / chart / progress / stat shapes are distinguished", () => {
    expect(
      inferLoadingSlug(schema({ events: { type: "array", itemKinds: ["e"] } })),
    ).toBe("timeline");
    expect(
      inferLoadingSlug(schema({ series: { type: "array", itemKinds: ["p"] } })),
    ).toBe("chart");
    expect(
      inferLoadingSlug(schema({ steps: { type: "array", itemKinds: ["s"] } })),
    ).toBe("progress");
    expect(
      inferLoadingSlug(schema({ stats: { type: "array", itemKinds: ["s"] } })),
    ).toBe("stat-grid");
  });

  it("a small all-scalar record reads as a card; nothing distinctive returns null", () => {
    expect(
      inferLoadingSlug(schema({ name: { type: "string" }, score: { type: "number" } })),
    ).toBe("card");
    expect(inferLoadingSlug(schema({}))).toBeNull();
    expect(inferLoadingSlug(undefined)).toBeNull();
    expect(inferLoadingSlug(null)).toBeNull();
  });

  it("non-object root kinds derive from the root field", () => {
    expect(
      inferLoadingSlug({ kind: "t", fields: {}, root: { type: "string" } }),
    ).toBe("document");
    expect(
      inferLoadingSlug({
        kind: "t",
        fields: {},
        root: { type: "array", itemKinds: ["x"] },
      }),
    ).toBe("list");
  });

  it("DECLARATION WINS — derivation is only the floor (the BlockRenderer rule)", () => {
    // quiz_set declares `quiz`; its schema would otherwise derive `list`.
    const def = kindRegistry.getDefinition("quiz_set");
    expect(def?.loadingComponent).toBe("quiz");
    expect(inferLoadingSlug(def?.schema)).toBe("list");
    // The resolution order BlockRenderer applies:
    const resolved = def?.loadingComponent ?? inferLoadingSlug(def?.schema) ?? null;
    expect(resolved).toBe("quiz");
  });

  it("derives from a raw JSON Schema too — the only shape most kinds carry", () => {
    // `data` is NULL for 344 of the 392 undeclared renderable kinds
    // (2026-08-25), so this door — not the KindSchema one — is what actually
    // covers the backlog. Shapes below are real live contracts.
    const seoAudit = {
      type: "object",
      properties: {
        __kind: { type: "string" },
        checked: { type: "boolean" },
        summary: { type: "string" },
        evidence: { type: "array", items: { type: "object" } },
        issues_found: { type: "array", items: { type: "object" } },
        recommendations: { type: "array", items: { type: "string" } },
      },
    };
    expect(inferLoadingSlugFromJsonSchema(seoAudit)).toBe("list");

    const markdownKind = {
      type: "object",
      properties: { __kind: { type: "string" }, text: { type: "string" } },
    };
    expect(inferLoadingSlugFromJsonSchema(markdownKind)).toBe("document");

    // A scalar list is NOT a structured array — chips say nothing about shape.
    const tagsOnly = {
      type: "object",
      properties: {
        name: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
    };
    expect(inferLoadingSlugFromJsonSchema(tagsOnly)).toBe("card");

    expect(inferLoadingSlugFromJsonSchema(null)).toBeNull();
    expect(inferLoadingSlugFromJsonSchema({ type: "object" })).toBeNull();
    expect(inferLoadingSlugFromJsonSchema("nonsense")).toBeNull();
  });

  it("every compiled kind either declares a slug or derives a usable one", () => {
    const undecided: string[] = [];
    for (const def of kindRegistry.listDefinitions()) {
      const resolved = def.loadingComponent ?? inferLoadingSlug(def.schema);
      if (resolved && !(KIND_LOADING_SLUGS as readonly string[]).includes(resolved)) {
        throw new Error(`kind "${def.kind}" resolved to unknown slug "${resolved}"`);
      }
      if (!resolved) undecided.push(def.kind);
    }
    // A kind with nothing distinctive legitimately falls to `generic`; this
    // assertion documents HOW MANY do, so a regression that widens the
    // shapeless set is visible rather than silent.
    expect(undecided.length).toBeLessThan(kindRegistry.listDefinitions().length / 2);
  });
});
