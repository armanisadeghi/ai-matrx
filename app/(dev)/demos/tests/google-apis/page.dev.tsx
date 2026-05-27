// app/(authenticated)/tests/google-apis/page.tsx
"use client";

import GoogleAccessCard from "@/components/GoogleAccessCard";
import { googleServices, googleBrandColors } from "@/lib/googleScopes";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";
import { useEffect } from "react";

export default function GoogleAccessPage() {
    const { isInitializing, isAuthenticated, isGoogleLoaded, error, signIn, signOut, resetError } = useGoogleAPI();

    // Clear errors when navigating to this page
    useEffect(() => {
        resetError();
    }, [resetError]);

    return (
        <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-950 flex flex-col">
            <div className="flex-1 flex flex-col items-center py-12 px-4">
                {/* Google Logo and Header */}
                <div className="flex flex-col items-center mb-12">
                    <div className="flex items-center gap-3 mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
                            <path
                                fill="#FFC107"
                                d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                            />
                            <path
                                fill="#FF3D00"
                                d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
                            />
                            <path
                                fill="#4CAF50"
                                d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
                            />
                            <path
                                fill="#1976D2"
                                d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                            />
                        </svg>
                        <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-red-500 to-yellow-500">
                            Google Integrations
                        </h1>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 max-w-lg text-center text-lg">
                        Connect your Google services securely to enhance your experience.
                    </p>
                </div>

                {/* Google Sign In/Out Status */}
                <div className="w-full max-w-2xl mb-8 bg-textured rounded-xl shadow-md p-6 border-border">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Google Account Status</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {isInitializing
                                    ? "Checking authentication status..."
                                    : isAuthenticated
                                    ? "You are signed in with your Google account"
                                    : "Sign in to your Google account to authorize services"}
                            </p>
                            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
                        </div>
                        <div>
                            {!isInitializing && (
                                <button
                                    onClick={() => (isAuthenticated ? signOut() : signIn([]))}
                                    disabled={!isGoogleLoaded}
                                    className={`px-4 py-2 rounded-lg text-white font-medium ${
                                        !isGoogleLoaded
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : isAuthenticated
                                            ? "bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
                                            : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                                    }`}
                                >
                                    {isAuthenticated ? "Sign Out" : "Sign In with Google"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info Card - Updated with popup instructions */}
                <div className="w-full max-w-2xl mb-12 bg-textured rounded-xl shadow-md p-6 border-border">
                    <div className="flex items-start">
                        <div className="flex-shrink-0 p-1">
                            <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <div className="ml-4">
                            <h2 className="text-lg font-medium text-gray-900 dark:text-white">How it works</h2>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                First, click the "Sign In with Google" button above to connect your Google account. Then for each Google
                                service you wish to use, click the respective "Authorize" button. This will securely request access to only
                                what's needed.
                            </p>
                            <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/30 rounded text-sm text-yellow-800 dark:text-yellow-300">
                                <span className="font-medium">Important:</span> When signing in, make sure to keep the Google popup open
                                until the authentication process completes. If you close it too early, you'll need to try again.
                            </div>
                            <div className="mt-4 flex items-center">
                                <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">Your data remains private and secure</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Google Services Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl w-full">
                    {Object.keys(googleServices).map((service) => (
                        <GoogleAccessCard key={service} service={service as keyof typeof googleServices} />
                    ))}
                </div>

                {/* Footer */}
                <div className="mt-16 mb-8 text-center text-sm text-gray-500 dark:text-gray-400 max-w-xl ">
                    <p>
                        By authorizing these services, you're granting this application permission to access your Google data according to
                        our privacy policy. No data is stored on our servers without your explicit consent.
                    </p>
                    <div className="mt-4 flex justify-center space-x-4">
                        <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
                            Privacy Policy
                        </a>
                        <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
                            Terms of Service
                        </a>
                        <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
                            Help
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
