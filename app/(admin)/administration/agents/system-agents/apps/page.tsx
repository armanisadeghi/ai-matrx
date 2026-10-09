import { redirect } from "next/navigation";

// The platform's own Applets are managed in ONE place: /administration/applets/all (Admin › Applets ›
// System Applets). This address stays so saved links land there.
export default function SystemAgentsAppsRedirect() {
  redirect("/administration/applets/all");
}
