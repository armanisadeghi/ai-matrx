import { ScopesManager } from "@/features/scopes/components/management/ScopesManager";

export const metadata = {
  title: "Manage scopes",
  description:
    "List, edit, and add scope types and scopes for an organization.",
};

export default function ScopesManagePage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-5xl mx-auto p-6 md:p-8">
        <ScopesManager />
      </div>
    </div>
  );
}
