import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/images/presets", {
    titlePrefix: "Presets",
    title: "Images",
    description:
        "The complete Image Studio preset catalog — every size for every platform, with usage notes and specs.",
    letter: "Ip",
});

export default function PresetsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
