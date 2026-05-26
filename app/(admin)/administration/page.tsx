"use client";

import React, { useState } from "react";
import { IconChevronRight, IconList, IconSearch } from "@tabler/icons-react";
import FeatureSectionLinkComponent from "@/components/animated/my-custom-demos/feature-section-link-component";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminCategories } from "@/app/(admin)/administration/categories";
import { Input } from "@/components/ui/input";
import { filterAndSortBySearch, matchesSearch } from "@/utils/search-scoring";

// IMPORTANT: All features and routes are defined in: app\(authenticated)\(admin-auth)\administration\categories.tsx
// The top navigation menu automatically extracts routes from categories.tsx via config.ts

const AdminPage = () => {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const router = useRouter();

    React.useEffect(() => {
        if (selectedCategory) {
            window.history.pushState(
                {
                    selectedCategory,
                },
                "",
                window.location.pathname
            );
        }

        const handlePopState = (event: PopStateEvent) => {
            if (event.state === null) {
                setSelectedCategory(null);
            } else {
                setSelectedCategory(event.state.selectedCategory);
            }
        };

        window.addEventListener("popstate", handlePopState);

        return () => {
            window.removeEventListener("popstate", handlePopState);
        };
    }, [selectedCategory]);

    const handleSelectComponent = (title: string) => {
        const feature = adminCategories.flatMap((cat) => cat.features).find((f) => f.title === title);
        if (feature?.link) {
            router.push(feature.link);
        }
    };

    const handleSelectCategory = (name: string) => {
        setSelectedCategory(name);
    };

    const getPreviewFeatures = (features: any[]) => {
        if (features.length <= 8) return features;
        return features.slice(0, 8);
    };

    const getCategoryBgClass = (iconColor?: string) => {
        const colorMap: Record<string, string> = {
            "text-amber-600": "bg-amber-500 dark:bg-amber-600",
            "text-blue-600": "bg-blue-500 dark:bg-blue-600",
            "text-indigo-600": "bg-indigo-500 dark:bg-indigo-600",
            "text-purple-600": "bg-purple-500 dark:bg-purple-600",
            "text-green-600": "bg-green-500 dark:bg-green-600",
            "text-cyan-600": "bg-cyan-500 dark:bg-cyan-600",
            "text-pink-600": "bg-pink-500 dark:bg-pink-600",
            "text-orange-600": "bg-orange-500 dark:bg-orange-600",
            "text-red-600": "bg-red-500 dark:bg-red-600",
            "text-teal-600": "bg-teal-500 dark:bg-teal-600",
            "text-violet-600": "bg-violet-500 dark:bg-violet-600",
            "text-fuchsia-600": "bg-fuchsia-500 dark:bg-fuchsia-600",
        };
        return colorMap[iconColor || "text-blue-600"] || "bg-blue-500 dark:bg-blue-600";
    };

    const normalizedQuery = searchQuery.toLowerCase().trim();

    const filteredCategories = React.useMemo(() => {
        if (!normalizedQuery) return adminCategories;

        return adminCategories.map(category => {
            const filteredFeatures = filterAndSortBySearch(
                category.features,
                searchQuery,
                [
                    { get: (f) => f.title, weight: "title" },
                    { get: (f) => f.description, weight: "body" },
                ],
            );

            if (filteredFeatures.length > 0) {
                return {
                    ...category,
                    features: filteredFeatures
                };
            }

            if (matchesSearch(category, searchQuery, [
                { get: (c) => c.name, weight: "title" },
            ])) {
                 return category;
            }

            return null;
        }).filter(Boolean) as typeof adminCategories;
    }, [normalizedQuery, searchQuery]);

    const matchingFeatures = React.useMemo(() => {
        if (!normalizedQuery) return [];
        return filterAndSortBySearch(
            adminCategories.flatMap(cat => cat.features),
            searchQuery,
            [
                { get: (f) => f.title, weight: "title" },
                { get: (f) => f.description, weight: "body" },
            ],
        );
    }, [normalizedQuery, searchQuery]);

    if (selectedCategory) {
        const category = adminCategories.find((c) => c.name === selectedCategory);
        return (
            <div className="h-full w-full overflow-y-auto">
                <div className="py-4 bg-neutral-100 dark:bg-neutral-900 w-full">
                    <div className="w-full px-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {category?.features.map((feature, index) => (
                                <FeatureSectionLinkComponent
                                    key={feature.title}
                                    title={feature.title}
                                    description={feature.description}
                                    icon={feature.icon}
                                    index={index}
                                    link={feature.link}
                                    isNew={feature.isNew}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full overflow-y-auto">
            <div className="py-4 bg-neutral-100 dark:bg-neutral-900 w-full">
                <div className="w-full px-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                        <h1 className="text-xl font-bold whitespace-nowrap">Admin Dashboard Home</h1>
                        
                        <div className="flex-1 max-w-2xl w-full mx-0 sm:mx-4 relative">
                            <div className="relative">
                                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search admin routes, tools, and categories..." 
                                    className="w-full pl-9 bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 shadow-sm focus-visible:ring-blue-500"
                                />
                            </div>
                        </div>

                        <Link
                            href="/administration/all-routes"
                            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors whitespace-nowrap shrink-0"
                        >
                            <IconList className="w-4 h-4" />
                            <span>All Routes</span>
                        </Link>
                    </div>

                    {normalizedQuery && matchingFeatures.length > 0 && (
                        <div className="mb-8">
                            <h2 className="text-lg font-semibold mb-4 text-neutral-700 dark:text-neutral-300">Matching Routes</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {matchingFeatures.map((feature, index) => (
                                    <FeatureSectionLinkComponent
                                        key={feature.title}
                                        title={feature.title}
                                        description={feature.description}
                                        icon={feature.icon}
                                        index={index}
                                        link={feature.link}
                                        isNew={feature.isNew}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {normalizedQuery && filteredCategories.length > 0 && matchingFeatures.length > 0 && (
                        <h2 className="text-lg font-semibold mb-4 text-neutral-700 dark:text-neutral-300">Matching Categories</h2>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {filteredCategories.map((category, index) => (
                            <div
                                key={category.name}
                                onClick={() => handleSelectCategory(category.name)}
                                className="bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-4 transform transition-all duration-200 hover:scale-105 hover:shadow-xl cursor-pointer relative group"
                            >
                                <div className="flex items-center space-x-4 mb-4">
                                    <div className={`p-3 rounded-lg text-white ${getCategoryBgClass(category.iconColor)}`}>
                                        {category.icon}
                                    </div>
                                    <h3 className="text-xl font-semibold">{category.name}</h3>
                                </div>
                                <div className="h-auto flex flex-col justify-between">
                                    <div className={`grid gap-x-3 gap-y-1 ${getPreviewFeatures(category.features).length >= 5 ? "grid-cols-2" : "grid-cols-1"}`}>
                                        {getPreviewFeatures(category.features).map((feature) => (
                                            <div
                                                key={feature.title}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSelectComponent(feature.title);
                                                }}
                                                className={`flex items-center h-6 ${feature.isNew ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-gray-600 dark:text-gray-300"} hover:text-blue-700 dark:hover:text-blue-500 cursor-pointer transition-colors duration-200`}
                                            >
                                                <div className="shrink-0 w-3.5 h-3.5 mr-1.5 [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:max-w-none opacity-80">
                                                    {feature.icon}
                                                </div>
                                                <span className="text-sm font-medium truncate">
                                                    {feature.title}
                                                    {feature.isNew && (
                                                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600 dark:text-amber-400">
                                                            New
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {category.features.length > 8 && (
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSelectCategory(category.name);
                                            }}
                                            className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer transition-colors duration-200 mt-2 pl-7"
                                        >
                                            <span>See all {category.features.length} features</span>
                                            <IconChevronRight className="w-4 h-4 ml-1" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {normalizedQuery && filteredCategories.length === 0 && matchingFeatures.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                            No results found for "{searchQuery}"
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminPage;
