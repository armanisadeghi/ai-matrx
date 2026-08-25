import { z } from "zod";

export const UserSearchCandidateSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  phone: z.string().nullable(),
  adminLevel: z.string().nullable(),
  organizations: z.array(z.string()),
  source: z.string().nullable(),
  createdAt: z.string().nullable(),
  lastSignInAt: z.string().nullable(),
});

export type UserSearchCandidate = z.infer<typeof UserSearchCandidateSchema>;

export const UserSearchWindowDataSchema = z.object({
  callbackGroupId: z.string().min(1),
  title: z.string().min(1),
  initialQuery: z.string(),
  directory: z.enum(["admin", "provided"]),
  candidates: z.array(UserSearchCandidateSchema),
  excludeUserIds: z.array(z.string()),
});

export type UserSearchWindowData = z.infer<typeof UserSearchWindowDataSchema>;

const AdminUserSearchOrganizationSchema = z.object({
  name: z.string(),
});

export const AdminUserSearchResponseSchema = z.object({
  users: z.array(
    z.object({
      id: z.string().min(1),
      email: z.string().nullable(),
      display_name: z.string().nullable(),
      full_name: z.string().nullable(),
      avatar_url: z.string().nullable(),
      phone: z.string().nullable(),
      admin_level: z.string().nullable(),
      organizations: z.array(AdminUserSearchOrganizationSchema),
      created_at: z.string().nullable(),
      last_sign_in_at: z.string().nullable(),
    }),
  ),
});
