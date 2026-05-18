import { ScopesHub } from "@/features/scopes/components/management/ScopesHub";

export const metadata = {
  title: "Scopes",
  description:
    "Define the dimensions your team works in — clients, products, teams, repos, anything. Scopes carry context into every agent run.",
};

export default function ScopesIndexPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto p-6 md:p-8">
        <ScopesHub />
      </div>
    </div>
  );
}
