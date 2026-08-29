// lib/supabase/authRetry.ts — the HOST WIRING for @ai-matrx/data's
// session-retry primitive. All behavior lives in the package
// (`createSessionRetry`); this module only binds it to THIS app's supabase-js
// client so call sites keep the established `runWithSessionRetry` name.
// The incident that forged it (2026-08-15 artifact-materialization loss) and
// the exactly-one-cause / exactly-once contract live in the package module's
// header.

import { createSessionRetry } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";

export {
  isMissingSessionError,
  SessionUnavailableError,
  type AuthRetryableResult,
} from "@ai-matrx/data/db";

export const runWithSessionRetry = createSessionRetry({
  auth: supabase.auth,
});
