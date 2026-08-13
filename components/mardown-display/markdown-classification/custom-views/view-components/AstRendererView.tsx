import React from 'react';
import { FileText } from 'lucide-react';
import combinedProcessor, { OutputNode, AstNode } from '@/components/mardown-display/markdown-classification/processors/custom/combined-processor';

interface AstRendererProps {
  data: AstNode;
  className?: string;
  animated?: boolean;
  isLoading?: boolean;
}

interface NodeRendererProps {
  node: OutputNode;
  isRoot?: boolean;
  animated?: boolean;
}

const NodeRenderer: React.FC<NodeRendererProps> = ({ node, isRoot = false, animated = true }) => {
  const getDepthIndentation = (depth: number) => {
    if (depth <= 0) return '';
    return `ml-${Math.min(depth * 4, 16)}`;
  };

  const getTypeStyles = (type: string) => {
    const baseClasses = animated 
      ? "transition-all duration-300 ease-in-out hover:transform hover:translate-x-1" 
      : "transition-colors duration-200";
    
    switch (type) {
      case 'heading':
        return `${baseClasses} text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 pb-3 border-b-2 border-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 relative group`;
      
      case 'paragraph':
        return `${baseClasses} text-gray-800 dark:text-gray-200 leading-loose mb-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/30`;
      
      case 'text - paragraph':
        return `${baseClasses} text-gray-800 dark:text-gray-200 leading-relaxed mb-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800/20`;
      
      case 'text - strong':
      case 'strong':
        return `${baseClasses} font-semibold text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 px-1 rounded`;
      
      case 'text - emphasis':
      case 'emphasis':
        return `${baseClasses} italic text-purple-700 dark:text-purple-300`;
        
      case 'text':
        return `${baseClasses} text-gray-700 dark:text-gray-300`;
      
      case 'text - tableCell':
      case 'text - strong - tableCell':
        return `${baseClasses} px-4 py-2 border border-border`;
        
      default:
        if (type.startsWith('listItem')) {
          return `${baseClasses} text-gray-800 dark:text-gray-200 mb-3 flex items-start group hover:bg-gray-50 dark:hover:bg-gray-800/30 p-2 rounded-lg`;
        }
        return `${baseClasses} text-gray-700 dark:text-gray-300 p-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800/20`;
    }
  };

  const renderListItem = (node: OutputNode) => {
    const bullet = (
      <span className="relative flex items-center justify-center w-3 h-3 mr-4 mt-1.5 flex-shrink-0">
        <span className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 rounded-full opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200" />
        <span className="relative w-1.5 h-1.5 bg-textured rounded-full" />
      </span>
    );
    
    return (
      <div className={`${getTypeStyles(node.type)} ${getDepthIndentation(node.depth || 0)}`}>
        {bullet}
        <div className="flex-1 min-w-0">
          {node.content && (
            <span className={`${node.type.includes('strong') ? 'font-semibold text-gray-900 dark:text-gray-100' : ''} break-words text-base`}>
              {node.content}
            </span>
          )}
          {node.children && node.children.length > 0 && (
            <div className="mt-1 space-y-1 text-base font-normal">
              {node.children.map((child, index) => (
                <NodeRenderer key={index} node={child} animated={animated} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHeading = (node: OutputNode) => {
    const level = node.depth ? Math.min(node.depth + 1, 6) : 2;
    const HeadingTag = `h${level}` as `h${1 | 2 | 3 | 4 | 5 | 6}`;

    const sizeClasses: Record<`h${1 | 2 | 3 | 4 | 5 | 6}`, string> = {
      h1: 'text-4xl mb-6',
      h2: 'text-3xl mb-5',
      h3: 'text-2xl mb-4',
      h4: 'text-xl mb-4',
      h5: 'text-lg mb-3',
      h6: 'text-base mb-3'
    };
    
    return (
      <div className={`${getTypeStyles(node.type)} ${getDepthIndentation(node.depth || 0)}`}>
        {React.createElement(
          HeadingTag,
          {
            className: `${sizeClasses[HeadingTag]} group-hover:text-blue-600 dark:group-hover:text-blue-400 relative`
          },
          <>
            {node.content}
            <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 group-hover:w-full transition-all duration-500" />
          </>
        )}
        {node.children && node.children.length > 0 && (
          <div className="mt-4 ml-4 space-y-2 text-base font-normal">
            {node.children.map((child, index) => (
              <NodeRenderer key={index} node={child} animated={animated} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderTableCell = (node: OutputNode) => {
    const isHeader = node.type.includes('strong');
    
    return React.createElement(
      isHeader ? 'th' : 'td',
      {
        className: getTypeStyles(node.type)
      },
      node.content
    );
  };

  if (node.type === 'skip') {
    return null;
  }

  if (node.type.startsWith('listItem')) {
    return renderListItem(node);
  }

  if (node.type === 'heading') {
    return renderHeading(node);
  }

  if (node.type.includes('tableCell')) {
    return renderTableCell(node);
  }

  if (node.type === 'text - strong' || node.type === 'strong') {
    return (
      <strong className={`${getTypeStyles(node.type)} text-base`}>
        {node.content}
        {node.children && node.children.length > 0 && (
          <span className="font-normal">
            {node.children.map((child, index) => (
              <NodeRenderer key={index} node={child} animated={animated} />
            ))}
          </span>
        )}
      </strong>
    );
  }

  if (node.type === 'text - emphasis' || node.type === 'emphasis') {
    return (
      <em className={`${getTypeStyles(node.type)} text-base`}>
        {node.content}
        {node.children && node.children.length > 0 && (
          <span className="font-normal">
            {node.children.map((child, index) => (
              <NodeRenderer key={index} node={child} animated={animated} />
            ))}
          </span>
        )}
      </em>
    );
  }

  if (node.type === 'paragraph' || node.type === 'text - paragraph') {
    return (
      <div className={`${getTypeStyles(node.type)} ${getDepthIndentation(node.depth || 0)}`}>
        <span className="break-words text-base">{node.content}</span>
        {node.children && node.children.length > 0 && (
          <div className="mt-3 space-y-2 text-base font-normal">
            {node.children.map((child, index) => (
              <NodeRenderer key={index} node={child} animated={animated} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default text rendering
  return (
    <div className={`${getTypeStyles(node.type)} ${getDepthIndentation(node.depth || 0)} text-base`}>
      {node.content && <span className="break-words">{node.content}</span>}
      {node.children && node.children.length > 0 && (
        <span className="inline-flex flex-wrap items-center">
          {node.children.map((child, index) => (
            <NodeRenderer key={index} node={child} animated={animated} />
          ))}
        </span>
      )}
    </div>
  );
};

const AstRenderer: React.FC<AstRendererProps> = ({ 
  data, 
  className = '', 
  animated = true,
  isLoading = false
}) => {
  const processedNodes = combinedProcessor({ ast: data });

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 ${className}`}>
        <div className="text-center">
          <div className="text-2xl mb-2">⏳</div>
          <div className="text-gray-500 dark:text-gray-400">Loading content...</div>
        </div>
      </div>
    );
  }

  if (!processedNodes || processedNodes.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 ${className}`}>
        <div className="text-center">
          <FileText className="mx-auto mb-2 size-6" aria-hidden="true" />
          <div>No content to display</div>
        </div>
      </div>
    );
  }

  return (
    <article className={`prose prose-gray dark:prose-invert max-w-none ${className}`}>
      <div className="bg-textured rounded-xl shadow-lg dark:shadow-gray-800/20 p-6 md:p-8 space-y-6 border-border">
        {processedNodes.map((node, index) => (
          <NodeRenderer 
            key={index} 
            node={node} 
            isRoot={true} 
            animated={animated}
          />
        ))}
      </div>
    </article>
  );
};

export default AstRenderer;
