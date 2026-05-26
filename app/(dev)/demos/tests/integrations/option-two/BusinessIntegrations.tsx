"use client";

import React, { useState, useEffect } from "react";
import { Search, Moon, Sun, Filter, Check, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Category, Integration, mockIntegrations } from "./constants";
import { matchesSearch } from "@/utils/search-scoring";

// Type definitions

const BusinessIntegrations: React.FC = () => {
  // State
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [showOnlyConnected, setShowOnlyConnected] = useState<boolean>(false);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  // Mock data - would come from an API/database
  useEffect(() => {
    // This would be replaced with an API call

    setIntegrations(mockIntegrations);
  }, []);

  const categories = Array.from(
    new Set(integrations.map((integration) => integration.category)),
  );

  // Filter integrations based on search and categories
  const filteredIntegrations = integrations.filter((integration) => {
    const matchesSearchQuery =
      searchQuery === "" ||
      matchesSearch(integration, searchQuery, [
        { get: (i) => i.name, weight: "title" },
        { get: (i) => i.category, weight: "subtitle" },
        { get: (i) => i.description, weight: "body" },
      ]);

    const matchesCategory =
      selectedCategories.length === 0 ||
      selectedCategories.includes(integration.category);

    const matchesConnected = !showOnlyConnected || integration.isConnected;

    return matchesSearchQuery && matchesCategory && matchesConnected;
  });

  // Group by category for display
  const groupedIntegrations: Record<Category, Integration[]> = {} as Record<
    Category,
    Integration[]
  >;

  filteredIntegrations.forEach((integration) => {
    if (!groupedIntegrations[integration.category]) {
      groupedIntegrations[integration.category] = [];
    }
    groupedIntegrations[integration.category].push(integration);
  });

  // Sort integrations within each category by popularity
  Object.keys(groupedIntegrations).forEach((category) => {
    groupedIntegrations[category as Category].sort(
      (a, b) => b.popularityScore - a.popularityScore,
    );
  });

  // Handle connect/disconnect
  const handleToggleConnection = (id: string) => {
    // In a real application, this would make an API call
    console.log(
      `${integrations.find((i) => i.id === id)?.isConnected ? "Disconnecting from" : "Connecting to"} ${id}`,
    );

    setIntegrations((prevIntegrations) =>
      prevIntegrations.map((integration) =>
        integration.id === id
          ? { ...integration, isConnected: !integration.isConnected }
          : integration,
      ),
    );
  };

  // Handle category selection
  const handleCategoryToggle = (category: Category) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-textured shadow-md w-full">
        <div className="max-w-full px-4 py-4 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Business Integrations
          </h1>

          <div className="flex items-center space-x-4 w-full md:w-auto">
            {/* Search */}
            <div className="relative flex-grow md:max-w-md">
              <input
                type="text"
                placeholder="Search integrations..."
                className="w-full px-4 py-2 pl-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>

            {/* Filter button (mobile) */}
            <button
              className="md:hidden p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              <Filter className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex w-full">
        {/* Filters sidebar - desktop (fixed position) */}
        <aside className="hidden md:block w-64 fixed top-[125px] bottom-0 overflow-y-auto">
          <div className="bg-textured rounded-lg shadow p-6 m-4 h-auto">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              Filters
            </h2>

            {/* Connection status */}
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                <Checkbox
                  checked={showOnlyConnected}
                  onCheckedChange={() =>
                    setShowOnlyConnected(!showOnlyConnected)
                  }
                  className="shrink-0"
                />
                <span>Show only connected</span>
              </label>
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Categories
              </h3>
              {categories.map((category) => (
                <label
                  key={category}
                  className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300"
                >
                  <Checkbox
                    checked={selectedCategories.includes(category)}
                    onCheckedChange={() =>
                      handleCategoryToggle(category as Category)
                    }
                    className="shrink-0"
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* Mobile filter panel */}
        {isFilterOpen && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-20 flex justify-end">
            <div className="bg-textured w-64 h-full p-4 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                  Filters
                </h2>
                <button onClick={() => setIsFilterOpen(false)}>
                  <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              {/* Connection status */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                  <Checkbox
                    checked={showOnlyConnected}
                    onCheckedChange={() =>
                      setShowOnlyConnected(!showOnlyConnected)
                    }
                    className="shrink-0"
                  />
                  <span>Show only connected</span>
                </label>
              </div>

              {/* Categories */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Categories
                </h3>
                {categories.map((category) => (
                  <label
                    key={category}
                    className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300"
                  >
                    <Checkbox
                      checked={selectedCategories.includes(category)}
                      onCheckedChange={() =>
                        handleCategoryToggle(category as Category)
                      }
                      className="shrink-0"
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main content - with left margin to account for fixed sidebar */}
        <main className="flex-1 md:ml-64 p-4">
          {Object.keys(groupedIntegrations).length > 0 ? (
            Object.keys(groupedIntegrations).map((category) => (
              <div key={category} className="mb-8">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
                  {category}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {groupedIntegrations[category as Category].map(
                    (integration) => (
                      <div
                        key={integration.id}
                        className="bg-textured rounded-lg shadow hover:shadow-md transition-shadow p-4 border-border flex flex-col"
                      >
                        <div className="flex items-center space-x-3 mb-2">
                          {/* Service icon */}
                          <div className="w-10 h-10 flex-shrink-0 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                            {React.createElement(integration.icon, {
                              size: 20,
                              color: integration.iconColor || "currentColor",
                              className: "w-6 h-6",
                            })}
                          </div>

                          {/* Service name */}
                          <div>
                            <h3 className="text-lg font-medium text-gray-800 dark:text-white">
                              {integration.name}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {integration.description}
                            </p>
                          </div>
                        </div>

                        {/* Connection status and button */}
                        <div className="mt-auto pt-3 flex justify-between items-center">
                          <span
                            className={`text-sm flex items-center ${
                              integration.isConnected
                                ? "text-green-500"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {integration.isConnected && (
                              <Check className="h-4 w-4" />
                            )}
                            {integration.isConnected
                              ? "Connected"
                              : "Not connected"}
                          </span>

                          <button
                            onClick={() =>
                              handleToggleConnection(integration.id)
                            }
                            className={`px-3 py-1 rounded-md text-sm font-medium ${
                              integration.isConnected
                                ? "text-red-600 border border-red-600 hover:bg-red-50 dark:hover:bg-red-900"
                                : "text-white bg-blue-600 hover:bg-blue-700"
                            }`}
                          >
                            {integration.isConnected ? "Disconnect" : "Connect"}
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-64 bg-textured rounded-lg shadow p-4">
              <p className="text-gray-500 dark:text-gray-400">
                No integrations found matching your filters.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default BusinessIntegrations;
