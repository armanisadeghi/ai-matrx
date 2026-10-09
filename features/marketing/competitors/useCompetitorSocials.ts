"use client";

/**
 * Find-their-socials and Track for a brand competitor row — shared by the table's row actions,
 * the bulk action and the detail panel. The found handles live in the query cache (one entry per
 * row) so every surface shows the same state, including a panel that was opened mid-search.
 * Nothing is saved by finding; Track writes through the existing intake door.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppDispatch } from "@/lib/redux/hooks";

import {
  findSocialsOnWebsite,
  WebsiteUnreadableError,
  linkAccountToWebsiteCompetitor,
  trackSocialAccount,
  type BrandCompetitor,
} from "./brand-competitors";
import { platformLabel, untrackedLinks } from "./competitor-detail";
import type { FoundSocialLink } from "./social-links";

export interface FoundSocials {
  status: "finding" | "found" | "tracking" | "error";
  links: FoundSocialLink[];
  /** A plain sentence for the person: nothing found, the site could not be read, a handle refused. */
  message: string | null;
  /** The website could not be read: the detail panel then leads with the handle form. */
  unreadable?: boolean;
}

export interface BrandRef {
  id: string;
  organizationId: string;
}

export const foundKey = (brandId: string, rowKey: string) =>
  ["marketing", "brand", brandId, "competitor-found", rowKey] as const;
export const directoryKey = (brandId: string) => ["marketing", "brand", brandId, "competitor-directory"] as const;

export function useFoundSocials(brandId: string, rowKey: string): FoundSocials | null {
  const q = useQuery<FoundSocials | null>({
    queryKey: foundKey(brandId, rowKey),
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data ?? null;
}

export function useCompetitorSocialActions(brand: BrandRef) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const put = useCallback(
    (rowKey: string, value: FoundSocials) => queryClient.setQueryData(foundKey(brand.id, rowKey), value),
    [queryClient, brand.id],
  );

  const find = useCallback(
    async (row: BrandCompetitor): Promise<FoundSocials> => {
      if (!row.domain) {
        const none: FoundSocials = { status: "error", links: [], message: "This competitor has no website to read." };
        put(row.key, none);
        return none;
      }
      put(row.key, { status: "finding", links: [], message: null });
      let result: FoundSocials;
      try {
        const links = untrackedLinks(row, await findSocialsOnWebsite(row.domain, dispatch));
        result = {
          status: "found",
          links,
          message: links.length === 0 ? "No new social links on their website." : null,
        };
      } catch (e) {
        const unreadable = e instanceof WebsiteUnreadableError;
        result = {
          status: "error",
          links: [],
          message: e instanceof Error ? e.message : "Couldn't read that website",
          ...(unreadable ? { unreadable: true } : {}),
        };
      }
      put(row.key, result);
      return result;
    },
    [dispatch, put],
  );

  /** Track the given handles for a row; failed ones stay listed with the reason. */
  const track = useCallback(
    async (row: BrandCompetitor, links: readonly FoundSocialLink[]): Promise<{ tracked: number; failed: number }> => {
      const current = queryClient.getQueryData<FoundSocials | null>(foundKey(brand.id, row.key));
      put(row.key, { status: "tracking", links: [...(current?.links ?? links)], message: null });
      const failures: { link: FoundSocialLink; message: string }[] = [];
      let tracked = 0;
      await Promise.all(
        links.map(async (link) => {
          const result = await trackSocialAccount(
            { platform: link.platform, handle_or_url: link.url, role: "competitor", brand_id: brand.id, label: row.name },
            brand.organizationId,
          );
          if (!result.ok) {
            failures.push({
              link,
              message: result.unavailable ? "the social intake service is not reachable" : (result.message ?? "rejected"),
            });
            return;
          }
          tracked += 1;
          if (row.seoCompetitorId && result.trackedAccountId) {
            try {
              await linkAccountToWebsiteCompetitor(result.trackedAccountId, row.seoCompetitorId, brand.organizationId);
            } catch {
              // Tracked fine; the row still groups by name. The link is a convenience.
            }
          }
        }),
      );
      const remaining = (current?.links ?? links).filter((l) => failures.some((f) => f.link.url === l.url));
      put(row.key, {
        status: "found",
        links: remaining,
        message: failures.length
          ? failures.map((f) => `${platformLabel(f.link.platform)} was not saved — ${f.message}`).join(". ")
          : null,
      });
      await queryClient.invalidateQueries({ queryKey: directoryKey(brand.id) });
      return { tracked, failed: failures.length };
    },
    [queryClient, brand.id, brand.organizationId, put],
  );

  return { find, track };
}
