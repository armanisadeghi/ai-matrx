import { MatrxLocalDownloadLanding } from "@/features/matrx-local-download/MatrxLocalDownloadLanding";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/download", {
  title: "Download Matrx Local",
  description:
    "Download and install Matrx Local for Windows, Mac, or Linux with simple step-by-step guidance.",
  canonicalPath: "/download",
});

export default function DownloadMatrxLocalPage() {
  return <MatrxLocalDownloadLanding />;
}
