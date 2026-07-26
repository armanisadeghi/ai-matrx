// app/apps/[category]/page.tsx
import { appletCategories, getAllCategoryKeys } from "@/config/applets/app-categories";
import { getSubcategoriesByCategory } from "@/config/applets/app-subcategories";
import { notFound } from 'next/navigation';
import { FeatureSectionGradient } from "@/components/animated/my-custom-demos/feature-section-gradient-server";

interface CategoryPageParams {
    category: string;
}

interface CategoryPageProps {
    params: Promise<CategoryPageParams>;
}

export async function generateStaticParams() {
    const categoryKeys = getAllCategoryKeys();
    return categoryKeys.map((category) => ({
        category,
    }));
}

export default async function CategoryPage({ params }: CategoryPageProps) {
    const { category } = await params;
    
    const categoryDetails = appletCategories.find(cat => cat.key === category);
    if (!categoryDetails) {
        notFound();
    }

    const subcategories = getSubcategoriesByCategory(category);
    
    const subcategoryItems = subcategories.map(subcategory => ({
        id: subcategory.key,
        title: subcategory.title,
        description: subcategory.description,
        icon: subcategory.icon,
        link: subcategory.link
    }));

    return (
        <div className="container py-8">
            <FeatureSectionGradient
                category={categoryDetails.title}
                description={categoryDetails.description}
                icon={categoryDetails.icon}
                items={subcategoryItems}
                className="mt-8"
            />
        </div>
    );
}

export async function generateMetadata({ params }: CategoryPageProps) {
    const { category } = await params;
    const categoryDetails = appletCategories.find(cat => cat.key === category);

    if (!categoryDetails) {
        return {
            title: 'Category Not Found',
            description: 'The requested category could not be found.',
        };
    }

    return {
        title: `${categoryDetails.title} - Applets`,
        description: categoryDetails.description,
    };
}