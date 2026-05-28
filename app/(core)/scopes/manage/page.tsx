import { redirect } from "next/navigation";

export const metadata = {
  title: "Scopes",
  description: "Redirect to the scopes hub.",
};

// Legacy route. The dedicated per-org page is /organizations/[orgId]/scopes,
// and the global hub lives at /scopes. Keep this URL alive as a redirect so
// old links don't 404.
export default function ScopesManageRedirectPage() {
  redirect("/scopes");
}
