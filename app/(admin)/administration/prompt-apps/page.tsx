import Link from 'next/link';
import { ArrowRight, Star } from 'lucide-react';
import { PromptAppsAdminContainer } from './components/PromptAppsAdminContainer';

export default function PromptAppsAdminPage() {
    return (
        <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 flex items-center gap-3 border-b border-border bg-warning/10 px-4 py-2 text-sm">
                <Star className="h-4 w-4 text-warning flex-shrink-0" />
                <div className="flex-1">
                    <span className="font-medium text-foreground">Legacy:</span>{' '}
                    <span className="text-muted-foreground">
                        Prompt apps are being replaced by agent apps. Manage new apps at
                    </span>{' '}
                    <Link
                        href="/administration/agent-apps"
                        className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                    >
                        /administration/agent-apps
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                    .
                </div>
            </div>
            <PromptAppsAdminContainer className="flex-1" />
        </div>
    );
}

