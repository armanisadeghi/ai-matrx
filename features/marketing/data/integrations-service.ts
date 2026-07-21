import { SITE_COLUMNS } from "@/features/marketing/data/service";
import {
  buildSiteIntegrationsWithProviderChange,
  type BuiltInProviderKey,
  type ProviderIntegrationDraft,
} from "@/features/marketing/data/integrations-schema";
import type { Json } from "@/types/database.types";
import type { MarketingSite } from "@/features/marketing/types";
import { createClient } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

export interface UpdateSiteIntegrationsInput {
  siteId: string;
  expectedVersion: number;
  integrations: Json;
}

export interface UpdateBuiltInProviderIntegrationInput {
  siteId: string;
  provider: BuiltInProviderKey;
  expected: ProviderIntegrationDraft;
  next: ProviderIntegrationDraft;
}

class SiteVersionConflictError extends Error {
  constructor() {
    super(
      "This site's integrations changed while you were editing. Reload and try again.",
    );
    this.name = "SiteVersionConflictError";
  }
}

export async function updateSiteIntegrations(
  input: UpdateSiteIntegrationsInput,
): Promise<MarketingSite> {
  const supabase = createClient();
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("site")
    .update({ integrations: input.integrations })
    .eq("id", input.siteId)
    .eq("version", input.expectedVersion)
    .is("deleted_at", null)
    .select(
      SITE_COLUMNS,
    )
    .maybeSingle();

  if (response.error) throw new Error(response.error.message);
  if (!response.data) {
    throw new SiteVersionConflictError();
  }
  return response.data;
}

async function getCurrentSite(siteId: string): Promise<MarketingSite> {
  const response = await (
    await authenticatedWebDb(createClient())
  )
    .from("site")
    .select(SITE_COLUMNS)
    .eq("id", siteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (response.error) throw new Error(response.error.message);
  if (!response.data) {
    throw new Error("This site was deleted or is no longer accessible.");
  }
  return response.data;
}

/**
 * Persist one built-in provider against the latest site version. A single
 * retry absorbs unrelated trigger-managed version bumps while the pure rebase
 * guard still rejects a concurrent change to this provider.
 */
export async function updateBuiltInProviderIntegration(
  input: UpdateBuiltInProviderIntegrationInput,
): Promise<MarketingSite> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await getCurrentSite(input.siteId);
    const integrations = buildSiteIntegrationsWithProviderChange(
      current.integrations,
      input.provider,
      input.expected,
      input.next,
    );
    try {
      return await updateSiteIntegrations({
        siteId: input.siteId,
        expectedVersion: current.version,
        integrations,
      });
    } catch (error) {
      if (!(error instanceof SiteVersionConflictError) || attempt === 1) {
        throw error;
      }
    }
  }
  throw new Error("Unreachable integration update state.");
}
