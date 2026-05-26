import React from 'react';
import { getDatabaseEnums } from '@/actions/admin/enum-functions';
import EnumsContainer from './components/EnumsContainer';
import { DatabaseEnum } from '@/types/enum-types';


export const metadata = {
  title: 'Database Enums',
  description: 'Manage database enum types',
};

export default async function EnumsPage() {
  // Fetch enums on the server side
  let enumsData: DatabaseEnum[] = [];
  let errorMessage = '';
  
  try {
    enumsData = await getDatabaseEnums();
  } catch (error) {
    console.error('Error fetching database enums:', error);
    errorMessage = 'Failed to load database enums. Please try again later.';
  }

  return (
    <div className="h-full w-full overflow-auto bg-slate-100 dark:bg-slate-800">
      <div className="w-full py-2">
        {errorMessage ? (
          <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200">
            {errorMessage}
          </div>
        ) : (
          <EnumsContainer initialEnums={enumsData} />
        )}
      </div>
    </div>
  );
} 