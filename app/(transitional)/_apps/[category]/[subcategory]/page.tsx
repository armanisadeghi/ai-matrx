// app/apps/[category]/[subcategory]/page.tsx
import { notFound } from 'next/navigation';
import { AppGrid } from '@/components/applet/apps/AppGrid';
import { 
    APP_CATEGORIES, 
    isValidCategory, 
    isValidSubcategory 
} from '@/config/applets/apps/constants';

interface SubcategoryPageParams {
    category: string;
    subcategory: string;
}

interface SubcategoryPageProps {
    params: Promise<SubcategoryPageParams>;
}

export default async function SubcategoryPage({ params }: SubcategoryPageProps) {
    const { category, subcategory } = await params;
    
    if (!isValidCategory(category) || !isValidSubcategory(category, subcategory)) {
        notFound();
    }

    const categoryConfig = APP_CATEGORIES[category];
    const subcategoryConfig = categoryConfig.subcategories[subcategory];

    // Here you would fetch the apps for this subcategory
    // const apps = await fetchAppsForSubcategory(category, subcategory);
    
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">
                    {subcategoryConfig.label}
                </h1>
                <p className="text-muted-foreground">
                    In {categoryConfig.label}
                </p>
            </div>
            
            {/* Replace with your actual apps data */}
            <AppGrid 
                categorySlug={category}
                subcategorySlug={subcategory}
                apps={[]}
            />
        </div>
    );
}
