// app/(core)/data/create/page.tsx — a new table is made on the tables page, /data-v2.
import { redirect } from "next/navigation";

export default function CreateTablePage() {
  redirect("/data-v2");
}
