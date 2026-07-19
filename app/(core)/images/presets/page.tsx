import Link from "next/link";
import { ArrowLeft, ArrowRight, Library, Rainbow } from "lucide-react";
import { PresetCatalogReadOnly } from "@/features/image-studio/components/PresetCatalog";
import { ALL_PRESETS, PRESET_CATEGORIES } from "@/features/image-studio/presets";

/**
 * /images/presets
 *
 * Browsable static catalog. Pure Server Component — the preset data is a
 * static TypeScript object, so everything here prerenders. No JS ships from
 * this page apart from the Next.js link runtime.
 *
 * Route chrome (title, back-to-Studio, cross-links) lives in the shared
 * `/images` shell (`ImagesListHeader` in the header, `ImagesSidebar` for
 * navigation) — no in-body header bar here.
 */
export default function PresetsPage() {
    const totalPresets = ALL_PRESETS.length;
    const totalCategories = PRESET_CATEGORIES.length;

    return (
        <main className="h-full overflow-y-auto overscroll-contain bg-background">
            <div className="w-full px-3 sm:px-6 md:px-10 py-4 md:py-8">
                <div className="flex items-center gap-1.5 mb-3 md:mb-4">
                    <Link
                        href="/images/studio"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Studio
                    </Link>
                    <span className="text-muted-foreground/40">/</span>
                    <Link
                        href="/images/library"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Library className="h-3.5 w-3.5" />
                        Library
                    </Link>
                    <Link
                        href="/images/convert"
                        className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                        <Rainbow className="h-3.5 w-3.5" />
                        Convert
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>

                <div className="max-w-3xl mb-4 md:mb-8">
                    <h1 className="text-xl md:text-3xl font-semibold tracking-tight">
                        Preset Catalog
                    </h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        {totalPresets} presets across {totalCategories} categories
                    </p>
                    <p className="hidden sm:block text-sm text-muted-foreground mt-2 leading-relaxed">
                        This is the full reference for what Image Studio can produce. Each
                        preset has a clear intent and the platform spec it matches. Click{" "}
                        <Link
                            href="/images/convert"
                            className="underline text-primary"
                        >
                            Convert
                        </Link>{" "}
                        to drop an image in and pick any subset of these in one go.
                    </p>
                </div>
                <PresetCatalogReadOnly />
            </div>
        </main>
    );
}
