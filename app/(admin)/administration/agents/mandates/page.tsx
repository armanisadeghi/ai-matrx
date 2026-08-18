import { MandatesConsole } from "@/features/admin/mandates/MandatesConsole";

export const metadata = {
  title: "Mandates",
  description: "DB-managed system-agent pins and overrides",
};

export default function MandatesPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)]">
      <MandatesConsole />
    </div>
  );
}
