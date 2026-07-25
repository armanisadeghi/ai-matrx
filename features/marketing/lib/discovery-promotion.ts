import {
  PROPERTY_KIND_LABELS,
  isPropertyKind,
  type DiscoveredItem,
  type PropertyKind,
} from "@/features/marketing/types";

/** Resolve a social discovery into the canonical web.property taxonomy. */
export function inferDiscoveredPropertyType(
  item: Pick<DiscoveredItem, "guessed_kind" | "url">,
): PropertyKind {
  if (
    item.guessed_kind &&
    item.guessed_kind !== "website" &&
    isPropertyKind(item.guessed_kind)
  ) {
    return item.guessed_kind;
  }
  if (!item.url) return "other";
  try {
    const host = new URL(item.url).hostname.replace(/^www\./, "");
    if (host === "instagram.com") return "instagram";
    if (host === "facebook.com" || host === "fb.com") return "facebook";
    if (host === "x.com" || host === "twitter.com") return "x";
    if (host === "tiktok.com") return "tiktok";
    if (host === "youtube.com" || host === "youtu.be") return "youtube";
    if (host === "linkedin.com") return "linkedin";
    if (host === "pinterest.com" || host === "pin.it") return "pinterest";
  } catch {
    // Malformed URLs are still reviewable as a labeled Other property.
  }
  return "other";
}

export type SocialProfileDescriptor = {
  kind: PropertyKind;
  providerLabel: string;
  identity: string;
  profileType: string;
  hostname: string;
};

/** Derive the most useful verifiable profile identity available in a social URL. */
export function describeDiscoveredSocialProfile(
  item: Pick<DiscoveredItem, "guessed_kind" | "url">,
): SocialProfileDescriptor {
  const kind = inferDiscoveredPropertyType(item);
  const providerLabel = PROPERTY_KIND_LABELS[kind];
  if (!item.url) {
    return {
      kind,
      providerLabel,
      identity: providerLabel,
      profileType: "Profile",
      hostname: "",
    };
  }

  try {
    const parsed = new URL(item.url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    const segments = parsed.pathname.split("/").filter(Boolean);
    const first = segments[0] ?? "";
    const second = segments[1] ?? "";

    if (kind === "instagram") {
      return {
        kind,
        providerLabel,
        identity: first ? `@${first.replace(/^@/, "")}` : providerLabel,
        profileType: "Profile",
        hostname,
      };
    }
    if (kind === "facebook") {
      const identity =
        first === "profile.php"
          ? parsed.searchParams.get("id") || providerLabel
          : first || providerLabel;
      return {
        kind,
        providerLabel,
        identity,
        profileType: "Page or profile",
        hostname,
      };
    }
    if (kind === "x") {
      return {
        kind,
        providerLabel,
        identity: first ? `@${first.replace(/^@/, "")}` : providerLabel,
        profileType: "Profile",
        hostname,
      };
    }
    if (kind === "tiktok") {
      return {
        kind,
        providerLabel,
        identity: first ? `@${first.replace(/^@/, "")}` : providerLabel,
        profileType: "Profile",
        hostname,
      };
    }
    if (kind === "youtube") {
      if (hostname === "youtu.be") {
        return {
          kind,
          providerLabel,
          identity: first || providerLabel,
          profileType: "Video",
          hostname,
        };
      }
      if (first === "watch") {
        return {
          kind,
          providerLabel,
          identity: parsed.searchParams.get("v") || providerLabel,
          profileType: "Video",
          hostname,
        };
      }
      const isChannelRoute = ["channel", "c", "user"].includes(first);
      return {
        kind,
        providerLabel,
        identity: first.startsWith("@")
          ? first
          : isChannelRoute && second
            ? second
            : first || providerLabel,
        profileType: first === "channel" ? "Channel ID" : "Channel",
        hostname,
      };
    }
    if (kind === "linkedin") {
      const profileType =
        first === "company"
          ? "Company page"
          : first === "in"
            ? "Personal profile"
            : "Profile";
      return {
        kind,
        providerLabel,
        identity: second || first || providerLabel,
        profileType,
        hostname,
      };
    }
    if (kind === "pinterest") {
      return {
        kind,
        providerLabel,
        identity: first ? `@${first.replace(/^@/, "")}` : providerLabel,
        profileType: "Profile",
        hostname,
      };
    }

    return {
      kind,
      providerLabel,
      identity: first || hostname || providerLabel,
      profileType: "External profile",
      hostname,
    };
  } catch {
    return {
      kind,
      providerLabel,
      identity: item.url,
      profileType: "Profile URL needs review",
      hostname: "",
    };
  }
}
