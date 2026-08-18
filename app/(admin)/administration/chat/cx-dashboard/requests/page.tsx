import { Suspense } from "react";
import { fetchUserRequests } from "@/features/cx-dashboard/service";
import { filtersFromSearchParams } from "@/features/cx-dashboard/utils/filters";
import { RequestsContent } from "./requests-content";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RequestsPage({ searchParams }: Props) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") urlParams.set(key, value);
  }
  const filters = filtersFromSearchParams(urlParams);
  const result = await fetchUserRequests(filters);

  return (
    <Suspense fallback={<div className="p-4"><div className="h-96 bg-muted/50 rounded-md animate-pulse" /></div>}>
      <RequestsContent result={result} />
    </Suspense>
  );
}
