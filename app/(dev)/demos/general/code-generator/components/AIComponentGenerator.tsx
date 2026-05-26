import React, { useState, useEffect } from 'react';
import { LiveProvider, LiveEditor, LiveError, LivePreview } from 'react-live';
// https://claude.ai/chat/605ded88-310b-4fd3-a022-afade12bba77

const AIComponentGenerator = () => {
  const [code, setCode] = useState('');
  const [savedComponents, setSavedComponents] = useState([]);
  const [currentComponentName, setCurrentComponentName] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Example initial code to help users get started
  const initialCode = `
// You can use React hooks and Tailwind CSS here
function MyComponent() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div className="p-4 bg-blue-100 rounded-lg">
      <h2 className="text-xl font-bold mb-4">Hello from My Component!</h2>
      <p className="mb-2">You clicked the button {count} times</p>
      <button 
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        onClick={() => setCount(count + 1)}
      >
        Click me
      </button>
    </div>
  );
}

// This component will be rendered in the preview
render(<MyComponent />);
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

  // Simulate AI code generation (in real app, this would call your AI service)
  const generateWithAI = async (prompt) => {
    setIsGenerating(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Example AI response based on prompt
    let suggestion = '';
    if (prompt.includes('counter')) {
      suggestion = `
function CounterComponent() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div className="p-6 bg-gray-100 rounded-xl shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Interactive Counter</h2>
      <div className="flex items-center justify-between max-w-xs mx-auto">
        <button 
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          onClick={() => setCount(prev => Math.max(0, prev - 1))}
        >
          -
        </button>
        <span className="text-3xl font-bold text-gray-700">{count}</span>
        <button 
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          onClick={() => setCount(prev => prev + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

render(<CounterComponent />);
      `;
    } else if (prompt.includes('form')) {
      suggestion = `
function FormComponent() {
  const [formData, setFormData] = React.useState({ name: '', email: '' });
  const [submitted, setSubmitted] = React.useState(false);
  
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
    <div className="p-6 bg-white rounded-xl shadow-md">
      {submitted ? (
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold text-green-600 mb-2">Form Submitted!</h2>
          <p className="text-gray-600">Thank you, {formData.name}.</p>
          <button
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg"
            onClick={() => setSubmitted(false)}
          >
            Submit Another
          </button>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Contact Form</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-700 mb-1">Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Submit
            </button>
          </form>
        </>
      )}
    </div>
  );
}

render(<FormComponent />);
      `;
    } else {
      suggestion = `
function CustomComponent() {
  return (
    <div className="p-6 bg-gradient-to-r from-purple-400 to-pink-500 rounded-xl text-white shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Custom Component</h2>
      <p className="mb-4">This is a custom component generated based on your request.</p>
      <p className="italic text-sm">Try asking for specific features like a "counter" or "form"</p>
    </div>
  );
}

render(<CustomComponent />);
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
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
        <h1 className="text-2xl font-bold">AI-Powered React Component Generator</h1>
        <p className="text-sm opacity-80">
          Create, test, and save custom React components with AI assistance
        </p>
      </header>
      
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Panel: Component Editor and AI Assistant */}
        <div className="w-full md:w-1/2 flex flex-col border-r border-gray-200">
          {/* AI Assistant Section */}
          <div className="bg-white p-4 border-b border-gray-200">
            <h2 className="font-bold text-lg mb-2">AI Assistant</h2>
            <div className="flex space-x-2 mb-3">
              <input
                type="text"
                placeholder="Describe what you want to create..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                onKeyDown={(e) => e.key === 'Enter' && generateWithAI((e.target as HTMLInputElement).value)}
              />
              <button
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300"
                onClick={(e) => generateWithAI(((e.target as HTMLElement).previousElementSibling as HTMLInputElement).value)}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
            
            {aiSuggestion && (
              <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-md">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-purple-700">AI Suggestion</h3>
                  <button
                    className="px-3 py-1 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700"
                    onClick={applySuggestion}
                  >
                    Apply
                  </button>
                </div>
                <pre className="text-xs text-gray-600 max-h-40 overflow-auto">
                  {aiSuggestion.slice(0, 150)}...
                </pre>
              </div>
            )}
          </div>
          
          {/* Code Editor */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="bg-gray-100 p-2 flex justify-between items-center">
              <h2 className="font-semibold">Code Editor</h2>
              <button 
                className="px-2 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                onClick={() => setCode(initialCode)}
              >
                Reset
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <LiveProvider code={code} noInline={true}>
                <LiveEditor 
                  className="min-h-full font-mono text-sm p-4" 
                  onChange={setCode}
                  style={{ fontFamily: 'monospace' }}
                />
              </LiveProvider>
            </div>
          </div>
          
          {/* Save Component Section */}
          <div className="bg-white p-4 border-t border-gray-200">
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Component name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                value={currentComponentName}
                onChange={(e) => setCurrentComponentName(e.target.value)}
              />
              <button
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                onClick={saveComponent}
              >
                Save
              </button>
            </div>
          </div>
        </div>
        
        {/* Right Panel: Preview and Saved Components */}
        <div className="w-full md:w-1/2 flex flex-col">
          {/* Component Preview */}
          <div className="flex-1 overflow-auto flex flex-col">
            <div className="bg-gray-100 p-2">
              <h2 className="font-semibold">Live Preview</h2>
            </div>
            <div className="flex-1 p-4 overflow-auto bg-white">
              <LiveProvider code={code} noInline={true}>
                <LiveError className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md mb-4" />
                <LivePreview className="p-4 border-border rounded-md" />
              </LiveProvider>
            </div>
          </div>
          
          {/* Saved Components */}
          <div className="bg-white border-t border-gray-200">
            <div className="bg-gray-100 p-2">
              <h2 className="font-semibold">Saved Components</h2>
            </div>
            <div className="max-h-60 overflow-auto p-2">
              {savedComponents.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No saved components yet</p>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {savedComponents.map((component) => (
                    <li key={component.id} className="py-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{component.name}</span>
                        <div>
                          <button
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded mr-2"
                            onClick={() => loadComponent(component)}
                          >
                            Load
                          </button>
                          <button
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded"
                            onClick={() => deleteComponent(component.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIComponentGenerator;