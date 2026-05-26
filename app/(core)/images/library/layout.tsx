import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/images/library", {
    titlePrefix: "Library",
    title: "Images",
    description:
        "Your saved Image Studio exports — every variant you've uploaded to the library, grouped by session.",
    letter: "Il",
});

export default function LibraryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
