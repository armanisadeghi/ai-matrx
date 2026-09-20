import { MandatesConsole } from "@/features/mandates/admin/MandatesConsole";

export default function MandatesPage() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <MandatesConsole />
    </div>
  );
}
