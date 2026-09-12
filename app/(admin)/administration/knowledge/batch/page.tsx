import { BatchDashboard } from "@/features/administration/batch/components/BatchDashboard";

export const metadata = {
  title: "Batch · Administration",
  description:
    "Per-item visibility for the platform Batch system: queue state, work items, provider submissions, and what batching actually saved — including answers that came back and were never delivered.",
};

export default function Page() {
  return <BatchDashboard />;
}
