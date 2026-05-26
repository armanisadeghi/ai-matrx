// app/apps/[category]/[subcategory]/page.tsx
import { notFound } from 'next/navigation';
import { 
    APP_CATEGORIES, 
    isValidCategory, 
    isValidSubcategory 
} from '@/config/applets/apps/constants';
import AppletGrid, { Applet } from '@/components/applet/apps/AppletCard';

interface SubcategoryPageParams {
    category: string;
    subcategory: string;
}

interface SubcategoryPageProps {
    params: Promise<SubcategoryPageParams>;
}


// NOTE: THese are just fake, hard-coded so we are not actually using 'subcategories' at this time.


export default async function SubcategoryPage({ params }: SubcategoryPageProps) {
    const { category, subcategory } = await params;
    
    if (!isValidCategory(category) || !isValidSubcategory(category, subcategory)) {
        notFound();
    }

    const categoryConfig = APP_CATEGORIES[category];
    const subcategoryConfig = categoryConfig.subcategories[subcategory];

    const sampleApplets: Applet[] = [
        {
          id: 'da794450-9b3e-46ae-a68a-ff33cb0ab1f0',
          name: 'Las Vegas Party Trip Planner',
          description: 'Plan your perfect Las Vegas party trip with our comprehensive planner.',
          creator: 'Armani Sadeghi',
          imageUrl: 'https://images.unsplash.com/photo-1614974121916-81eadb4dd6b2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHw5fHxsYXMlMjBWZWdhc3xlbnwwfHx8fDE3Mzk3NzI3NDJ8MA&ixlib=rb-4.0.3&q=80&w=1080'
        },
        {
          id: '976c56e5-263c-4815-b2ec-e6d1be04003a',
          name: 'Code Genius',
          description: "Your ultimate AI-powered coding companion, transforming the way developers tackle programming challenges. With unparalleled proficiency, our AI model crafts clean, efficient, and robust code in any language required, all while effortlessly integrating the expertise of seasoned human programmers tailored to your project's needs. CodeGenius streamlines your workflow, accelerates your development process, and elevates your coding standards to new heights. Whether you're debugging or developing a complex algorithm, CodeGenius empowers you with precision and expertise, ensuring success every step of the way.",
          creator: 'Armani Sadeghi',
          imageUrl: 'https://images.unsplash.com/photo-1605379399843-5870eea9b74e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOXx8Y29kaW5nfGVufDB8fHx8MTczOTg1MDkwOXww&ixlib=rb-4.0.3&q=80&w=1080'
        },
        {
          id: '3',
          name: 'Report Generator',
          description: 'Create professional reports in minutes with customizable templates.',
          creator: 'Michael Rodriguez',
          imageUrl: 'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?crop=entropy&cs=srgb&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOHx8ZGlnaXRhbCUyMHJlcG9ydHxlbnwwfHx8fDE3NDU3NjgzNTJ8MA&ixlib=rb-4.0.3&q=85'
        }
      ];
      
    return <AppletGrid applets={sampleApplets} />;
    }
