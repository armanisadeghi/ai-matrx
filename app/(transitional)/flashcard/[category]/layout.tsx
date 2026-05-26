import React from "react";
import type { Metadata } from "next";
import { OptionCardHeader } from "@/components/ssr/options-card-header";
import { getCategories } from "../constants";
import { notFound } from "next/navigation";
import { createFlashcardRouteMetadata } from "@/utils/flashcard-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: categoryKey } = await params;
  const categories = await getCategories();
  const category = categories[categoryKey];
  const label = category?.label ?? categoryKey;
  const composedTitle = `${label} | Flashcards`;
  const description =
    category?.description ?? `Study flashcards in the ${label} category`;
  return createFlashcardRouteMetadata(composedTitle, description, "Fc");
}

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ category: string }>;
}

export default async function CategoryLayout({
  children,
  params,
}: LayoutProps) {
  const resolvedParams = await params;
  const categories = await getCategories();
  const category = categories[resolvedParams.category];

  if (!category) {
    notFound();
  }

  const headerData = {
    id: category.id,
    displayName: category.label,
    description: category.description,
    icon: category.icon,
    additionalFields: {
      Style: category.customStyles?.backgroundColor,
    },
  };

  return (
    <div className="flex flex-col space-y-2">
      <OptionCardHeader data={headerData} />
      {children}
    </div>
  );
}
