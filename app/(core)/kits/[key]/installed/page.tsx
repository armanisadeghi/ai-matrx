// app/(core)/kits/[key]/installed/page.tsx — the installed view moved into the Template product
// (/make/templates/<id>, "Show what it made"); this route goes back to the kit's page until /kits
// is deleted (Kits → Template merge, slice 2).
import { redirect } from "next/navigation";

export default async function KitInstalledPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  redirect(`/kits/${encodeURIComponent(key)}`);
}
