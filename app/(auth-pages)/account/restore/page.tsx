import AuthPageContainer from "@/components/auth/auth-page-container";
import { RestoreAccountForm } from "./RestoreAccountForm";

export default async function RestoreAccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestId = typeof params.request === "string" ? params.request : "";
  const userId = typeof params.user === "string" ? params.user : "";
  const token = typeof params.token === "string" ? params.token : "";
  const valid = Boolean(requestId && userId && token);
  return <AuthPageContainer title="Restore account" subtitle="Confirm restoration to sign in again.">{valid ? <RestoreAccountForm userId={userId} requestId={requestId} token={token} /> : <p className="text-sm text-destructive">This recovery link is incomplete.</p>}</AuthPageContainer>;
}
