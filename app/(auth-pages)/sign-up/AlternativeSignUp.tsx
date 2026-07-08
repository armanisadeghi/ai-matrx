// File: app/(auth-pages)/sign-up/hold-hold-page.tsx

import {
    signUpAction,
    signInWithGithubAction, signInWithGoogleAction
} from "@/actions/auth.actions";
import { FormMessage, AuthMessageType } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import MatrixLogo from "@/components/branding/MatrixLogo";
import { IconBrandGoogle, IconBrandGithub } from "@tabler/icons-react";
import { GuestFingerprintField } from "./GuestFingerprintField";

interface SignUpProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SignUp({ searchParams }: SignUpProps) {

    const awaitedSearchParams = await searchParams;

    const redirectTo = (awaitedSearchParams.redirectTo as string) || '/dashboard';
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


    return (
        <div className="bg-gray-50 dark:bg-neutral-950 flex items-center w-full justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
            <div className="mx-auto w-full max-w-md">
                <div>
                    <div className="flex">
                        <MatrixLogo size="lg"/>
                    </div>
                    <h2 className="mt-8 text-2xl font-bold leading-9 tracking-tight text-black dark:text-white">
                        Sign up for an account
                    </h2>
                </div>

                <div className="mt-10">
                    <form action={signUpAction} className="space-y-6">
                        <div>
                            <Label htmlFor="name" className="block text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-400">
                                Full name
                            </Label>
                            <div className="mt-2">
                                <Input
                                    id="name"
                                    name="name"
                                    type="text"
                                    placeholder="Your Full Name"
                                    className="block w-full bg-white dark:bg-neutral-900 px-4 rounded-md border-0 py-1.5 shadow-input text-black placeholder:text-gray-400 focus:ring-2 focus:ring-neutral-400 focus:outline-none sm:text-sm sm:leading-6 dark:text-white"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="email" className="block text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-400">
                                Email address
                            </Label>
                            <div className="mt-2">
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="email@youremail.com"
                                    className="block w-full bg-white dark:bg-neutral-900 px-4 rounded-md border-0 py-1.5 shadow-input text-black placeholder:text-gray-400 focus:ring-2 focus:ring-neutral-400 focus:outline-none sm:text-sm sm:leading-6 dark:text-white"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="password" className="block text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-400">
                                Password
                            </Label>
                            <div className="mt-2">
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="block w-full bg-white dark:bg-neutral-900 px-4 rounded-md border-0 py-1.5 shadow-input text-black placeholder:text-gray-400 focus:ring-2 focus:ring-neutral-400 focus:outline-none sm:text-sm sm:leading-6 dark:text-white"
                                    required
                                />
                            </div>
                        </div>

                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <SubmitButton className="bg-black relative z-10 hover:bg-black/90 text-white text-sm md:text-sm transition font-medium duration-200 rounded-full px-4 py-2 flex items-center justify-center w-full dark:text-black dark:bg-white dark:hover:bg-neutral-100 dark:hover:shadow-xl" pendingText="Signing Up...">
                            Sign Up
                        </SubmitButton>
                    </form>

                    <p className="text-sm text-neutral-600 text-center mt-4 dark:text-neutral-400">
                        Already have an account?{" "}
                        <Link href="/login" className="text-black dark:text-white">
                            Sign in
                        </Link>
                    </p>

                    <div className="mt-10">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-neutral-300 dark:border-neutral-700"/>
                            </div>
                            <div className="relative flex justify-center text-sm font-medium leading-6">
                                <span className="bg-gray-50 px-6 text-neutral-400 dark:text-neutral-500 dark:bg-neutral-950">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 w-full flex flex-col items-center justify-center space-y-4">
                            <form action={signInWithGoogleAction}>
                                <input type="hidden" name="redirectTo" value={redirectTo} />
                                <GuestFingerprintField />
                                <SubmitButton className="bg-red-500 relative z-10 hover:bg-red-600 text-white text-sm md:text-sm transition font-medium duration-200 rounded-full px-4 py-1.5 flex items-center justify-center w-full dark:text-white dark:hover:bg-red-700" pendingText="Connecting...">
                                    <IconBrandGoogle className="h-5 w-5 mr-2"/>
                                    <span className="text-sm font-semibold leading-6">Google</span>
                                </SubmitButton>
                            </form>

                            <form action={signInWithGithubAction}>
                                <input type="hidden" name="redirectTo" value={redirectTo} />
                                <GuestFingerprintField />
                                <SubmitButton className="bg-black relative z-10 hover:bg-black/90 text-white text-sm md:text-sm transition font-medium duration-200 rounded-full px-4 py-1.5 flex items-center justify-center w-full dark:text-black dark:bg-white dark:hover:bg-neutral-100 dark:hover:shadow-xl" pendingText="Connecting...">
                                    <IconBrandGithub className="h-5 w-5 mr-2"/>
                                    <span className="text-sm font-semibold leading-6">GitHub</span>
                                </SubmitButton>
                            </form>
                        </div>

                        <p className="text-neutral-600 dark:text-neutral-400 text-sm text-center mt-8">
                            By clicking on sign up, you agree to our{" "}
                            <Link href="#" className="text-neutral-500 dark:text-neutral-300">
                                Terms of Service
                            </Link>{" "}
                            and{" "}
                            <Link href="#" className="text-neutral-500 dark:text-neutral-300">
                                Privacy Policy
                            </Link>
                        </p>
                    </div>
                </div>
                <FormMessage message={searchParams as unknown as AuthMessageType} />
            </div>
        </div>
    );
}
