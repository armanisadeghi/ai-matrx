'use client';

import { useState } from 'react';
import HtmlDisplay from "./HtmlDisplay";

export default function FetchReactPage() {
    const [htmlId, setHtmlId] = useState('');
    const [currentId, setCurrentId] = useState('');
    const [viewMode, setViewMode] = useState('rendered');
    const [htmlSource, setHtmlSource] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setCurrentId(htmlId);
        
        // Fetch the HTML source for code view
        if (htmlId) {
            fetch(`/api/html/${htmlId}`)
                .then(response => response.text())
                .then(data => {
                    setHtmlSource(data);
                })
                .catch(error => {
                    console.error('Error fetching HTML source:', error);
                    setHtmlSource('Error loading HTML source');
                });
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <div className="container mx-auto p-6 space-y-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">HTML Content Viewer</h1>
                
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={htmlId}
                        onChange={(e) => setHtmlId(e.target.value)}
                        placeholder="Enter HTML ID"
                        className="flex-1 px-4 py-2 bg-textured border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    />
                    <button 
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
                    >
                        Display
                    </button>
                </form>

                {currentId && (
                    <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-textured shadow-md w-full mx-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Content for ID: {currentId}</h2>
                            <div className="flex space-x-2">
                                <button 
                                    onClick={() => setViewMode('rendered')}
                                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${viewMode === 'rendered' ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                                >
                                    Rendered
                                </button>
                                <button 
                                    onClick={() => setViewMode('code')}
                                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${viewMode === 'code' ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                                >
                                    Code
                                </button>
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-md border-border min-h-[600px] overflow-auto">
                            {viewMode === 'rendered' ? (
                                <HtmlDisplay htmlId={currentId} />
                            ) : (
                                <div className="p-4 font-mono text-sm text-gray-800 dark:text-gray-200 whitespace-pre overflow-x-auto">
                                    <code>{htmlSource || 'Loading HTML source code...'}</code>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}