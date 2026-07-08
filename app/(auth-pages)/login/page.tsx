// app/(auth-pages)/login/page.tsx

import { login, signup, loginWithGoogle, loginWithApple, loginWithGithub } from './actions'
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { IconBrandGithub, IconBrandGoogle, IconBrandApple } from "@tabler/icons-react";
import AuthPageContainer from "@/components/auth/auth-page-container";
import { AuthMessageType } from '@/components/form-message';
import { GuestFingerprintField } from "../sign-up/GuestFingerprintField";

interface SignInProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SignIn({ searchParams }: SignInProps) {
    const awaitedSearchParams = await searchParams;

    // Convert search params to URLSearchParams for easy manipulation
    const searchParamsString = new URLSearchParams(
        Object.entries(awaitedSearchParams).reduce((acc, [key, value]) => {
            if (value) acc[key] = String(value);
            return acc;
        }, {} as Record<string, string>)
    ).toString();

    // Get redirectTo from search params directly, without additional decoding
    const redirectTo = typeof awaitedSearchParams.redirectTo === 'string'
        ? awaitedSearchParams.redirectTo
        : '/dashboard';

    console.log("Login page - Raw redirectTo param:", awaitedSearchParams.redirectTo);
    console.log("Login page - Using redirectTo:", redirectTo);

    const error = awaitedSearchParams.error as string;
    const success = awaitedSearchParams.success as string;

    let message: AuthMessageType | undefined;

    if (success) {
        message = {
            type: "success",
            message: success
        };
    } else if (error) {
        message = {
            type: "error",
            message: error
        };
    }

    // Create action bindings with redirectTo
    const loginWithRedirect = login.bind(null, redirectTo);
    const signupWithRedirect = signup.bind(null, redirectTo);
    const googleLoginWithRedirect = loginWithGoogle.bind(null, redirectTo);
    const appleLoginWithRedirect = loginWithApple.bind(null, redirectTo);
    const githubLoginWithRedirect = loginWithGithub.bind(null, redirectTo);

    return (
        <AuthPageContainer
            title="Sign in to your account"
            subtitle={
                <>
                    Don't have an account?{" "}
                    <Link
                        className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
                        href={`/sign-up${searchParamsString ? `?${searchParamsString}` : ''}`}
                        tabIndex={-1}
                    >
                        Sign up Here
                    </Link>
                </>
            }
            message={message}
        >
            <form action={loginWithRedirect} className="space-y-4 sm:space-y-6">
                {/* Hidden input to pass redirectTo in case the binding fails */}
                <input type="hidden" name="redirectTo" value={redirectTo} />

                <div>
                    <Label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Email address
                    </Label>
                    <div className="mt-1">
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-neutral-700 dark:text-white"
                            placeholder="you@example.com"
                        />
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Password
                        </Label>
                        <div className="text-sm">
                            <Link
                                className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
                                href={`/forgot-password${searchParamsString ? `?${searchParamsString}` : ''}`}
                                tabIndex={-1}
                            >
                                Forgot your password?
                            </Link>
                        </div>
                    </div>
                    <div className="mt-1">
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-neutral-700 dark:text-white"
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                <div>
                    <SubmitButton
                        pendingText="Signing In..."
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                    >
                        Sign in
                    </SubmitButton>
                </div>
            </form>

            <div className="mt-4 sm:mt-6">
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white dark:bg-neutral-800 text-gray-500 dark:text-gray-400">
                            Or continue with
                        </span>
                    </div>
                </div>

                <div className="mt-4 sm:mt-6 grid grid-cols-3 gap-2">
                    <form action={googleLoginWithRedirect}>
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <GuestFingerprintField />
                        <SubmitButton
                            pendingText="Loading..."
                            className="w-full inline-flex justify-center py-2 px-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-neutral-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-600 transition-colors duration-200"
                        >
                            <IconBrandGoogle className="h-5 w-5 mr-1" />
                            <span>Google</span>
                        </SubmitButton>
                    </form>

                    <form action={appleLoginWithRedirect}>
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <GuestFingerprintField />
                        <SubmitButton
                            pendingText="Loading..."
                            className="w-full inline-flex justify-center py-2 px-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-neutral-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-600 transition-colors duration-200"
                        >
                            <IconBrandApple className="h-5 w-5 mr-1" />
                            <span>Apple</span>
                        </SubmitButton>
                    </form>

                    <form action={githubLoginWithRedirect}>
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <GuestFingerprintField />
                        <SubmitButton
                            pendingText="Loading..."
                            className="w-full inline-flex justify-center py-2 px-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-neutral-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-600 transition-colors duration-200"
                        >
                            <IconBrandGithub className="h-5 w-5 mr-1" />
                            <span>GitHub</span>
                        </SubmitButton>
                    </form>
                </div>
            </div>
        </AuthPageContainer>
    );
}