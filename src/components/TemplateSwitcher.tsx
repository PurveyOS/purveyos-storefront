import { useState } from 'react';

interface TemplateSwitcherProps {
  currentTemplate: string;
  onTemplateChange: (templateId: string) => void;
}

export function TemplateSwitcher({ currentTemplate, onTemplateChange }: TemplateSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);

  const templates = [
    { id: 'classic', name: 'Classic', description: 'Full-featured with hero and categories' },
    { id: 'minimal', name: 'Minimal', description: 'Clean and simple product focus' },
    { id: 'modern', name: 'Modern Farm', description: 'Barn2Door-style clean farm storefront' }
  ];

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="relative">
        {isOpen && (
          <div className="absolute bottom-16 right-0 bg-white rounded-lg shadow-xl border p-4 w-72">
            <h3 className="font-semibold text-gray-900 mb-3">Choose Template</h3>
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  onTemplateChange(template.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left p-3 rounded-lg border mb-2 transition-colors ${
                  currentTemplate === template.id
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{template.name}</div>
                <div className="text-sm text-gray-600">{template.description}</div>
              </button>
            ))}
          </div>
        )}
        
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors"
          title="Switch Template"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}