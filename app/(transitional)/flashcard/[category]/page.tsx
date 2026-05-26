// app/(authenticated)/tests/ssr-test/[category]/page.tsx
import React from "react";
import { OptionCardGrid } from "@/components/ssr/option-card-grid";
import {
  getDataByCategory,
  base_app_path,
  getAllDataByCategoryKey,
} from "../constants";
import type { CategoryOptions } from "../constants";

type Params = Promise<{
  category: string;
}>;

type SearchParams = Promise<{
  optionName: string;
  [key: string]: string | string[] | undefined;
}>;

interface PageProps {
  params: Params;
  searchParams: SearchParams;
}

export default async function CategoryPage(props: PageProps) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);

  const categoryKey = params.category as string;
  const categoryData = await getAllDataByCategoryKey(params.category);

  const items = categoryData.map((set) => ({
    id: set.key,
    displayName: set.displayName,
    description: set.description || "",
    additionalFields: {
      "Total Items": (set.data || []).length,
    },
  }));

  return (
    <OptionCardGrid
      items={items}
      basePath={`${base_app_path}/${categoryKey}`}
    />
  );
}
