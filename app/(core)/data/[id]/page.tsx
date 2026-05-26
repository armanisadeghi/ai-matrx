// data/[id]/page.tsx

import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface AppletPageProps {
    params: {
        id: string;
    };
}

export default async function AppletPage({ params }: AppletPageProps) {
    const { id } = await params;

    return (
        <div className="w-full h-full bg-gray-100 dark:bg-gray-900 p-4 rounded-lg space-y-4 scrollbar-none">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="icon"
                        asChild
                        className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    >
                        <a href="/data">
                            <ArrowLeft size={20} />
                        </a>
                    </Button>
                    <h1 className="text-2xl font-bold">Table Details</h1>
                </div>
            </div>

            <UserTableViewer tableId={id} showTableSelector={true} />
        </div>
    );
}
