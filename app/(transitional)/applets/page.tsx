// app/(authenticated)/applets/page.tsx
import { CategorySection } from "@/components/applet/CategorySection";
import { appletDefinitions } from "@/config/applets/applet-definitions";
import { appletCategories, getAllCategoryKeys } from "@/config/applets/app-categories";
import { getSubcategoriesByCategory } from "@/config/applets/app-subcategories";
import { AppletCategory } from "@/types/applets/types";
import { LucideIcon } from "lucide-react";
import { CompactFeatureSectionGradient } from "@/components/animated/my-custom-demos/CompactFeatureSectionGradient";

// Legacy categories
const legacyCategories: AppletCategory[] = [
    "AI",
    "Automation",
    "Data Management",
    "Content",
    "Media",
    "Productivity",
    "Learning",
    "Business",
    "Development",
    "Utilities",
    "Education",
    "Communication",
];

interface TransformedCategory {
    key: string;
    title: string;
    description: string;
    link: string;
    icon: LucideIcon;
    items: Array<{
        id: string;
        title: string;
        description: string;
        icon: LucideIcon;
        link: string;
    }>;
}

// Helper function to transform new category data
const transformNewCategory = (categoryKey: string): TransformedCategory | null => {
    const category = appletCategories.find((cat) => cat.key === categoryKey);
    if (!category) return null;

    const subcategories = getSubcategoriesByCategory(categoryKey);

    return {
        key: category.key,
        title: category.title,
        description: category.description,
        link: category.link,
        icon: category.icon,
        items: subcategories.map((subcategory) => ({
            id: subcategory.key,
            title: subcategory.title,
            description: subcategory.description,
            icon: subcategory.icon,
            link: subcategory.link,
        })),
    };
};

export default function AppletsPage() {
    // Get all new categories
    const newCategoryKeys = getAllCategoryKeys();
    const newCategories = newCategoryKeys
        .map(transformNewCategory)
        .filter((category): category is TransformedCategory => category !== null);

    // Get legacy categories and their applets
    const legacyContent = legacyCategories
        .map((category) => {
            const categoryApplets = appletDefinitions.filter((applet) => applet.category === category);

            if (categoryApplets.length === 0) return null;

            return {
                key: category.toLowerCase().replace(/\s+/g, "-"),
                title: category,
                applets: categoryApplets,
            };
        })
        .filter(Boolean);

    return (
        <div className="container py-8 space-y-8">
            <div className="space-y-4">
                <h1 className="text-4xl font-bold tracking-tight">Applets</h1>
                <p className="text-xl text-muted-foreground">Discover Powerful Community Applets</p>
            </div>

            {/* New Categories Section */}
            <div className="space-y-8">
                <div className="grid grid-cols-1 gap-6">
                    {newCategories.map((category) => (
                        <CompactFeatureSectionGradient
                            key={category.key}
                            title={category.title}
                            description={category.description}
                            icon={category.icon}
                            items={category.items}
                            link={category.link}
                            className="border border-neutral-200 dark:border-neutral-700 rounded-2xl overflow-hidden py-2 pl-3 hover:bg-gradient-to-br hover:from-blue-50/50 hover:to-neutral-50/50 dark:hover:from-neutral-800/50 dark:hover:to-neutral-900/50 transition-colors duration-300"
                        />
                    ))}
                </div>
            </div>

            {/* Legacy Categories Section */}
            <div className="space-y-8 mt-16">
                <div className="border-b pb-4">
                    <h2 className="text-2xl font-semibold">Classic Tools</h2>
                </div>
                {legacyContent.map((category) => (
                    <CategorySection key={category.key} category={category.title} applets={category.applets} />
                ))}
            </div>
        </div>
    );
}
