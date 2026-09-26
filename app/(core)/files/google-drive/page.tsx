import { redirect } from "next/navigation";
import { GoogleDriveLibrary } from "@/features/files/google-drive/GoogleDriveLibrary";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

/** Restricted whole-Drive metadata review lives inside the authenticated Files area. */
export default async function GoogleDriveFilesPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/files");
  return <GoogleDriveLibrary />;
}
