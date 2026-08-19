import { fetchErrors } from "@/features/cx-dashboard/service";
import { ErrorsContent } from "./errors-content";

export default async function ErrorsPage() {
  const errors = await fetchErrors({ timeframe: "all" });

  return <ErrorsContent errors={errors} />;
}
