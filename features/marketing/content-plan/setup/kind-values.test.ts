/**
 * The kind-value builders — the persisted setup-pass proposals rebuilt as
 * canonical kind instances for KindInstanceRender (agent-manifest wave 2).
 * Guards the snake_case wire keys and the nested `__kind` tags the DB
 * components delegate on.
 */
import type {
  EntityAttachPlan,
  EntityCurationResult,
  KeywordStrategyResult,
  PlanReviewResult,
} from "./ai";
import {
  entityAttachPlanValue,
  entityRosterValue,
  keywordStrategyValue,
  planReviewValue,
} from "./kind-values";

describe("keywordStrategyValue", () => {
  const strategy: KeywordStrategyResult = {
    strategySummary: "Money pages take commercial primaries.",
    warnings: ["Watch cannibalization on /areas."],
    assignments: [
      {
        route: "/services/install",
        pageRole: "money",
        primaryKeyword: "water heater installation austin",
        primaryIsNew: false,
        secondaryKeywords: ["tankless install"],
        supportsRoutes: [],
        internalLinks: [
          { toRoute: "/guides/tankless-vs-tank", anchorText: "comparison" },
        ],
        desiredMetaTitle: "Install | Austin",
        desiredMetaDescription: "Licensed installers.",
        reason: "Highest-revenue service.",
      },
      {
        route: "/guides/tankless-vs-tank",
        pageRole: "supporting",
        primaryKeyword: null,
        primaryIsNew: true,
        secondaryKeywords: [],
        supportsRoutes: ["/services/install"],
        internalLinks: [],
        desiredMetaTitle: "",
        desiredMetaDescription: "",
        reason: "",
      },
    ],
  };

  it("emits the kind's wire shape with nested __kind tags", () => {
    expect(keywordStrategyValue(strategy)).toEqual({
      __kind: "plan_keyword_strategy",
      strategy_summary: "Money pages take commercial primaries.",
      warnings: ["Watch cannibalization on /areas."],
      assignments: [
        {
          __kind: "plan_keyword_assignment",
          route: "/services/install",
          page_role: "money",
          primary_keyword: "water heater installation austin",
          primary_is_new: false,
          secondary_keywords: ["tankless install"],
          supports_routes: [],
          internal_links: [
            {
              __kind: "plan_planned_link",
              to_route: "/guides/tankless-vs-tank",
              anchor_text: "comparison",
            },
          ],
          meta_title: "Install | Austin",
          meta_description: "Licensed installers.",
          reason: "Highest-revenue service.",
        },
        {
          __kind: "plan_keyword_assignment",
          route: "/guides/tankless-vs-tank",
          page_role: "supporting",
          primary_keyword: null,
          primary_is_new: true,
          secondary_keywords: [],
          supports_routes: ["/services/install"],
          internal_links: [],
          meta_title: "",
          meta_description: "",
          reason: "",
        },
      ],
    });
  });
});

describe("entityAttachPlanValue", () => {
  const plan: EntityAttachPlan = {
    attachments: [
      {
        route: "/treatments/acne",
        entityLabel: "Dr. Sarah Chen",
        role: "reviewed_by",
        reason: "Medical claims need a credentialed reviewer.",
      },
    ],
    missingEntities: [
      {
        suggestedLabel: "Clinical photography set",
        entityType: "media",
        whyNeeded: "No owned imagery in the roster.",
      },
    ],
    notes: "Blog family left unattached by design.",
  };

  it("emits attachments and missing_entities on the wire keys", () => {
    expect(entityAttachPlanValue(plan)).toEqual({
      __kind: "plan_entity_attachment_set",
      notes: "Blog family left unattached by design.",
      attachments: [
        {
          __kind: "plan_entity_attachment",
          route: "/treatments/acne",
          role: "reviewed_by",
          entity_label: "Dr. Sarah Chen",
          reason: "Medical claims need a credentialed reviewer.",
        },
      ],
      missing_entities: [
        {
          __kind: "plan_missing_entity",
          suggested_label: "Clinical photography set",
          entity_type: "media",
          why_needed: "No owned imagery in the roster.",
        },
      ],
    });
  });
});

describe("planReviewValue", () => {
  const review: PlanReviewResult = {
    summary: "Proof assets have no home.",
    findings: [
      {
        severity: "gap",
        title: "No reviews page",
        detail: "240 five-star reviews are uncited.",
        suggestedRoute: "/reviews",
        suggestedLabel: "Reviews and Results",
      },
      {
        severity: "priority",
        title: "Area pages outnumber demand",
        detail: "Volume supports four of six suburbs.",
        suggestedRoute: null,
        suggestedLabel: null,
      },
    ],
  };

  it("emits findings with nullable suggested route/label preserved", () => {
    expect(planReviewValue(review)).toEqual({
      __kind: "plan_review_findings",
      summary: "Proof assets have no home.",
      findings: [
        {
          __kind: "plan_review_finding",
          severity: "gap",
          title: "No reviews page",
          detail: "240 five-star reviews are uncited.",
          suggested_route: "/reviews",
          suggested_label: "Reviews and Results",
        },
        {
          __kind: "plan_review_finding",
          severity: "priority",
          title: "Area pages outnumber demand",
          detail: "Volume supports four of six suburbs.",
          suggested_route: null,
          suggested_label: null,
        },
      ],
    });
  });
});

describe("entityRosterValue", () => {
  const entities: EntityCurationResult["entities"] = [
    {
      label: "Dr. Sarah Chen",
      entityType: "person",
      description: "Board-certified dermatologist.",
      reason: "Named author of the treatment guides.",
    },
  ];

  it("emits the roster on the wire keys", () => {
    expect(entityRosterValue(entities, "No media assets named.")).toEqual({
      __kind: "plan_entity_roster",
      notes: "No media assets named.",
      entities: [
        {
          __kind: "plan_entity",
          label: "Dr. Sarah Chen",
          entity_type: "person",
          description: "Board-certified dermatologist.",
          reason: "Named author of the treatment guides.",
        },
      ],
    });
  });

  it("accepts the EntityManager's richer proposal rows structurally", () => {
    const proposals = [
      {
        label: "AAD",
        entityType: "org" as const,
        description: "",
        reason: "",
        selected: true,
        added: false,
        error: null,
      },
    ];
    const value = entityRosterValue(proposals, "");
    expect((value.entities as Array<Record<string, unknown>>)[0]).toEqual({
      __kind: "plan_entity",
      label: "AAD",
      entity_type: "org",
      description: "",
      reason: "",
    });
  });
});
