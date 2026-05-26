import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/images/convert", {
    titlePrefix: "Convert",
    title: "Images",
    description:
        "Drop images in, pick presets, get every platform-perfect size out — with format, quality, and compression controls.",
    letter: "Ic",
});

export default function ConvertLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
