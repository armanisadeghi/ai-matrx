'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FiSearch, FiCheck } from 'react-icons/fi';
import { INTEGRATIONS, CATEGORIES } from './constants';
import { USER_INTEGRATIONS } from './mockData';
import { Integration, UserIntegration } from './types';
import { filterAndSortBySearch } from '@/utils/search-scoring';

const IntegrationPortal: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [filteredIntegrations, setFilteredIntegrations] = useState<Integration[]>(INTEGRATIONS);
  const [userIntegrationMap, setUserIntegrationMap] = useState<Record<string, UserIntegration>>({});
  
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  // Create a map of user integrations for easier lookup
  useEffect(() => {
    const map: Record<string, UserIntegration> = {};
    USER_INTEGRATIONS.forEach(integration => {
      map[integration.integrationId] = integration;
    });
    setUserIntegrationMap(map);
  }, []);
  
  // Handle search filtering
  useEffect(() => {
    if (!searchTerm) {
      setFilteredIntegrations(INTEGRATIONS);
      return;
    }
    
    const filtered = filterAndSortBySearch(INTEGRATIONS, searchTerm, [
      { get: (i) => i.name, weight: 'title' },
      { get: (i) => i.category, weight: 'subtitle' },
      { get: (i) => i.description, weight: 'body' },
    ]);
    setFilteredIntegrations(filtered);
  }, [searchTerm]);
  
  // Get unique categories and count integrations in each
  const categoriesWithCount = Object.values(CATEGORIES).map(category => {
    const count = INTEGRATIONS.filter(integration => integration.category === category).length;
    return { name: category, count };
  });
  
  // Handle integration connection
  const handleConnect = (integrationId: string) => {
    console.log(`Connecting to integration with ID: ${integrationId}`);
    // In a real app, this would call your authentication API
    // For now, we'll just toggle the connected state
    setUserIntegrationMap(prev => {
      const newMap = { ...prev };
      if (newMap[integrationId]) {
        newMap[integrationId] = {
          ...newMap[integrationId],
          connected: !newMap[integrationId].connected
        };
      } else {
        newMap[integrationId] = {
          integrationId,
          connected: true,
          connectedAt: new Date().toISOString()
        };
      }
      return newMap;
    });
  };
  
  // Scroll to category
  const scrollToCategory = (category: string) => {
    setActiveCategory(category);
    if (categoryRefs.current[category]) {
      categoryRefs.current[category]?.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }
  };
  
  // Check if an integration is connected
  const isConnected = (integrationId: string) => {
    return userIntegrationMap[integrationId]?.connected || false;
  };
  
  // Get unique categories from filtered integrations
  const visibleCategories = [...new Set(filteredIntegrations.map(item => item.category))];
  
  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="hidden md:block w-64 bg-textured border-r border-border overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Categories</h2>
          <nav>
            {categoriesWithCount.map(({ name, count }) => (
              <button
                key={name}
                onClick={() => scrollToCategory(name)}
                className={`
                  w-full text-left px-3 py-2 rounded-md mb-1 transition-colors
                  ${activeCategory === name 
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'}
                `}
              >
                <span className="flex justify-between items-center">
                  <span>{name}</span>
                  <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium px-2 py-0.5 rounded-full">
                    {count}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>
      
      {/* Mobile category tabs */}
      <div className="md:hidden fixed top-[72px] left-0 right-0 bg-textured border-b border-border z-10 overflow-x-auto">
        <div className="flex p-2 space-x-2">
          {categoriesWithCount.map(({ name }) => (
            <button
              key={name}
              onClick={() => scrollToCategory(name)}
              className={`
                whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${activeCategory === name 
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                  : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50'}
              `}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-textured border-b border-border shadow-sm">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
              Connect Your Business Tools
            </h1>
            
            {/* Search bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiSearch className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-border rounded-md leading-5 bg-textured text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
                placeholder="Search integrations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        {/* Integration categories */}
        <div className="px-6 py-4 pb-24 md:pt-6 md:pb-16">
          {visibleCategories.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                No integrations found matching your search.
              </p>
            </div>
          ) : (
            visibleCategories.map(category => {
              const categoryIntegrations = filteredIntegrations.filter(
                integration => integration.category === category
              );
              
              return (
                <div 
                  key={category} 
                  className="mb-10"
                  ref={el => { categoryRefs.current[category] = el }}
                >
                  <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">
                    {category}
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categoryIntegrations.map(integration => {
                      const connected = isConnected(integration.id);
                      
                      return (
                        <div 
                          key={integration.id}
                          className={`
                            relative p-4 rounded-lg border transition-all duration-200
                            ${connected 
                              ? 'border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/20' 
                              : 'border-gray-200 dark:border-gray-700 bg-textured hover:shadow-md'}
                          `}
                        >
                          <div className="flex items-start">
                            <div className="flex-shrink-0 p-2 rounded-md bg-gray-100 dark:bg-gray-700">
                              <integration.icon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                            </div>
                            
                            <div className="ml-4 flex-1">
                              <div className="flex justify-between">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                  {integration.name}
                                </h3>
                                {connected && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    <FiCheck className="mr-1" /> Connected
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                {integration.description}
                              </p>
                              <button
                                onClick={() => handleConnect(integration.id)}
                                className={`
                                  mt-3 inline-flex items-center px-4 py-2 border rounded-md text-sm font-medium transition-colors
                                  ${connected
                                    ? 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-textured hover:bg-gray-50 dark:hover:bg-gray-700'
                                    : 'border-transparent text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'}
                                `}
                              >
                                {connected ? 'Disconnect' : 'Connect'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default IntegrationPortal;