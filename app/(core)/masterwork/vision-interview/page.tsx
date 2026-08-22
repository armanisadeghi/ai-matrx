// app/(core)/vision-interview/page.tsx
//
// Vision Interview LIST page — the feature entry point (list first, never a
// forced workspace). All interactivity lives in the client island.

import { VisionInterviewListPage } from "@/features/vision-interview/components/VisionInterviewListPage";

export default function VisionInterviewIndexPage() {
  return <VisionInterviewListPage />;
}
