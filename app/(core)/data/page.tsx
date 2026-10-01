// app/(core)/data/page.tsx — the /data list is the tables page, /data-v2.
import { redirect } from "next/navigation";

export default function UserGeneratedDataPage() {
  redirect("/data-v2");
}
