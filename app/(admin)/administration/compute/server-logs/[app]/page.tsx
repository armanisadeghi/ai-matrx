"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import CoolifyLogViewer, {
  APPS,
  type AppKey,
} from "@/components/admin/server-logs/CoolifyLogViewer";

interface Props {
  params: Promise<{ app: string }>;
}

export default function ServerLogsByAppPage({ params }: Props) {
  const { app } = use(params);
  const isValidApp = APPS.some((a) => a.key === app);
  if (!isValidApp) notFound();

  return (
    <div className="w-full h-full overflow-hidden">
      <CoolifyLogViewer initialApp={app as AppKey} hideAppSelector={false} />
    </div>
  );
}
