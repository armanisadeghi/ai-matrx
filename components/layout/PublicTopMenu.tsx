import React from 'react';
import { Menu } from 'lucide-react';
import { Button } from "@/components/ui/button";
import AppLink from "@/components/navigation/AppLink";
import { StandaloneThemeSwitcher } from "@/styles/themes/StandaloneThemeSwitcher";
import { LogoHorizontal } from '@/components/branding/MatrixLogo';
import NavigationButton from "@/components/ui/navigation-button";

const DesktopMenu = () => {
    return (
        <div className="container hidden md:flex h-14 max-w-screen-2xl items-center">
            <div className="flex-shrink-0">
                <LogoHorizontal size="md" />
            </div>
            <nav className="ml-6 space-x-4">
                <a href="#" className="text-foreground/60 hover:text-foreground">Platform</a>
                <a href="#" className="text-foreground/60 hover:text-foreground">Developers</a>
                <a href="#" className="text-foreground/60 hover:text-foreground">Pricing</a>
                <a href="#" className="text-foreground/60 hover:text-foreground">Docs</a>
                <AppLink href="/education" className="text-foreground/60 hover:text-foreground">Education</AppLink>
            </nav>
            <div className="ml-auto flex items-center space-x-3">
                <StandaloneThemeSwitcher initialTheme={'dark'}/>
                <NavigationButton
                    href="/dashboard"
                    className="bg-slate-700 hover:bg-slate-600 text-white dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white"
                >
                    Dashboard
                </NavigationButton>
                <NavigationButton
                    href="/sign-up"
                    className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600 dark:text-white"
                >
                    Get Started
                </NavigationButton>
            </div>
        </div>
    );
};

const MobileMenu = () => {
    return (
        <div className="container flex md:hidden h-14 max-w-screen-2xl items-center">
            <div className="flex-shrink-0">
                <LogoHorizontal size="md" />
            </div>
            <div className="ml-auto flex items-center space-x-3">
                <NavigationButton
                    href="/dashboard"
                    className="bg-slate-700 hover:bg-slate-600 text-white dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white"
                >
                    Dashboard
                </NavigationButton>
                <StandaloneThemeSwitcher initialTheme={'dark'}/>
                <details className="relative">
                    <summary className="list-none">
                        <Button
                            className="bg-transparent hover:bg-slate-200 dark:hover:bg-slate-800 p-2"
                            size="icon"
                        >
                            <Menu className="h-5 w-5" />
                        </Button>
                    </summary>
                    <div className="absolute right-0 mt-2 w-48 bg-background border border-slate-200 dark:border-slate-800 rounded-md shadow-lg">
                        <nav className="py-2">
                            <a href="#" className="block px-4 py-2 text-foreground/60 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800">Platform</a>
                            <a href="#" className="block px-4 py-2 text-foreground/60 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800">Developers</a>
                            <a href="#" className="block px-4 py-2 text-foreground/60 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800">Pricing</a>
                            <a href="#" className="block px-4 py-2 text-foreground/60 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800">Docs</a>
                            <AppLink href="/education" className="block px-4 py-2 text-foreground/60 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800">Education</AppLink>
                            <AppLink href="/dashboard" className="block px-4 py-2 text-foreground/60 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800">
                                Dashboard
                            </AppLink>
                        </nav>
                    </div>
                </details>
            </div>
        </div>
    );
};

const TopMenu = () => {
    return (
        <header className="sticky top-0 z-50 w-full bg-background">
            <DesktopMenu />
            <MobileMenu />
        </header>
    );
};

export default TopMenu;