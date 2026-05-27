'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { AppletLogic } from '@/utils/ts-function-registry/applet-utils';
import { registerDatabaseFunctions } from '@/utils/ts-function-registry/register-functions';
import { registerUtilityFunctions } from '@/utils/ts-function-registry/register-utility-functions';
import AppletRunner from '@/components/ts-function-registry/AppletRunner';
import AppletFunctionPicker from '@/components/ts-function-registry/AppletFunctionPicker';
import { FunctionDependencies } from '@/utils/ts-function-registry/function-registry';

export default function AppletDemoPage() {
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Initialize dependencies for the app
  const dependencies: FunctionDependencies = {
    supabase,
    // You can add more global dependencies here
    logger: console,
    localStorage: typeof window !== 'undefined' ? window.localStorage : null,
    fetch: typeof window !== 'undefined' ? window.fetch.bind(window) : null
  };
  
  // Initialize function registry once
  useEffect(() => {
    if (!isInitialized) {
      registerDatabaseFunctions();
      registerUtilityFunctions();
      setIsInitialized(true);
    }
  }, [isInitialized]);
  
  // Example applet that creates a schema template and then a table based on it
  const sampleApplet: AppletLogic = {
    id: 'demo-applet-1',
    name: 'Create Customer Table',
    description: 'Creates a schema template for customers and then creates a table based on it',
    steps: [
      {
        id: 'step1',
        type: 'function',
        functionName: 'createSchemaTemplate',
        title: 'Create Customer Schema Template',
        description: 'Define fields for customer data',
        parameters: {
          templateName: 'Customer Template',
          description: 'Template for customer information',
          fields: [
            {
              field_name: 'customer_name',
              display_name: 'Customer Name',
              data_type: 'string',
              field_order: 1,
              is_required: true
            },
            {
              field_name: 'email',
              display_name: 'Email Address',
              data_type: 'string',
              field_order: 2,
              is_required: true
            },
            {
              field_name: 'age',
              display_name: 'Age',
              data_type: 'integer',
              field_order: 3,
              is_required: false
            },
            {
              field_name: 'is_active',
              display_name: 'Active Customer',
              data_type: 'boolean',
              field_order: 4,
              is_required: false,
              default_value: true
            }
          ]
        }
      },
      {
        id: 'step2',
        type: 'function',
        functionName: 'createTable',
        title: 'Create Customer Table',
        description: 'Create a new table using the template',
        parameters: {
          tableName: 'customers_data',
          description: 'Table for storing customer information',
          isPublic: false,
          authenticatedRead: true,
          fields: [
            {
              field_name: 'customer_name',
              display_name: 'Customer Name',
              data_type: 'string',
              field_order: 1,
              is_required: true
            },
            {
              field_name: 'email',
              display_name: 'Email Address',
              data_type: 'string',
              field_order: 2,
              is_required: true
            },
            {
              field_name: 'age',
              display_name: 'Age',
              data_type: 'integer',
              field_order: 3,
              is_required: false
            },
            {
              field_name: 'is_active',
              display_name: 'Active Customer',
              data_type: 'boolean',
              field_order: 4,
              is_required: false,
              default_value: true
            }
          ]
        }
      },
      {
        id: 'step3',
        type: 'function',
        functionName: 'addRow',
        title: 'Add Sample Customer',
        description: 'Add a sample customer record',
        parameters: {
          tableId: '{{step2.tableId}}',
          data: {
            customer_name: 'John Doe',
            email: 'john.doe@example.com',
            age: 32,
            is_active: true
          }
        }
      }
    ]
  };

  // Example applet that demonstrates utility functions
  const utilityDemoApplet: AppletLogic = {
    id: 'utility-demo-applet',
    name: 'Utility Functions Demo',
    description: 'Demonstrates various utility functions like date formatting, string operations, and data conversion',
    steps: [
      {
        id: 'formatDate1',
        type: 'function',
        functionName: 'formatDate',
        title: 'Format Current Date',
        description: 'Format the current date with a specific pattern',
        parameters: {
          date: new Date().toISOString(),
          format: 'yyyy-MM-dd HH:mm:ss'
        }
      },
      {
        id: 'stringTransform1',
        type: 'function',
        functionName: 'stringTransform',
        title: 'Transform String',
        description: 'Convert a string to uppercase',
        parameters: {
          input: 'Hello World from Function Registry',
          transformation: 'uppercase'
        }
      },
      {
        id: 'validateEmail1',
        type: 'function',
        functionName: 'validateEmail',
        title: 'Validate Email',
        description: 'Check if an email address is valid',
        parameters: {
          email: 'user@example.com'
        }
      },
      {
        id: 'generateData1',
        type: 'function',
        functionName: 'generateRandomData',
        title: 'Generate Random Data',
        description: 'Generate random test data',
        parameters: {
          type: 'name',
          count: 3
        }
      },
      {
        id: 'calculateStats1',
        type: 'function',
        functionName: 'calculateStats',
        title: 'Calculate Statistics',
        description: 'Calculate statistics for a set of numbers',
        parameters: {
          numbers: [10, 25, 35, 45, 55, 65, 75, 85, 95]
        }
      }
    ]
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
        Function Registry Demo
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Function Explorer
          </h2>
          <div className="bg-textured p-4 rounded-lg shadow-md">
            <AppletFunctionPicker dependencies={dependencies} />
          </div>
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Sample Applets
          </h2>
          
          <div className="bg-textured p-4 rounded-lg shadow-md mb-8">
            <AppletRunner 
              applet={utilityDemoApplet} 
              customDependencies={dependencies}
            />
          </div>
          
          <div className="bg-textured p-4 rounded-lg shadow-md">
            <AppletRunner 
              applet={sampleApplet} 
              customDependencies={dependencies}
            />
          </div>
        </div>
      </div>
    </div>
  );
} 