import React from "react";
import type { Metadata } from "next";
import { getCategories, getDataByKeyForSelect } from "../../constants";
import { createFlashcardRouteMetadata } from "@/utils/flashcard-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; id: string }>;
}): Promise<Metadata> {
  const { category: categoryKey, id } = await params;
  const categories = await getCategories();
  const cat = categories[categoryKey];
  const dataArr = await getDataByKeyForSelect(id);
  const displayName = dataArr[0]?.displayName ?? id;
  const composedTitle = `${displayName} | Flashcards`;
  const rawDesc =
    dataArr[0]?.description ??
    cat?.description ??
    `Open the ${displayName} flashcard deck`;
  return createFlashcardRouteMetadata(composedTitle, rawDesc, "Fd");
}

export default async function FlashcardDeckLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex-1">{children}</div>;
}
