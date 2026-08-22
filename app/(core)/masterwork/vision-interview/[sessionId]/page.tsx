// app/(core)/vision-interview/[sessionId]/page.tsx
//
// Server Component wrapper — the room itself is fully interactive
// (features/vision-interview/components/VisionInterviewRoom.tsx).

import { VisionInterviewRoom } from "@/features/vision-interview/components/VisionInterviewRoom";

export default async function VisionInterviewRoomPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <VisionInterviewRoom sessionId={sessionId} />;
}
