/**
 * THE BRAND ↔ CHANNEL BINDING IS THE SITE BINDING'S SHAPE, AND THE MISSING
 * COLUMN IS ITS OWN ANSWER.
 *
 * Two things are proven here, and they are the two ways this could have gone
 * wrong:
 *
 *   1. A SECOND SHAPE. The Google Analytics 4 property binding already lives on
 *      `web.site.integrations` as
 *      `marketing.providers.<key>.{enabled,credential_authority,credential_ref,resource_ref}`,
 *      parsed by ONE module. A brand binding invented beside it — a `settings`
 *      key, its own table, its own parser — is two answers to one question,
 *      and the two drift the first time either is edited. So the brand's
 *      binding goes through the SAME parser and the SAME writer, and a
 *      round trip proves the document is byte-for-byte the shape the site
 *      already carries.
 *   2. A MISSING COLUMN READ AS "NOT BOUND". `web.brand.integrations` is
 *      applied by the chair, so between this lane and that moment PostgREST
 *      answers `42703`. Turning that into `unbound` would tell a person their
 *      brand has no channel when the truth is that the platform cannot hold
 *      one yet — and the bind control would write into a column that is not
 *      there.
 */

import {
  buildSiteIntegrations,
  buildSiteIntegrationsWithProviderChange,
  isYouTubeChannelId,
  parseSiteIntegrations,
  validateSiteIntegrations,
} from "@/features/marketing/data/integrations-schema";

const CONNECTION_ID = "11111111-2222-4333-8444-555555555555";
const CHANNEL_ID = "UC_x5XG1OV2P6uZZ5FSM9Ttw";

describe("the document shape", () => {
  it("is the provider envelope the site already uses, under its own key", () => {
    const draft = parseSiteIntegrations({});
    const document = buildSiteIntegrations({}, {
      ...draft,
      youtubeChannel: {
        enabled: true,
        credentialAuthority: "external_connection",
        credentialRef: CONNECTION_ID,
        resourceRef: CHANNEL_ID,
      },
    }) as unknown as {
      marketing: { providers: Record<string, Record<string, unknown>> };
    };
    expect(document.marketing.providers.youtube_channel).toEqual({
      enabled: true,
      credential_authority: "external_connection",
      credential_ref: CONNECTION_ID,
      resource_ref: CHANNEL_ID,
    });
    // The SAME four keys the GA4 property carries — one shape, not two.
    expect(Object.keys(document.marketing.providers.youtube_channel).sort()).toEqual(
      Object.keys(document.marketing.providers.google_analytics_4).sort(),
    );
  });

  it("round-trips through the one parser", () => {
    const draft = parseSiteIntegrations({});
    const next = {
      ...draft,
      youtubeChannel: {
        enabled: true,
        credentialAuthority: "external_connection" as const,
        credentialRef: CONNECTION_ID,
        resourceRef: CHANNEL_ID,
      },
    };
    const parsed = parseSiteIntegrations(buildSiteIntegrations({}, next));
    expect(parsed.youtubeChannel).toEqual(next.youtubeChannel);
  });

  it("rebases onto the latest document without touching a sibling provider", () => {
    const withGsc = buildSiteIntegrations({}, {
      ...parseSiteIntegrations({}),
      googleSearchConsole: {
        enabled: true,
        credentialAuthority: "external_connection",
        credentialRef: CONNECTION_ID,
        resourceRef: "sc-domain:example.com",
      },
    });
    const bound = buildSiteIntegrationsWithProviderChange(
      withGsc,
      "youtubeChannel",
      parseSiteIntegrations(withGsc).youtubeChannel,
      {
        enabled: true,
        credentialAuthority: "external_connection",
        credentialRef: CONNECTION_ID,
        resourceRef: CHANNEL_ID,
      },
    );
    const parsed = parseSiteIntegrations(bound);
    expect(parsed.youtubeChannel.resourceRef).toBe(CHANNEL_ID);
    // The sibling survived.
    expect(parsed.googleSearchConsole.resourceRef).toBe("sc-domain:example.com");
  });
});

describe("what counts as a channel", () => {
  it("accepts the id Google's own discovery stores", () => {
    expect(isYouTubeChannelId(CHANNEL_ID)).toBe(true);
  });

  it("refuses a handle, a URL and a video id — each of which the refresh would reject", () => {
    for (const bad of [
      "@aimatrx",
      "https://www.youtube.com/@aimatrx",
      "dQw4w9WgXcQ",
      "UCtooshort",
    ]) {
      expect(isYouTubeChannelId(bad)).toBe(false);
    }
  });

  it("is refused by name in the validator, with what a channel id looks like", () => {
    const issues = validateSiteIntegrations({
      ...parseSiteIntegrations({}),
      youtubeChannel: {
        enabled: true,
        credentialAuthority: "external_connection",
        credentialRef: CONNECTION_ID,
        resourceRef: "@aimatrx",
      },
    });
    const issue = issues.find((row) => row.field === "youtubeChannel.resourceRef");
    expect(issue).toBeTruthy();
    expect(issue!.message).toContain("UC");
  });

  it("refuses an enabled binding with no channel at all", () => {
    const issues = validateSiteIntegrations({
      ...parseSiteIntegrations({}),
      youtubeChannel: {
        enabled: true,
        credentialAuthority: "external_connection",
        credentialRef: CONNECTION_ID,
        resourceRef: "",
      },
    });
    expect(
      issues.some((row) => row.field === "youtubeChannel.resourceRef"),
    ).toBe(true);
  });
});
