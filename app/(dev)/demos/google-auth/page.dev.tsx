"use client";

import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";
import { useState } from "react";

// The exact scopes you need to get approved by Google
const REQUIRED_SCOPES = [
    'https://www.googleapis.com/auth/webmasters',
    'https://www.googleapis.com/auth/calendar.app.created',
    'https://www.googleapis.com/auth/drive.file'
];

export default function GoogleAuthDemoPage() {
    const { 
        signIn, 
        signOut, 
        isAuthenticated, 
        isGoogleLoaded, 
        isInitializing, 
        error, 
        getGrantedScopes,
        token 
    } = useGoogleAPI();

    const [grantedScopes, setGrantedScopes] = useState<string[]>([]);

    const handleSignIn = async () => {
        const success = await signIn(REQUIRED_SCOPES);
        if (success) {
            setGrantedScopes(getGrantedScopes());
        }
    };

    const handleSignOut = async () => {
        await signOut();
        setGrantedScopes([]);
    };

    const checkGrantedScopes = () => {
        setGrantedScopes(getGrantedScopes());
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
            <div className="w-full max-w-2xl mx-auto bg-textured shadow-lg rounded-lg p-8">
                <h1 className="text-2xl font-bold text-center text-gray-800 dark:text-gray-200 mb-2">
                    Google OAuth Scope Approval Demo
                </h1>
                <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
                    This page demonstrates the usage of Google API scopes for our application.
                </p>

                <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                    <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">Requested Scopes</h2>
                    <ul className="list-disc list-inside space-y-1 text-sm text-blue-700 dark:text-blue-300">
                        {REQUIRED_SCOPES.map(scope => (
                            <li key={scope}><code>{scope}</code></li>
                        ))}
                    </ul>
                </div>

                <div className="flex items-center justify-center space-x-4 mb-6">
                    <button
                        onClick={handleSignIn}
                        disabled={isInitializing || !isGoogleLoaded || isAuthenticated}
                        className="px-6 py-2 text-white font-semibold bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isInitializing ? "Initializing..." : "Sign In & Authorize"}
                    </button>
                    <button
                        onClick={handleSignOut}
                        disabled={!isAuthenticated}
                        className="px-6 py-2 text-white font-semibold bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400"
                    >
                        Sign Out
                    </button>
                </div>

                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Authentication Status</h2>
                    <div className="space-y-2 text-sm">
                        <p><strong>Status:</strong> {
                            isInitializing ? <span className="text-yellow-600 dark:text-yellow-400">Initializing...</span> :
                            isAuthenticated ? <span className="text-green-600 dark:text-green-400">Authenticated</span> :
                            <span className="text-red-600 dark:text-red-400">Not Authenticated</span>
                        }</p>
                        {error && <p><strong>Error:</strong> <span className="text-red-500">{error}</span></p>}
                        
                        {isAuthenticated && (
                             <div>
                                <button onClick={checkGrantedScopes} className="text-sm mt-2 px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded-md">Refresh Scopes</button>
                             </div>
                        )}

                        <div className="pt-2">
                            <h3 className="font-semibold mb-1">Granted Scopes:</h3>
                            {grantedScopes.length > 0 ? (
                                <ul className="list-disc list-inside bg-textured p-3 rounded-md">
                                    {grantedScopes.map(scope => (
                                        <li key={scope}><code>{scope}</code></li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-gray-500 dark:text-gray-400">{isAuthenticated ? "Click 'Refresh Scopes' to see granted permissions." : "Sign in to see granted scopes."}</p>
                            )}
                        </div>

                         {isAuthenticated && token && (
                            <div className="pt-2">
                                <h3 className="font-semibold mb-1">Access Token:</h3>
                                <p className="text-xs break-all bg-textured p-2 rounded-md">
                                    {token}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
} 