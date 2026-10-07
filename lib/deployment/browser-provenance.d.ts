/** Loaded-document evidence shared by every error capture and overlay diagnostics. */
export declare function getNextBuildId(): string | null;
export declare function collectLoadedScripts(): string[];
export declare function collectDeploymentIds(scripts: string[], configuredId: string | null): {
    ids: string[];
    someMissingDpl: boolean;
    mismatch: boolean;
    inconsistency: boolean;
};
/** Snapshot at capture time; never substitutes the latest server deployment. */
export declare function collectBrowserProvenance(): {
    pageSessionId: string;
    pageStartedAt: number;
    pageAgeMs: number;
    origin: string;
    online: boolean;
    visibility: DocumentVisibilityState;
    nextBuildId: string | null;
    configuredDeploymentId: string | null;
    deploymentIdsOnPage: string[];
    someScriptsMissingDpl: boolean;
    deploymentIdMismatch: boolean;
    deploymentIdInconsistency: boolean;
} | null;
export type BrowserProvenance = ReturnType<typeof collectBrowserProvenance>;
