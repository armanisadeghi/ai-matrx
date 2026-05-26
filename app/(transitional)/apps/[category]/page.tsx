// app/apps/[category]/page.tsx
import { SubcategoryGrid } from '@/components/applet/apps/SubcategoryGrid';
import { APP_CATEGORIES, isValidCategory } from '@/config/applets/apps/constants';
import AppRendererTest from '../AppRendererTest';

interface CategoryPageParams {
    category: string;
}

interface CategoryPageProps {
    params: Promise<CategoryPageParams>;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
    const { category } = await params;
    
    if (!isValidCategory(category)) {
        return <AppRendererTest slug={category} />
    }

    const categoryConfig = APP_CATEGORIES[category];
    
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">
                {categoryConfig.label}
            </h1>
            <SubcategoryGrid 
                categorySlug={category}
                subcategories={Object.values(categoryConfig.subcategories)}
            />
        </div>
    );
}

