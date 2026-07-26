import React from 'react';
import { getSqlFunctions } from '@/actions/admin/sql-functions';
import SqlFunctionsContainer from './components/SqlFunctionsContainer';
import { SqlFunction } from '@/types/sql-functions';


export const metadata = {
  title: 'SQL Functions',
  description: 'Manage database SQL functions',
};

export default async function SQLFunctionsPage() {
  // Fetch SQL functions on the server side
  let functionsData: SqlFunction[] = [];
  let errorMessage = '';
  
  try {
    functionsData = await getSqlFunctions();
  } catch (error) {
    console.error('Error fetching SQL functions:', error);
    errorMessage = 'Failed to load SQL functions. Please try again later.';
  }

  return (
    <div className="h-full w-full overflow-hidden flex flex-col">
      {errorMessage ? (
        <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 m-3 text-red-800 dark:text-red-200">
          {errorMessage}
        </div>
      ) : (
        <SqlFunctionsContainer initialFunctions={functionsData} />
      )}
    </div>
  );
} 