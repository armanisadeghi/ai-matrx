import { headers } from "next/headers";
import { MatrxLocalDownloadLanding } from "@/features/matrx-local-download/MatrxLocalDownloadLanding";
import { detectDesktopPlatform } from "@/features/matrx-local-download/release";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/download", {
  title: "Download Matrx Local",
  description:
    "Download and install Matrx Local for Windows, Mac, or Linux with simple step-by-step guidance.",
  canonicalPath: "/download",
});

export default async function DownloadMatrxLocalPage() {
  const userAgent = (await headers()).get("user-agent") ?? "";

  return (
    <MatrxLocalDownloadLanding detected={detectDesktopPlatform(userAgent)} />
  );
}
