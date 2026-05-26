import { Suspense } from 'react';
import ModelAuditDashboard from '@/features/ai-models/audit/ModelAuditDashboard';
import { Loader2 } from 'lucide-react';

export const metadata = {
    title: 'AI Model Audit',
};

export default function ModelAuditPage() {
    return (
        <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
            <Suspense
                fallback={
                    <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading audit…
                    </div>
                }
            >
                <ModelAuditDashboard />
            </Suspense>
        </div>
    );
}
