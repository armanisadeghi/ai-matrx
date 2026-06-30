'use client';

import { registerFunction, FunctionDependencies } from './function-registry';
import { extractErrorMessage } from '@/utils/errors';

/**
 * Register utility functions that don't need external dependencies
 */
export function registerUtilityFunctions() {
  // Format Date
  registerFunction(
    {
      name: 'formatDate',
      displayName: 'Format Date',
      description: 'Format a date using specified format',
      category: 'Utilities',
      parameters: [
        {
          name: 'date',
          type: 'string',
          description: 'Date string or ISO date',
          required: true
        },
        {
          name: 'format',
          type: 'string',
          description: 'Format pattern (e.g., "yyyy-MM-dd")',
          required: false,
          defaultValue: 'yyyy-MM-dd'
        }
      ],
      returnType: 'string'
    },
    async (params: Record<string, any>) => {
      try {
        const date = new Date(params.date);
        
        // Very simple formatting implementation
        const format = params.format || 'yyyy-MM-dd';
        
        // Return ISO string if we can't parse the date
        if (isNaN(date.getTime())) {
          return params.date;
        }
        
        // Simple formatting logic
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        
        return format
          .replace('yyyy', year.toString())
          .replace('MM', month)
          .replace('dd', day)
          .replace('HH', hours)
          .replace('mm', minutes)
          .replace('ss', seconds);
      } catch (err) {
        return params.date; // Return original if formatting fails
      }
    },
    [] // No dependencies needed
  );

  // String Transformation
  registerFunction(
    {
      name: 'stringTransform',
      displayName: 'Transform String',
      description: 'Apply common transformations to a string',
      category: 'Utilities',
      parameters: [
        {
          name: 'input',
          type: 'string',
          description: 'Input string to transform',
          required: true
        },
        {
          name: 'transformation',
          type: 'string',
          description: 'Type of transformation: uppercase, lowercase, capitalize, trim, slugify',
          required: true
        }
      ],
      returnType: 'string'
    },
    async (params: Record<string, any>) => {
      const { input, transformation } = params;
      
      if (!input) return '';
      
      switch(transformation) {
        case 'uppercase': return input.toUpperCase();
        case 'lowercase': return input.toLowerCase();
        case 'capitalize': return input.replace(/\b\w/g, c => c.toUpperCase());
        case 'trim': return input.trim();
        case 'slugify': return input.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
        default: return input;
      }
    },
    []
  );

  // Email Validation
  registerFunction(
    {
      name: 'validateEmail',
      displayName: 'Validate Email',
      description: 'Check if a string is a valid email address',
      category: 'Validation',
      parameters: [
        {
          name: 'email',
          type: 'string',
          description: 'Email address to validate',
          required: true
        }
      ],
      returnType: 'object'
    },
    async (params: Record<string, any>) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValid = emailRegex.test(params.email);
      
      return {
        isValid,
        message: isValid ? 'Valid email' : 'Invalid email format'
      };
    },
    []
  );

  // JSON to CSV Conversion (Simple Implementation)
  registerFunction(
    {
      name: 'convertData',
      displayName: 'Convert Data Format',
      description: 'Convert data between different formats',
      category: 'Utilities',
      parameters: [
        {
          name: 'input',
          type: 'string',
          description: 'Input data to convert',
          required: true
        },
        {
          name: 'fromFormat',
          type: 'string',
          description: 'Source format (json, csv)',
          required: true
        },
        {
          name: 'toFormat',
          type: 'string',
          description: 'Target format (json, csv)',
          required: true
        }
      ],
      returnType: 'string'
    },
    async (params: Record<string, any>) => {
      // Simple JSON to CSV conversion
      if (params.fromFormat === 'json' && params.toFormat === 'csv') {
        try {
          const jsonData = JSON.parse(params.input);
          if (!Array.isArray(jsonData) || jsonData.length === 0) {
            return 'Input must be a non-empty array of objects';
          }
          
          // Extract headers
          const headers = Object.keys(jsonData[0] || {});
          
          // Build CSV
          const csv = [
            headers.join(','),
            ...jsonData.map(row => 
              headers.map(field => {
                const val = row[field];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
                return val;
              }).join(',')
            )
          ].join('\n');
          
          return csv;
        } catch (err) {
          return `Error converting data: ${extractErrorMessage(err)}`;
        }
      }
      
      // Simple CSV to JSON conversion
      if (params.fromFormat === 'csv' && params.toFormat === 'json') {
        try {
          const lines = params.input.split('\n');
          if (lines.length < 2) {
            return 'Input must have at least a header row and one data row';
          }
          
          const headers = lines[0].split(',').map(h => h.trim());
          const result: Record<string, string | number | boolean>[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',');
            const obj: Record<string, string | number | boolean> = {};
            
            headers.forEach((header, index) => {
              let value = values[index] ? values[index].trim() : '';
              
              // Handle quoted values
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1).replace(/""/g, '"');
              }
              
              // Try to convert numeric values
              if (!isNaN(Number(value)) && value !== '') {
                obj[header] = Number(value);
              } else if (value === 'true') {
                obj[header] = true;
              } else if (value === 'false') {
                obj[header] = false;
              } else {
                obj[header] = value;
              }
            });
            
            result.push(obj);
          }
          
          return JSON.stringify(result, null, 2);
        } catch (err) {
          return `Error converting data: ${extractErrorMessage(err)}`;
        }
      }
      
      return 'Conversion not supported. Supported conversions: json->csv, csv->json';
    },
    []
  );

  // Array Filter Function
  registerFunction(
    {
      name: 'filterArray',
      displayName: 'Filter Array',
      description: 'Filter an array based on a property value',
      category: 'Arrays',
      parameters: [
        {
          name: 'array',
          type: 'array',
          description: 'Array of objects to filter',
          required: true
        },
        {
          name: 'property',
          type: 'string',
          description: 'Property name to filter on',
          required: true
        },
        {
          name: 'operator',
          type: 'string',
          description: 'Comparison operator (equals, notEquals, contains, greaterThan, lessThan)',
          required: true
        },
        {
          name: 'value',
          type: 'string',
          description: 'Value to compare against',
          required: true
        }
      ],
      returnType: 'array'
    },
    async (params: Record<string, any>) => {
      const { array, property, operator, value } = params;
      
      if (!Array.isArray(array)) {
        return { error: 'Input is not an array' };
      }
      
      return array.filter(item => {
        if (!item || typeof item !== 'object') return false;
        
        const itemValue = item[property];
        
        switch(operator) {
          case 'equals': return itemValue == value;
          case 'notEquals': return itemValue != value;
          case 'contains': 
            if (typeof itemValue === 'string') {
              return itemValue.includes(value);
            }
            return String(itemValue).includes(value);
          case 'greaterThan': return Number(itemValue) > Number(value);
          case 'lessThan': return Number(itemValue) < Number(value);
          default: return true;
        }
      });
    },
    []
  );

  // Calculate Statistics
  registerFunction(
    {
      name: 'calculateStats',
      displayName: 'Calculate Statistics',
      description: 'Calculate common statistics for an array of numbers',
      category: 'Math',
      parameters: [
        {
          name: 'numbers',
          type: 'array',
          description: 'Array of numbers to analyze',
          required: true
        }
      ],
      returnType: 'object'
    },
    async (params: Record<string, any>) => {
      if (!Array.isArray(params.numbers)) {
        return { error: 'Input is not an array' };
      }
      
      const numbers = params.numbers.map(Number).filter(n => !isNaN(n));
      
      if (numbers.length === 0) {
        return { error: 'No valid numbers provided' };
      }
      
      const sum = numbers.reduce((a, b) => a + b, 0);
      const mean = sum / numbers.length;
      const sorted = [...numbers].sort((a, b) => a - b);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length/2] + sorted[sorted.length/2 - 1]) / 2
        : sorted[Math.floor(sorted.length/2)];
      
      // Calculate standard deviation
      const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
      const stdDev = Math.sqrt(variance);
      
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      
      return {
        count: numbers.length,
        sum,
        mean,
        median,
        min,
        max,
        range: max - min,
        stdDev,
        variance
      };
    },
    []
  );

  // Generate Random Data
  registerFunction(
    {
      name: 'generateRandomData',
      displayName: 'Generate Random Data',
      description: 'Generate random test data of various types',
      category: 'Utilities',
      parameters: [
        {
          name: 'type',
          type: 'string',
          description: 'Type of data to generate (uuid, name, email, number, date, boolean, color)',
          required: true
        },
        {
          name: 'count',
          type: 'number',
          description: 'Number of items to generate (for array results)',
          required: false,
          defaultValue: 1
        },
        {
          name: 'options',
          type: 'object',
          description: 'Additional options specific to the data type',
          required: false
        }
      ],
      returnType: 'any'
    },
    async (params: Record<string, any>) => {
      const { type, count = 1, options = {} } = params;
      const results: (string | number | boolean)[] = [];
      
      for (let i = 0; i < count; i++) {
        switch(type) {
          case 'uuid':
            results.push(`${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`);
            break;
          case 'name':
            const firstNames = ['John', 'Jane', 'Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona', 'George', 'Helen'];
            const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Clark'];
            results.push(`${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`);
            break;
          case 'email':
            const domains = ['example.com', 'test.org', 'sample.net', 'demo.io', 'mailtest.xyz'];
            const username = `user${Math.floor(Math.random() * 10000)}`;
            results.push(`${username}@${domains[Math.floor(Math.random() * domains.length)]}`);
            break;
          case 'number':
            const min = options.min || 0;
            const max = options.max || 100;
            results.push(Math.floor(Math.random() * (max - min + 1)) + min);
            break;
          case 'date':
            const now = new Date();
            const pastDays = options.pastDays || 365;
            const date = new Date(now.getTime() - Math.random() * pastDays * 24 * 60 * 60 * 1000);
            results.push(date.toISOString());
            break;
          case 'boolean':
            results.push(Math.random() >= 0.5);
            break;
          case 'color':
            results.push(`#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`);
            break;
          default:
            results.push(`Unsupported type: ${type}`);
        }
      }
      
      return count === 1 ? results[0] : results;
    },
    []
  );

  // HTTP Request (with fetch dependency)
  registerFunction(
    {
      name: 'httpRequest',
      displayName: 'HTTP Request',
      description: 'Make HTTP requests to external APIs',
      category: 'Network',
      parameters: [
        {
          name: 'url',
          type: 'string',
          description: 'URL to request',
          required: true
        },
        {
          name: 'method',
          type: 'string',
          description: 'HTTP method (GET, POST, PUT, DELETE)',
          required: false,
          defaultValue: 'GET'
        },
        {
          name: 'headers',
          type: 'object',
          description: 'HTTP headers to include',
          required: false
        },
        {
          name: 'body',
          type: 'object',
          description: 'Request body for POST/PUT requests',
          required: false
        }
      ],
      returnType: 'object'
    },
    async (params: Record<string, any>, dependencies: FunctionDependencies) => {
      const { url, method = 'GET', headers = {}, body } = params;
      
      if (!dependencies.fetch) {
        return { error: 'Fetch dependency not available' };
      }
      
      try {
        const response = await dependencies.fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: body ? JSON.stringify(body) : undefined
        });
        
        const isJson = response.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await response.json() : await response.text();
        
        return {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText,
          data
        };
      } catch (err) {
        return {
          error: extractErrorMessage(err)
        };
      }
    },
    ['fetch'] // Requires fetch dependency
  );

  // Local Storage Operations
  registerFunction(
    {
      name: 'storageOperation',
      displayName: 'Storage Operation',
      description: 'Interact with browser localStorage or a compatible storage',
      category: 'Browser',
      parameters: [
        {
          name: 'operation',
          type: 'string',
          description: 'Operation type (get, set, remove, clear)',
          required: true
        },
        {
          name: 'key',
          type: 'string',
          description: 'Storage key',
          required: false
        },
        {
          name: 'value',
          type: 'string',
          description: 'Value to store (for set operation)',
          required: false
        }
      ],
      returnType: 'any'
    },
    async (params: Record<string, any>, dependencies: FunctionDependencies) => {
      const { operation, key, value } = params;
      
      if (!dependencies.localStorage) {
        return { error: 'localStorage dependency not available' };
      }
      
      const storage = dependencies.localStorage;
      
      switch(operation) {
        case 'get':
          try {
            const storedValue = storage.getItem(key);
            if (!storedValue) return null;
            
            try {
              return JSON.parse(storedValue);
            } catch {
              return storedValue;
            }
          } catch (e) {
            return { error: extractErrorMessage(e) };
          }
        case 'set':
          try {
            const valueToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
            storage.setItem(key, valueToStore);
            return { success: true, key, value };
          } catch (e) {
            return { error: extractErrorMessage(e) };
          }
        case 'remove':
          try {
            storage.removeItem(key);
            return { success: true, key };
          } catch (e) {
            return { error: extractErrorMessage(e) };
          }
        case 'clear':
          try {
            storage.clear();
            return { success: true };
          } catch (e) {
            return { error: extractErrorMessage(e) };
          }
        case 'keys':
          try {
            const keys: string[] = [];
            for (let i = 0; i < storage.length; i++) {
              const key = storage.key(i);
              if (key) keys.push(key);
            }
            return keys;
          } catch (e) {
            return { error: extractErrorMessage(e) };
          }
        default:
          return { error: 'Invalid operation', validOperations: ['get', 'set', 'remove', 'clear', 'keys'] };
      }
    },
    ['localStorage'] // Requires localStorage dependency
  );

  // Array Operations
  registerFunction(
    {
      name: 'arrayOperation',
      displayName: 'Array Operation',
      description: 'Perform common operations on arrays',
      category: 'Arrays',
      parameters: [
        {
          name: 'operation',
          type: 'string',
          description: 'Operation type (sort, map, reduce, unique, groupBy)',
          required: true
        },
        {
          name: 'array',
          type: 'array',
          description: 'Input array',
          required: true
        },
        {
          name: 'options',
          type: 'object',
          description: 'Additional options for the operation',
          required: false
        }
      ],
      returnType: 'any'
    },
    async (params: Record<string, any>) => {
      const { operation, array, options = {} } = params;
      
      if (!Array.isArray(array)) {
        return { error: 'Input is not an array' };
      }
      
      switch(operation) {
        case 'sort': {
          const { property, direction = 'asc' } = options;
          if (property) {
            // Sort array of objects by property
            return [...array].sort((a, b) => {
              if (a[property] < b[property]) return direction === 'asc' ? -1 : 1;
              if (a[property] > b[property]) return direction === 'asc' ? 1 : -1;
              return 0;
            });
          } else {
            // Sort array of primitives
            return [...array].sort((a, b) => {
              if (a < b) return direction === 'asc' ? -1 : 1;
              if (a > b) return direction === 'asc' ? 1 : -1;
              return 0;
            });
          }
        }
        
        case 'map': {
          const { property } = options;
          if (!property) return { error: 'Property required for map operation' };
          return array.map(item => item[property]);
        }
        
        case 'reduce': {
          const { initialValue = 0, property } = options;
          if (property) {
            return array.reduce((acc, item) => acc + (Number(item[property]) || 0), initialValue);
          } else {
            return array.reduce((acc, item) => acc + (Number(item) || 0), initialValue);
          }
        }
        
        case 'unique': {
          const { property } = options;
          if (property) {
            // Unique values by object property
            const seen = new Set();
            return array.filter(item => {
              const value = item[property];
              if (seen.has(value)) return false;
              seen.add(value);
              return true;
            });
          } else {
            // Unique primitive values
            return [...new Set(array)];
          }
        }
        
        case 'groupBy': {
          const { property } = options;
          if (!property) return { error: 'Property required for groupBy operation' };
          
          const result = {};
          array.forEach(item => {
            const key = item[property];
            if (!result[key]) result[key] = [];
            result[key].push(item);
          });
          
          return result;
        }
        
        default:
          return { error: 'Invalid operation', validOperations: ['sort', 'map', 'reduce', 'unique', 'groupBy'] };
      }
    },
    []
  );

  // JSON Utilities
  registerFunction(
    {
      name: 'jsonUtility',
      displayName: 'JSON Utility',
      description: 'Perform various operations on JSON objects',
      category: 'Utilities',
      parameters: [
        {
          name: 'operation',
          type: 'string',
          description: 'Operation type (merge, pick, omit, flatten, unflatten)',
          required: true
        },
        {
          name: 'input',
          type: 'object',
          description: 'Main input object',
          required: true
        },
        {
          name: 'options',
          type: 'object',
          description: 'Additional options for the operation',
          required: false
        }
      ],
      returnType: 'any'
    },
    async (params: Record<string, any>) => {
      const { operation, input, options = {} } = params;
      
      if (!input || typeof input !== 'object') {
        return { error: 'Input must be an object' };
      }
      
      switch(operation) {
        case 'merge': {
          const { source } = options;
          if (!source || typeof source !== 'object') {
            return { error: 'Source object required for merge operation' };
          }
          return { ...input, ...source };
        }
        
        case 'pick': {
          const { properties } = options;
          if (!Array.isArray(properties)) {
            return { error: 'Properties array required for pick operation' };
          }
          
          const result = {};
          properties.forEach(prop => {
            if (input.hasOwnProperty(prop)) {
              result[prop] = input[prop];
            }
          });
          
          return result;
        }
        
        case 'omit': {
          const { properties } = options;
          if (!Array.isArray(properties)) {
            return { error: 'Properties array required for omit operation' };
          }
          
          const result = { ...input };
          properties.forEach(prop => {
            delete result[prop];
          });
          
          return result;
        }
        
        case 'flatten': {
          const result = {};
          
          function flattenObj(obj, prefix = '') {
            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                const newKey = prefix ? `${prefix}.${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                  flattenObj(obj[key], newKey);
                } else {
                  result[newKey] = obj[key];
                }
              }
            }
          }
          
          flattenObj(input);
          return result;
        }
        
        case 'unflatten': {
          const result = {};
          
          Object.keys(input).forEach(key => {
            const parts = key.split('.');
            let current = result;
            
            for (let i = 0; i < parts.length - 1; i++) {
              if (!current[parts[i]]) {
                current[parts[i]] = {};
              }
              current = current[parts[i]];
            }
            
            current[parts[parts.length - 1]] = input[key];
          });
          
          return result;
        }
        
        default:
          return { error: 'Invalid operation', validOperations: ['merge', 'pick', 'omit', 'flatten', 'unflatten'] };
      }
    },
    []
  );
} 