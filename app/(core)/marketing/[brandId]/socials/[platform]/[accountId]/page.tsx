import { AccountDetail } from "@/features/marketing/social/components/AccountDetail";

/** `[accountId]` is the shared profile id (`social.social_profile.id`). */
export default async function BrandSocialAccountPage({
  params,
}: {
  params: Promise<{ platform: string; accountId: string }>;
}) {
  const { platform, accountId } = await params;
  return <AccountDetail platform={platform} profileId={accountId} />;
}
