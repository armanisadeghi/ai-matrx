/**
 * Source Onboarding — the reusable provider-gallery + hand-holding-guide
 * pattern (HOUSE DOCTRINE for external-source onboarding, Arman 2026-08-17).
 *
 * A GALLERY is a config: big recognizable provider cards, each opening a
 * dedicated guide page that teaches a non-technical Expert exactly how to get
 * their data out of that provider. Future galleries (meeting platforms —
 * Google Meet/Teams/Zoom; message threads — iCloud/Google/WhatsApp) are a new
 * `SourceGalleryConfig` + provider configs, ZERO new components.
 *
 * See FEATURE.md in this directory for the contract.
 */

export type ProviderCategory = "cloud" | "coding" | "platform" | "other";

export type ProviderSupport =
    /** We parse this provider's export format properly. */
    | "supported"
    /** Undocumented/unstable format — tolerant parser, honest guide. */
    | "tolerant"
    /** Registered and visible, not yet available (e.g. matrx-local sync). */
    | "coming_soon";

export interface GuideDeepLink {
    /** Button label, in the Expert's language ("Open your ChatGPT settings"). */
    label: string;
    url: string;
    /** Honest caveat when the link only gets them CLOSE ("you still need two clicks"). */
    note?: string;
}

/**
 * A named slot where a real screenshot will land. Until the image exists at
 * `/images/source-onboarding/{providerKey}/{slot}.png` (captured by a Codex
 * agent following SCREENSHOT_WORK_ORDERS.md), the component renders a clean
 * placeholder naming the slot.
 */
export interface ScreenshotSlotSpec {
    /** kebab-case slot id — also the image basename. */
    slot: string;
    /** What the screenshot must show (alt text + the Codex capture brief). */
    caption: string;
}

export interface GuideStep {
    title: string;
    /** Plain-language instructions. Short sentences. No jargon. */
    body: string;
    deepLink?: GuideDeepLink;
    screenshot?: ScreenshotSlotSpec;
    /** A trap the user WILL hit if unwarned (rendered as a loud callout). */
    warning?: string;
}

export interface SourceProviderConfig {
    /** Stable kebab-case key — route segment + screenshot dir. */
    key: string;
    name: string;
    category: ProviderCategory;
    support: ProviderSupport;
    /** One-line card subtitle, Expert language. */
    tagline: string;
    /** Card brand color (hex). Cards are colored blocks + wordmark — no remote logo assets. */
    brandColor: string;
    /** Text color on the brand block. Default white. */
    brandText?: string;
    /** Short mark rendered big on the card (usually 1-2 chars or a small word). */
    mark: string;
    /** What the user ends up holding ("a .zip containing conversations.json"). */
    whatYouGet: string;
    /** Honest delivery mechanics: how it arrives, how long, when the link dies. */
    delivery?: { mechanism: string; timing: string; expiry?: string };
    steps: GuideStep[];
    /** Gotchas that do not belong to one step. */
    gotchas?: string[];
    /** File extensions/names our intake accepts from this provider. */
    accepts?: string[];
    /** Rendered when support === "coming_soon". */
    comingSoonNote?: string;
}

export interface SourceGalleryConfig {
    /** Stable key — route segment + the family shown in copy. */
    key: string;
    title: string;
    /** Plain-language framing of why this corpus matters. */
    intro: string;
    providers: SourceProviderConfig[];
    /** Where the authed action lives ("Upload it to your Rulebook" CTA target). */
    ctaHref: string;
    ctaLabel: string;
}
