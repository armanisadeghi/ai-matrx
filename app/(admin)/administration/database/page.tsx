import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { databasePages } from './config';
import { ArrowRight, Database, SquareFunction, Code, List } from 'lucide-react';

export const metadata = {
  title: 'Database Administration',
  description: 'Database management and SQL tools',
};

// Function to get the appropriate icon for each card
const getIconForPath = (path: string) => {
  if (path.includes('sql-functions')) {
    return <SquareFunction className="h-8 w-8 text-slate-700 dark:text-slate-300" />;
  } else if (path.includes('sql-queries')) {
    return <Code className="h-8 w-8 text-slate-700 dark:text-slate-300" />;
  } else if (path.includes('enums')) {
    return <List className="h-8 w-8 text-slate-700 dark:text-slate-300" />;
  }
  return <Database className="h-8 w-8 text-slate-700 dark:text-slate-300" />;
};

export default function DatabaseAdminPage() {
  return (
    <div className="h-full w-full overflow-auto bg-slate-100 dark:bg-slate-800">
      <div className="w-full py-6 px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-200 mb-2">
            Database Administration
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Access tools for database management and SQL operations
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {databasePages.map((page) => (
            <Link href={page.path} key={page.path} className="block">
              <Card className="h-full transition-all duration-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:shadow-slate-800/20 hover:border-slate-300 dark:hover:border-slate-600">
                <CardHeader className="px-5 pt-5 pb-3">
                  <div className="mb-3">
                    {getIconForPath(page.path)}
                  </div>
                  <CardTitle className="text-xl text-slate-800 dark:text-slate-200">
                    {page.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-3">
                  <CardDescription className="text-slate-600 dark:text-slate-400">
                    {page.description}
                  </CardDescription>
                </CardContent>
                <CardFooter className="px-5 pb-5 pt-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center">
                    Open
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </span>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
