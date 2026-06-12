// components/auth/AuthSignIn.tsx

"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { BasicInput } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Icon } from "@iconify/react";

export default function AuthSignIn() {
    const [isVisible, setIsVisible] = React.useState(false);

    const toggleVisibility = () => setIsVisible(!isVisible);

    return (
        <div className="flex h-dvh w-screen items-center justify-center bg-gradient-to-br from-rose-400 via-fuchsia-500 to-indigo-500 p-2 sm:p-4 lg:p-8">
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-card px-8 pb-10 pt-6 shadow-lg">
                <p className="pb-2 text-xl font-medium">Log In</p>
                <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <BasicInput
                            id="email"
                            name="email"
                            placeholder="Enter your email"
                            type="email"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <div className="relative">
                            <BasicInput
                                id="password"
                                name="password"
                                placeholder="Enter your password"
                                type={isVisible ? "text" : "password"}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={toggleVisibility}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {isVisible ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between px-1 py-2">
                        <div className="flex items-center space-x-2">
                            <Checkbox id="remember" name="remember" />
                            <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                                Remember me
                            </Label>
                        </div>
                        <Link className="text-sm text-muted-foreground hover:text-foreground" href="#">
                            Forgot password?
                        </Link>
                    </div>
                    <Button type="submit" className="w-full">
                        Log In
                    </Button>
                </form>
                <div className="flex items-center gap-4 py-2">
                    <Separator className="flex-1" />
                    <p className="shrink-0 text-xs text-muted-foreground">OR</p>
                    <Separator className="flex-1" />
                </div>
                <div className="flex flex-col gap-2">
                    <Button variant="outline" className="w-full">
                        <Icon icon="flat-color-icons:google" width={20} className="mr-2" />
                        Continue with Google
                    </Button>
                    <Button variant="outline" className="w-full bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200">
                        <Icon icon="ic:baseline-apple" width={20} className="mr-2" />
                        Continue with Apple
                    </Button>
                    <Button variant="outline" className="w-full">
                        <Icon className="mr-2" icon="fe:github" width={20} />
                        Continue with Github
                    </Button>
                </div>
                <p className="text-center text-sm">
                    Need to create an account?{" "}
                    <Link href="#" className="text-primary hover:underline">
                        Sign Up
                    </Link>
                </p>
            </div>
        </div>
    );
}
