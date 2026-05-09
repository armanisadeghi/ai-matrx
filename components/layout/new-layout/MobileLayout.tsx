'use client';

import React, { useState, useEffect } from 'react';
import { Menu, X, ChevronRight } from 'lucide-react';
import { MobileUnifiedMenu } from './MobileUnifiedMenu';

interface SidebarLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface MobileLayoutProps {
  children: React.ReactNode;
  primaryLinks: SidebarLink[];
  secondaryLinks?: SidebarLink[];
  uniqueId?: string;
  isAdmin?: boolean;
}

export default function MobileLayout({
  children,
  primaryLinks,
  secondaryLinks = [],
  uniqueId = "mobile-layout",
  isAdmin = false
}: MobileLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeLink, setActiveLink] = useState(primaryLinks[0]?.href || '');

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleLinkClick = (href: string) => {
    setActiveLink(href);
    setIsSidebarOpen(false);
  };

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen]);

  return (
    <div id={uniqueId} className="min-h-dvh">
      {/* Mobile Header — matrx-shell-glass bar, content scrolls behind and blurs through */}
      <header className="fixed top-0 left-0 right-0 z-50 h-10 matrx-shell-glass">
        <div className="flex items-center justify-between h-full px-2">
          {/* Left side - Menu and page-specific content */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-full matrx-shell-glass transition-colors flex-shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4 text-foreground" />
            </button>

            {/* Page-specific controls will be inserted here */}
            <div id="page-specific-header-content" className="flex-1 min-w-0" />
          </div>

          {/* Right side - Unified menu dropdown */}
          <div className="flex-shrink-0">
            <MobileUnifiedMenu />
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-[60] bg-black/50 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Mobile Sidebar */}
      <aside className={`fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-textured z-[70] transform transition-transform duration-300 lg:hidden flex flex-col ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Menu</h2>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4 text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {/* Sidebar Content - Scrollable */}
        <nav className="flex-1 overflow-y-auto p-4">
          {/* Primary Links */}
          <div className="mb-6">
            <ul className="space-y-1">
              {primaryLinks.map((link, index) => (
                <li key={`primary-${index}`}>
                  <a
                    href={link.href}
                    onClick={() => handleLinkClick(link.href)}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                      activeLink === link.href
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">{link.icon}</div>
                      <span className="font-medium">{link.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Admin Links */}
          {isAdmin && secondaryLinks.length > 0 && (
            <div>
              <h3 className="px-4 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Admin
              </h3>
              <ul className="space-y-1">
                {secondaryLinks.map((link, index) => (
                  <li key={`secondary-${index}`}>
                    <a
                      href={link.href}
                      onClick={() => handleLinkClick(link.href)}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                        activeLink === link.href
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">{link.icon}</div>
                        <span className="font-medium">{link.label}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="pt-10 min-h-dvh bg-transparent">
        {children}
      </main>
    </div>
  );
}