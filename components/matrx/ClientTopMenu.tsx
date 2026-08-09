// components/matrx/ClientTopMenu.tsx (Server Component)
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

const ClientTopMenu: React.FC = () => {

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4">
        <div className="flex items-center space-x-4">
          <Link href="/dashboard" className="text-primary text-2xl font-bold flex items-center hover:text-primary/80 transition-colors duration-200">
            <Image src="/matrx/matrx-icon.svg" width={32} height={32} alt="AI Matrx Logo" className="mr-2 flex-shrink-0" />
            AI Matrx
          </Link>
          <nav className="hidden md:flex space-x-4">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
              Solution
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
              Developers
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
              Pricing
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
              Docs
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
              Blog
            </a>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
            Dashboard
          </Link>
          <Link
            href="#"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors duration-200"
          >
            Start your project
          </Link>
        </div>
      </div>
    </header>
  );
};

export default ClientTopMenu;