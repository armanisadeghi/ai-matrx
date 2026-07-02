// File: utils/userDataMapper.ts
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { AdminLevel } from "@/utils/supabase/userSessionData";

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
  user: SupabaseUser | null | undefined,
  accessToken?: string | null,
  isAdmin?: boolean,
  adminLevel?: AdminLevel | null,
): UserData {
  const userId = user?.id || null;
  return {
    id: userId,
    email: user?.email || null,
    phone: user?.phone || null,
    emailConfirmedAt: user?.email_confirmed_at || null,
    lastSignInAt: user?.last_sign_in_at || null,
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
      user?.identities?.map((identity) => ({
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
