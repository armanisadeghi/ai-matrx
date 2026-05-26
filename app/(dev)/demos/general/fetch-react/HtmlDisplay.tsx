'use client';

import React, { useState, useEffect } from 'react';

function HtmlDisplay({ htmlId }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (htmlId) {
      setIsLoading(true);
      // Use relative URL to call our own API route
      fetch(`/api/html/${htmlId}`)
        .then(response => {
          if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
          return response.text();
        })
        .then(data => {
          setHtml(data);
          setIsLoading(false);
        })
        .catch(error => {
          console.error('Error fetching HTML:', error);
          setError(error.message);
          setIsLoading(false);
        });
    }
  }, [htmlId]);

  if (error) return <div className="p-4 text-red-600 dark:text-red-400">Error: {error}</div>;
  if (isLoading) return <div className="p-4 flex justify-center items-center h-[400px] text-gray-600 dark:text-gray-400">Loading...</div>;
  if (!html && !isLoading) return <div className="p-4 flex justify-center items-center h-[400px] text-gray-600 dark:text-gray-400">No content to display</div>;

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export default HtmlDisplay;