// File Location: app/(authenticated)/demo/code-generator/components/ComponentGenerator.tsx

'use client';

import DynamicComponentRenderer from './DynamicComponentRenderer';
import React, { useState, useEffect } from 'react'; 
import AIAssistant from './AIAssistant';
import CodeEditor from './CodeEditor';
import ComponentManager from './ComponentManager';

// Main application component that orchestrates everything
const ComponentGenerator = () => {
  const [code, setCode] = useState('');
  const [savedComponents, setSavedComponents] = useState([]);
  const [currentComponentName, setCurrentComponentName] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Example initial code to help users get started
  const initialCode = `
// You can use React hooks and Tailwind CSS here
import { useState, useEffect } from "react";

function EnhancedCounter() {
  const [count, setCount] = useState(0);
  const [incrementAmount, setIncrementAmount] = useState(1);
  const [theme, setTheme] = useState("blue");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  
  // Update history when count changes
  useEffect(() => {
    if (count !== 0) {
      setHistory(prev => [...prev, count]);
    }
  }, [count]);
  
  // Handle count increment
  const handleIncrement = () => {
    setCount(count + incrementAmount);
  };
  
  // Handle count decrement
  const handleDecrement = () => {
    setCount(count - incrementAmount);
  };
  
  // Reset counter
  const handleReset = () => {
    setCount(0);
    setHistory([]);
  };
  
  // Toggle history display
  const toggleHistory = () => {
    setShowHistory(!showHistory);
  };
  
  // Change theme
  const toggleTheme = () => {
    setTheme(theme === "blue" ? "purple" : "blue");
  };
  
  // Theme-based styles
  const themeColors = {
    blue: {
      bg: "bg-blue-100 dark:bg-blue-900",
      button: "bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700",
      highlight: "text-blue-700 dark:text-blue-300"
    },
    purple: {
      bg: "bg-purple-100 dark:bg-purple-900",
      button: "bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700",
      highlight: "text-purple-700 dark:text-purple-300"
    }
  };
  
  return (
    <div className={\`p-6 \${themeColors[theme].bg} rounded-lg shadow-md transition-all duration-300 max-w-md\`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Enhanced Counter
        </h2>
        <button 
          onClick={toggleTheme}
          className={\`px-3 py-1 \${themeColors[theme].button} text-white rounded-full text-sm\`}
        >
          Switch Theme
        </button>
      </div>
      
      <div className="mb-6 text-center">
        <span className={\`text-5xl font-bold \${themeColors[theme].highlight}\`}>
          {count}
        </span>
      </div>
      
      <div className="flex justify-between gap-2 mb-4">
        <button 
          className={\`px-4 py-2 \${themeColors[theme].button} text-white rounded flex-1 flex items-center justify-center\`}
          onClick={handleDecrement}
        >
          <span className="text-xl">-</span>
        </button>
        
        <button 
          className={\`px-4 py-2 \${themeColors[theme].button} text-white rounded flex-1 flex items-center justify-center\`}
          onClick={handleIncrement}
        >
          <span className="text-xl">+</span>
        </button>
      </div>
      
      <div className="mb-4">
        <label className="block text-gray-700 dark:text-gray-300 mb-2 text-sm">
          Increment/Decrement Amount:
        </label>
        <input 
          type="range" 
          min="1" 
          max="10" 
          value={incrementAmount} 
          onChange={(e) => setIncrementAmount(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>1</span>
          <span>{incrementAmount}</span>
          <span>10</span>
        </div>
      </div>
      
      <div className="flex justify-between gap-2 mb-4">
        <button 
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex-1"
          onClick={handleReset}
        >
          Reset
        </button>
        
        <button 
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex-1"
          onClick={toggleHistory}
        >
          {showHistory ? "Hide" : "Show"} History
        </button>
      </div>
      
      {showHistory && (
        <div className="mt-4 p-3 bg-textured rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Count History:
          </h3>
          {history.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {history.map((value, index) => (
                <span 
                  key={index} 
                  className={\`px-2 py-1 text-xs text-white rounded \${themeColors[theme].button}\`}
                >
                  {value}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No history yet. Try changing the count!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
`.trim();
  
  useEffect(() => {
    // Initialize with example code
    if (!code) {
      setCode(initialCode);
    }
    
    // In a real app, you'd load saved components from your database here
    // For demo purposes, we'll use localStorage
    const loadSavedComponents = async () => {
      try {
        const saved = localStorage.getItem('savedComponents');
        if (saved) {
          setSavedComponents(JSON.parse(saved));
        }
      } catch (err) {
        console.error('Failed to load saved components:', err);
      }
    };
    
    loadSavedComponents();
  }, []);
  
  // Reset code to initial example
  const resetCode = () => {
    setCode(initialCode);
  };
  
  // Simulate AI code generation (in real app, this would call your AI service)
  const generateWithAI = async (prompt) => {
    setIsGenerating(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Example AI response based on prompt
    let suggestion = '';
    if (prompt.includes('counter')) {
      suggestion = `
import { useState } from "react";

function CounterComponent() {
  const [count, setCount] = useState(0);
  
  return (
    <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-xl shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Interactive Counter</h2>
      <div className="flex items-center justify-between max-w-xs mx-auto">
        <button 
          className="px-4 py-2 bg-red-500 dark:bg-red-600 text-white rounded-lg hover:bg-red-600 dark:hover:bg-red-700 transition-colors"
          onClick={() => setCount(prev => Math.max(0, prev - 1))}
        >
          -
        </button>
        <span className="text-3xl font-bold text-gray-700 dark:text-gray-300">{count}</span>
        <button 
          className="px-4 py-2 bg-green-500 dark:bg-green-600 text-white rounded-lg hover:bg-green-600 dark:hover:bg-green-700 transition-colors"
          onClick={() => setCount(prev => prev + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
        `;
    } else if (prompt.includes('form')) {
      suggestion = `
import { useState } from "react";

function FormComponent() {
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [submitted, setSubmitted] = useState(false);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    // Here you would typically send data to an API
  };
  
  return (
    <div className="p-6 bg-textured rounded-xl shadow-md">
      {submitted ? (
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold text-green-600 dark:text-green-500 mb-2">Form Submitted!</h2>
          <p className="text-gray-600 dark:text-gray-300">Thank you, {formData.name}.</p>
          <button
            className="mt-4 px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
            onClick={() => setSubmitted(false)}
          >
            Submit Another
          </button>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Contact Form</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
            >
              Submit
            </button>
          </form>
        </>
      )}
    </div>
  );
}
      `;
    } else {
      suggestion = `
import { useState } from "react";

function CustomComponent() {
  return (
    <div className="p-6 bg-gradient-to-r from-purple-400 to-pink-500 dark:from-purple-600 dark:to-pink-700 rounded-xl text-white shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Custom Component</h2>
      <p className="mb-4">This is a custom component generated based on your request.</p>
      <p className="italic text-sm">Try asking for specific features like a "counter" or "form"</p>
    </div>
  );
}
      `;
    }
    
    setAiSuggestion(suggestion);
    setIsGenerating(false);
  };
  
  // Apply AI suggestion to editor
  const applySuggestion = () => {
    setCode(aiSuggestion);
    setAiSuggestion('');
  };
  
  // Save current component to database
  const saveComponent = async () => {
    if (!currentComponentName.trim()) {
      alert('Please enter a name for your component');
      return;
    }
    // In a real app, you would save to your database
    // For demo purposes, we'll use localStorage
    const newComponent = {
      id: Date.now().toString(),
      name: currentComponentName,
      code: code
    };
    
    const updatedComponents = [...savedComponents, newComponent];
    setSavedComponents(updatedComponents);
    
    try {
      localStorage.setItem('savedComponents', JSON.stringify(updatedComponents));
      alert(`Component "${currentComponentName}" saved successfully!`);
      setCurrentComponentName('');
    } catch (err) {
      console.error('Failed to save component:', err);
      alert('Failed to save component');
    }
  };
  
  // Load a saved component into the editor
  const loadComponent = (component) => {
    setCode(component.code);
    setCurrentComponentName(component.name);
  };
  
  // Delete a saved component
  const deleteComponent = (id) => {
    const updatedComponents = savedComponents.filter(comp => comp.id !== id);
    setSavedComponents(updatedComponents);
    localStorage.setItem('savedComponents', JSON.stringify(updatedComponents));
  };
  
  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-800">
      <header className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-800 text-white p-3">
        <h1 className="text-2xl font-bold">AI-Powered React Component Generator</h1>
      </header>
      
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Panel: Component Editor and AI Assistant */}
        <div className="w-full md:w-1/2 flex flex-col border-r border-border">
          {/* AI Assistant Section */}
          <AIAssistant 
            generateWithAI={generateWithAI}
            isGenerating={isGenerating}
            aiSuggestion={aiSuggestion}
            applySuggestion={applySuggestion}
          />
          
          {/* Code Editor */}
          <CodeEditor 
            code={code}
            setCode={setCode}
            resetCode={resetCode}
          />
          
          {/* Save Component Section */}
          <ComponentManager
            currentComponentName={currentComponentName}
            setCurrentComponentName={setCurrentComponentName}
            saveComponent={saveComponent}
            savedComponents={savedComponents}
            loadComponent={loadComponent}
            deleteComponent={deleteComponent}
          />
        </div>
        
        <div className="h-full w-full md:w-1/2 flex flex-col">
            <DynamicComponentRenderer code={code} />
        </div>
      </div>
    </div>
  );
};

// Export the main component for use in the app
export default ComponentGenerator;
