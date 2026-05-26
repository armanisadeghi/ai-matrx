// app/(authenticated)/tests/ssr-test/page.tsx
import React from "react";
import { OptionCardGrid } from "@/components/ssr/option-card-grid";
import { getCategoriesArray, base_app_path } from "./constants";

// New header component
const FlashcardHeader = () => {
  return (
    <div className="mb-6 pt-4">
      <h1 className="text-2xl font-bold text-white mb-2">Flashcard Sets</h1>
      <p className="text-gray-300 text-sm mb-4">
        Select a category to begin studying with flashcards
      </p>
      <div className="h-1 w-20 bg-blue-500 rounded mb-2"></div>
    </div>
  );
};

export default async function SSRTestPage() {
  const categories = await getCategoriesArray();

  const items = categories.map((category) => ({
    id: category.id,
    displayName: category.label,
    description: category.description,
    icon: category.icon,
    customStyles: category.customStyles,
  }));

  return (
    <div className="mt-6 mx-3">
      <FlashcardHeader />
      <OptionCardGrid items={items} basePath={base_app_path} />
    </div>
  );
}
