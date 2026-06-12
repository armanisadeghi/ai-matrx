"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlertTriangle } from 'lucide-react';

export default function ErrorPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="max-w-md w-full p-8 bg-textured rounded-lg shadow-lg text-center">
        <div className="flex items-center justify-center mb-6">
          <Image src="/matrx/matrx-icon.svg" width={36} height={36} alt="AI Matrx Logo" className="mr-2" />
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">AI Matrx</h2>
        </div>
        
        <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-6" />
        
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-2">
          Oops! Something went wrong
        </h1>
        
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          We apologize for the inconvenience. Please try again later or navigate to one of our pages below.
        </p>
        
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-4">
          <Link href="/">
            <span className="inline-block w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors">
              Home
            </span>
          </Link>
          
          <Link href="/sign-up">
            <span className="inline-block w-full sm:w-auto px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-md transition-colors">
              Sign Up
            </span>
          </Link>
        </div>
        
        <Link href="/login">
          <span className="inline-block text-blue-600 dark:text-blue-400 hover:underline">
            Already have an account? Log in
          </span>
        </Link>
      </div>
    </div>
  );
}