// File: utils/userDataMapper.ts
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { ApiClaimsUser } from "@/utils/supabase/claimsUser";
import type { AdminLevel } from "@/utils/supabase/userSessionData";

/**
 * What this mapper accepts: the auth server's full user RECORD (from the one
 * `fetchAuthUserRecord` door, in the browser, after hydration) OR the verified
 * access-token CLAIMS (from `getServerAuth()` on every page render). The
 * claims carry `id`, `email`, `phone`, `is_anonymous`, `app_metadata` and
 * `user_metadata`; the record adds `created_at`, `*_confirmed_at`,
 * `last_sign_in_at` and `identities`, which map to `null` until the browser
 * fills them in. A page render never waits on the auth server for them.
 */
export type MappableUser = SupabaseUser | ApiClaimsUser;

type RecordOnlyFields = Partial<
  Pick<SupabaseUser, "created_at" | "email_confirmed_at" | "last_sign_in_at" | "identities">
>;

export interface AppMetadata {
  provider: string | null;
  providers: string[];
}

export interface UserMetadata {
  avatarUrl: string | null;
  fullName: string | null;
  name: string | null;
  preferredUsername: string | null;
  picture: string | null;
}

export interface IdentityData {
  provider: string | null;
  id: string | null;
  user_id: string | null;
  avatar_url: string | null;
  email: string | null;
  email_verified: boolean | null;
  full_name: string | null;
  picture: string | null;
  provider_id: string | null;
  sub: string | null;
  name: string | null;
}

export interface UserData {
  id: string | null;
  createdAt: string | null;
  isAnonymous: boolean;
  email: string | null;
  phone: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  appMetadata: AppMetadata;
  userMetadata: UserMetadata;
  identities: IdentityData[];
  isAdmin: boolean;
  adminLevel: AdminLevel | null;
  accessToken: string | null;
  tokenExpiresAt: number | null;
}

/**
 * Map Supabase user data to application user data
 *
 * @param user - Supabase user object
 * @param accessToken - Optional access token
 * @param isAdmin - Optional admin status (if not provided, defaults to false)
 * @param adminLevel - Optional admin level (developer / senior_admin / super_admin), null if not an admin
 * @returns Mapped UserData object
 */
export function mapUserData(
  user: MappableUser | null | undefined,
  accessToken?: string | null,
  isAdmin?: boolean,
  adminLevel?: AdminLevel | null,
): UserData {
  const userId = user?.id || null;
  const record = (user ?? {}) as RecordOnlyFields;
  return {
    id: userId,
    createdAt: record.created_at || null,
    isAnonymous: user?.is_anonymous === true,
    email: user?.email || null,
    phone: user?.phone || null,
    emailConfirmedAt: record.email_confirmed_at || null,
    lastSignInAt: record.last_sign_in_at || null,
    appMetadata: {
      provider: user?.app_metadata?.provider || null,
      providers: user?.app_metadata?.providers || [],
    },
    userMetadata: {
      avatarUrl: user?.user_metadata?.avatar_url || null,
      fullName: user?.user_metadata?.full_name || null,
      name: user?.user_metadata?.name || null,
      preferredUsername: user?.user_metadata?.preferred_username || null,
      picture: user?.user_metadata?.picture || null,
    },
    identities:
      record.identities?.map((identity) => ({
        provider: identity?.provider || null,
        id: identity?.id || null,
        user_id: identity?.user_id || null,
        avatar_url: identity?.identity_data?.avatar_url || null,
        email: identity?.identity_data?.email || null,
        email_verified: identity?.identity_data?.email_verified || null,
        full_name: identity?.identity_data?.full_name || null,
        picture: identity?.identity_data?.picture || null,
        provider_id: identity?.identity_data?.provider_id || null,
        sub: identity?.identity_data?.sub || null,
        name: identity?.identity_data?.name || null,
      })) || [],
    isAdmin: isAdmin ?? false,
    adminLevel: adminLevel ?? null,
    accessToken: accessToken || null,
    tokenExpiresAt: null,
  };
}

// Phase 4: dead shadow selectors removed (selectUser, selectDisplayName,
// selectProfilePhoto, selectIsAdmin, selectAccessToken). Audit confirmed
// zero imports of these from `@/utils/userDataMapper`. The canonical
// versions live in `@/lib/redux/selectors/userSelectors.ts` and read
// from the post-split `userAuth` + `userProfile` slices.
