import { BlobCacheInspector } from "@/features/files/cache/admin/BlobCacheInspector";

export const metadata = {
  title: "Blob Cache · Administration",
};

export default function Page() {
  return <BlobCacheInspector />;
}
