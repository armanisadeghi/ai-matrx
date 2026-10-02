import { redirect } from "next/navigation";

// lab.aimatrx.com/ → the lab index. Lab-profile only (see layout.labroot.tsx).
export default function LabRoot() {
  redirect("/lab");
}
