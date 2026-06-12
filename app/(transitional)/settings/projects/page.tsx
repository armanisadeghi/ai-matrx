import { redirect } from "next/navigation";

// Superseded by the canonical /projects hub.
export default function SettingsProjectsRedirect() {
  redirect("/projects");
}
