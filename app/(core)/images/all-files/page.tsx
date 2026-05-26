import { CloudFilesTab } from "@/components/image/cloud/CloudFilesTab";

export default function AllFilesPage() {
  return (
    <div className="h-full overflow-hidden">
      <CloudFilesTab allowFileTypes={["image"]} />
    </div>
  );
}
