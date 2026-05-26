import { PromptsPageHeader } from "@/features/prompts/components/layouts/PromptsPageHeader";
import { PromptsGrid } from "@/features/prompts/components/layouts/PromptsGrid";

export default function PromptsPage() {
  return (
    <>
      <PromptsPageHeader />
      <div className="w-full">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-6 max-w-[1800px]">
          <PromptsGrid />
        </div>
      </div>
    </>
  );
}
