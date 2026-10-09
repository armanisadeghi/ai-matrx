"use client";

/**
 * The browser's ONE `@ai-matrx/data` connection: the app's existing supabase client behind the
 * generated doors (`lib/db/generated/*`, `pnpm db:generate`). Reads never use the active
 * organization; an entity insert through this Db with no organization bound is REFUSED by the
 * door (loud) — bind `organization` here before the first insert moves onto it.
 */
import { createDb } from "@ai-matrx/data/db";

import { supabase } from "@/utils/supabase/client";

export const browserDb = createDb({ client: supabase });
