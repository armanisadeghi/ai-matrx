'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FieldBuilder } from '@/lib/redux/app-builder/types';
import { 
  getAllFieldComponents, 
  deleteFieldComponent, 
  duplicateFieldComponent,
  setFieldComponentPublic
} from '@/lib/redux/app-builder/service/fieldComponentService';

export default function FieldComponentsList() {
  const [components, setComponents] = useState<FieldBuilder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadComponents();
  }, []);

  const loadComponents = async () => {
    try {
      setLoading(true);
      const data = await getAllFieldComponents();
      setComponents(data);
      setError(null);
    } catch (err) {
      setError('Failed to load components');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this field component?')) return;
    
    try {
      await deleteFieldComponent(id);
      setComponents(components.filter(comp => comp.id !== id));
    } catch (err) {
      setError('Failed to delete component');
      console.error(err);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const newComponent = await duplicateFieldComponent(id);
      setComponents([...components, newComponent]);
    } catch (err) {
      setError('Failed to duplicate component');
      console.error(err);
    }
  };

  const handlePublicToggle = async (id: string, isPublic: boolean) => {
    try {
      await setFieldComponentPublic(id, isPublic);
      setComponents(components.map(comp => 
        comp.id === id ? { ...comp, isPublic } : comp
      ));
    } catch (err) {
      setError('Failed to update component visibility');
      console.error(err);
    }
  };

  const filteredComponents = components.filter(comp => 
    comp.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comp.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comp.component.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full p-4 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6">
        <h1 className="text-2xl font-bold mb-4 md:mb-0">Field Components Library</h1>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <input
            type="text"
            placeholder="Search components..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
          />
          
          <button
            onClick={() => router.push('/apps/builder/unified-concept/create')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded"
          >
            Create New
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : filteredComponents.length === 0 ? (
        <div className="text-center p-8 border-border rounded-lg">
          <p className="text-lg text-gray-600 dark:text-gray-400">
            {searchTerm 
              ? 'No components match your search' 
              : 'You haven\'t created any field components yet'}
          </p>
          <button
            onClick={() => router.push('/apps/builder/unified-concept/create')}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded"
          >
            Create Your First Component
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredComponents.map((component) => (
            <div 
              key={component.id} 
              className="border-border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-medium">{component.label}</h3>
                  <span className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 capitalize">
                    {component.component}
                  </span>
                </div>
                {component.description && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {component.description}
                  </p>
                )}
              </div>
              
              <div className="p-4">
                <div className="flex flex-wrap gap-2 mb-4">
                  {component.required && (
                    <span className="px-2 py-1 text-xs rounded bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
                      Required
                    </span>
                  )}
                  {component.includeOther && (
                    <span className="px-2 py-1 text-xs rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                      Has "Other" option (1)
                    </span>
                  )}
                </div>
                
                <div className="flex justify-between mt-2">
                  <div>
                    <button
                      onClick={() => router.push(`/apps/builder/unified-concept/edit/${component.id}`)}
                      className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDuplicate(component.id)}
                      className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded"
                    >
                      Duplicate
                    </button>
                  </div>
                  <button
                    onClick={() => handleDelete(component.id)}
                    className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-700 dark:text-red-300 rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 