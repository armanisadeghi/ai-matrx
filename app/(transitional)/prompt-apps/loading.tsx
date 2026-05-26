import { Loader2 } from "lucide-react";

export default function PromptAppsLoading() {
    return (
        <div className="h-page flex items-center justify-center bg-textured">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    );
}

