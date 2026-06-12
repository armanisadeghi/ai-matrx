// components/auth/AuthSignUp.tsx

"use client";

import React from "react";
import {Button} from "@/components/ui/button";
import {BasicInput} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";
import Link from "next/link";
import {Eye, EyeOff} from "lucide-react";
import {Icon} from "@iconify/react";

export default function Component() {
    const [isVisible, setIsVisible] = React.useState(false);
    const [isConfirmVisible, setIsConfirmVisible] = React.useState(false);

    const toggleVisibility = () => setIsVisible(!isVisible);
    const toggleConfirmVisibility = () => setIsConfirmVisible(!isConfirmVisible);

    return (
        <div className="flex h-dvh w-screen items-center justify-center bg-gradient-to-br from-rose-400 via-fuchsia-500 to-indigo-500 p-2 sm:p-4 lg:p-8">
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-card px-8 pb-10 pt-6 shadow-lg">
                <p className="pb-2 text-xl font-medium">Sign Up</p>
                <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
                    <div className="space-y-2">
                        <Label htmlFor="username">Username <span className="text-destructive">*</span></Label>
                        <BasicInput
                            id="username"
                            name="username"
                            placeholder="Enter your username"
                            type="text"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address <span className="text-destructive">*</span></Label>
                        <BasicInput
                            id="email"
                            name="email"
                            placeholder="Enter your email"
                            type="email"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
                        <div className="relative">
                            <BasicInput
                                id="password"
                                name="password"
                                placeholder="Enter your password"
                                type={isVisible ? "text" : "password"}
                                className="pr-10"
                                required
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
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm Password <span className="text-destructive">*</span></Label>
                        <div className="relative">
                            <BasicInput
                                id="confirmPassword"
                                name="confirmPassword"
                                placeholder="Confirm your password"
                                type={isConfirmVisible ? "text" : "password"}
                                className="pr-10"
                                required
                            />
                            <button 
                                type="button" 
                                onClick={toggleConfirmVisibility}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {isConfirmVisible ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 py-4">
                        <Checkbox id="terms" required />
                        <Label htmlFor="terms" className="text-sm font-normal cursor-pointer">
                            I agree with the{" "}
                            <Link href="#" className="text-primary hover:underline">
                                Terms
                            </Link>
                            {" "}and{" "}
                            <Link href="#" className="text-primary hover:underline">
                                Privacy Policy
                            </Link>
                        </Label>
                    </div>
                    <Button type="submit" className="w-full">
                        Sign Up
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
                    <Button variant="outline" className="w-full">
                        <Icon className="mr-2" icon="fe:github" width={20} />
                        Continue with Github
                    </Button>
                </div>
                <p className="text-center text-sm">
                    Already have an account?{" "}
                    <Link href="#" className="text-primary hover:underline">
                        Log In
                    </Link>
                </p>
            </div>
        </div>
    );
}
