// TabContent.jsx
import React from 'react';

interface TabContentTab {
  key: string;
  label: React.ReactNode;
}

interface TabContentProps {
  tabs: TabContentTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  renderContent: () => React.ReactNode;
}

const TabContent = ({ tabs, activeTab, onTabChange, renderContent }: TabContentProps) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 font-medium ${
              activeTab === tab.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-blue-500'
            }`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {renderContent()}
      </div>
    </div>
  );
};

export default TabContent;