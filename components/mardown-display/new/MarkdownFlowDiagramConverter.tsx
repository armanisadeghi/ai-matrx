'use client';

import React, { useState, useEffect } from 'react';
import { extractErrorMessage } from '@/utils/errors';

type ParsedNode = {
  id: string;
  name: string;
  description: string;
  lineIndex: number;
};

type ParsedConnection = {
  source: string;
  target: string;
  type: 'vertical' | 'branch';
};

const MarkdownFlowDiagramConverter = () => {
  const [markdownInput, setMarkdownInput] = useState(`+-------------------+
|   AiClientFacade  |  <--- Single entry point for all API calls
+-------------------+
          |
          v
+-------------------+
|  ConfigProcessor  |  <--- Normalizes and validates input config
+-------------------+
          |
          v
+-------------------+
|  ProviderManager  |  <--- Routes to provider-specific handler
+-------------------+
          |                    +-------------------+
          +------------------> |   BaseProvider    |  <--- Abstract base for providers
          |                    +-------------------+
          |                            |
          |                            v
          |                    +-------------------+
          +------------------> |  OpenAIProvider   |
          |                    +-------------------+
          |                    +-------------------+
          +------------------> |   GroqProvider    |
          |                    +-------------------+
          |                    +-------------------+
          +------------------> |  ClaudeProvider   |  (etc.)
          |                    +-------------------+
          |
          v
+-------------------+
| ResponseNormalizer|  <--- Converts provider responses to common format
+-------------------+
          |
          v
+-------------------+
|  ResponseWrapper  |  <--- Unified output for downstream processing
+-------------------+`);
  const [nodes, setNodes] = useState<ParsedNode[]>([]);
  const [connections, setConnections] = useState<ParsedConnection[]>([]);
  const [debug, setDebug] = useState("");

  // Parse the diagram whenever the input changes
  useEffect(() => {
    try {
      const lines = markdownInput.split('\n');
      const parsedNodes: ParsedNode[] = [];
      const parsedConnections: ParsedConnection[] = [];
      
      // First pass: Find all the boxes (nodes)
      for (let i = 0; i < lines.length; i++) {
        // Look for box tops
        if (lines[i].includes('+') && lines[i].includes('-')) {
          // Check if next line contains a node name
          if (i + 1 < lines.length && lines[i + 1].includes('|')) {
            const contentLine = lines[i + 1];
            // Extract node name using regex
            const nameMatch = contentLine.match(/\|\s*(.*?)\s*\|/);
            
            if (nameMatch) {
              const name = nameMatch[1].trim();
              
              // Look for description (text after arrow)
              let description = '';
              const descMatch = contentLine.match(/<-+\s*(.*)/);
              if (descMatch) {
                description = descMatch[1].trim();
              }
              
              // Add to nodes
              parsedNodes.push({
                id: name,
                name: name,
                description: description,
                lineIndex: i
              });
            }
          }
        }
      }
      
      // Second pass: Find vertical connections (|, v, V)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line === '|' || line === 'v' || line === 'V' || line === '↓') {
          // Find closest node above
          let sourceNode: ParsedNode | null = null;
          for (let j = i - 1; j >= 0; j--) {
            const node = parsedNodes.find(n => n.lineIndex === j);
            if (node) {
              sourceNode = node;
              break;
            }
          }
          
          // Find closest node below
          let targetNode: ParsedNode | null = null;
          for (let j = i + 1; j < lines.length; j++) {
            const node = parsedNodes.find(n => n.lineIndex === j);
            if (node) {
              targetNode = node;
              break;
            }
          }
          
          if (sourceNode && targetNode) {
            parsedConnections.push({
              source: sourceNode.id,
              target: targetNode.id,
              type: 'vertical'
            });
          }
        }
      }
      
      // Third pass: Find branch connections (+-->, +--->)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes('+--') && line.includes('>')) {
          // Find source node (usually above)
          let sourceNode: ParsedNode | null = null;
          for (let j = i - 1; j >= 0; j--) {
            const node = parsedNodes.find(n => n.lineIndex === j);
            if (node) {
              sourceNode = node;
              break;
            }
          }
          
          // Look for a node in the next line (or few lines)
          let targetNode: ParsedNode | null = null;
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const potentialLine = lines[j];
            if (potentialLine.includes('|')) {
              const nameMatch = potentialLine.match(/\|\s*(.*?)\s*\|/);
              if (nameMatch) {
                const name = nameMatch[1].trim();
                targetNode = parsedNodes.find(n => n.id === name) ?? null;
                break;
              }
            }
          }
          
          if (sourceNode && targetNode) {
            parsedConnections.push({
              source: sourceNode.id,
              target: targetNode.id,
              type: 'branch'
            });
          }
        }
      }
      
      // Update state
      setNodes(parsedNodes);
      setConnections(parsedConnections);
      setDebug(JSON.stringify({ nodes: parsedNodes, connections: parsedConnections }, null, 2));
    } catch (error) {
      console.error("Error parsing diagram:", error);
      setDebug("Error: " + extractErrorMessage(error));
    }
  }, [markdownInput]);

  // Position nodes in a hierarchical layout
  const getNodePositions = () => {
    // Create a map of node depths (how far from the root)
    const nodeDepths: Record<string, number> = {};
    const nodeHorizontalPositions: Record<string, number> = {};
    
    // Find root nodes (no incoming connections)
    const getIncomingConnections = (nodeId: string) => {
      return connections.filter(conn => conn.target === nodeId);
    };
    
    const rootNodes = nodes.filter(node => 
      getIncomingConnections(node.id).length === 0
    );
    
    // Assign depth 0 to root nodes
    rootNodes.forEach(node => {
      nodeDepths[node.id] = 0;
      nodeHorizontalPositions[node.id] = 0; // Main branch
    });
    
    // Traverse the graph to assign depths to all nodes
    let changed = true;
    while (changed) {
      changed = false;
      
      connections.forEach(conn => {
        const sourceDepth = nodeDepths[conn.source];
        
        if (sourceDepth !== undefined) {
          const targetDepth = nodeDepths[conn.target];
          const newDepth = sourceDepth + 1;
          
          if (targetDepth === undefined || targetDepth < newDepth) {
            nodeDepths[conn.target] = newDepth;
            changed = true;
            
            // Assign horizontal position based on connection type
            if (conn.type === 'vertical') {
              nodeHorizontalPositions[conn.target] = nodeHorizontalPositions[conn.source];
            } else if (conn.type === 'branch') {
              nodeHorizontalPositions[conn.target] = 1; // Branch to the right
            }
          }
        }
      });
    }
    
    return { nodeDepths, nodeHorizontalPositions };
  };

  const renderDiagram = () => {
    if (nodes.length === 0) {
      return (
        <div className="flex items-center justify-center h-96 bg-gray-100 dark:bg-gray-900 rounded-3xl p-4 text-gray-500 dark:text-gray-400">
          No diagram detected. Please check your input format.
        </div>
      );
    }
    
    const { nodeDepths, nodeHorizontalPositions } = getNodePositions();
    
    // Constants for layout
    const nodeWidth = 220;
    const nodeHeight = 60;
    const verticalSpacing = 80;
    const horizontalSpacing = 300;
    const mainColumnX = 200;
    const branchColumnX = 500;
    
    // Calculate maximum depth for SVG height
    const maxDepth = Math.max(...Object.values(nodeDepths) as number[]);
    const svgHeight = (maxDepth + 1) * (nodeHeight + verticalSpacing);
    
    return (
      <svg width="100%" height={svgHeight} viewBox={`0 0 800 ${svgHeight}`}>
        {/* Arrow marker definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#4B5563" />
          </marker>
        </defs>
        
        {/* Draw connections */}
        {connections.map((conn, index) => {
          const sourceDepth = nodeDepths[conn.source] || 0;
          const targetDepth = nodeDepths[conn.target] || 0;
          const sourceHPos = nodeHorizontalPositions[conn.source] || 0;
          const targetHPos = nodeHorizontalPositions[conn.target] || 0;
          
          const sourceX = sourceHPos === 0 ? mainColumnX : branchColumnX;
          const sourceY = sourceDepth * (nodeHeight + verticalSpacing) + nodeHeight/2;
          const targetX = targetHPos === 0 ? mainColumnX : branchColumnX;
          const targetY = targetDepth * (nodeHeight + verticalSpacing) - nodeHeight/2;
          
          if (conn.type === 'vertical') {
            return (
              <line
                key={`conn-${index}`}
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={targetY}
                stroke="#4B5563"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            );
          } else {
            // Branch connection (horizontal then vertical)
            const midY = (sourceY + targetY) / 2;
            
            return (
              <path
                key={`conn-${index}`}
                d={`M${sourceX},${sourceY} L${sourceX},${midY} L${targetX},${midY} L${targetX},${targetY}`}
                fill="none"
                stroke="#4B5563"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            );
          }
        })}
        
        {/* Draw nodes */}
        {nodes.map((node, index) => {
          const depth = nodeDepths[node.id] || 0;
          const hPos = nodeHorizontalPositions[node.id] || 0;
          
          const x = (hPos === 0 ? mainColumnX : branchColumnX) - nodeWidth/2;
          const y = depth * (nodeHeight + verticalSpacing) - nodeHeight/2;
          
          return (
            <g key={`node-${index}`}>
              <rect
                x={x}
                y={y}
                width={nodeWidth}
                height={nodeHeight}
                fill="white"
                stroke="#374151"
                strokeWidth="2"
                rx="4"
              />
              <text
                x={x + nodeWidth/2}
                y={y + 25}
                fontFamily="sans-serif"
                fontSize="14"
                fontWeight="bold"
                textAnchor="middle"
              >
                {node.name}
              </text>
              {node.description && (
                <text
                  x={x + nodeWidth/2}
                  y={y + 45}
                  fontFamily="sans-serif"
                  fontSize="12"
                  fontStyle="italic"
                  textAnchor="middle"
                  fill="#6B7280"
                >
                  {node.description}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  // Function to export SVG
  const handleExportSVG = () => {
    // Get the SVG element
    const svgEl = document.querySelector('svg');
    if (!svgEl) return;
    
    // Get SVG source
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);
    
    // Add name spaces
    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    
    // Add XML declaration
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    
    // Create a Blob from the SVG source
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Create a link to download the SVG
    const link = document.createElement('a');
    link.href = url;
    link.download = 'flow-diagram.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the object URL
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  };

  // Function to copy as React component
  const handleCopyAsReact = () => {
    const svgEl = document.querySelector('svg');
    if (!svgEl) return;
    
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    
    const componentCode = `import React from 'react';

const FlowDiagram = () => {
  return (
    <div className="flow-diagram">
      ${svgString}
    </div>
  );
};

export default FlowDiagram;`;
    
    navigator.clipboard.writeText(componentCode)
      .then(() => {
        alert('React component copied to clipboard!');
      })
      .catch(err => {
        console.error('Error copying to clipboard:', err);
        alert('Failed to copy to clipboard. See console for details.');
      });
  };

  return (
    <div className="flex flex-col space-y-6 w-full max-w-6xl mx-auto p-6 bg-gray-100 dark:bg-gray-900 rounded-3xl">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Markdown Flow Diagram Converter</h1>
      
      {/* Input section */}
      <div className="w-full">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Paste Markdown Diagram
        </label>
        <textarea
          className="w-full h-64 px-3 py-2 text-gray-700 dark:text-gray-300 border rounded-lg focus:outline-none resize-none font-mono"
          value={markdownInput}
          onChange={(e) => setMarkdownInput(e.target.value)}
        />
      </div>
      
      {/* Output visualization */}
      <div className="w-full">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100 mb-4">Visualization</h2>
        <div className="border rounded-lg p-6 bg-gray-50 dark:bg-gray-800 overflow-auto">
          {renderDiagram()}
        </div>
      </div>
      
      {/* Export options */}
      <div className="flex space-x-4">
        <button 
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          onClick={handleExportSVG}
          disabled={nodes.length === 0}
        >
          Export as SVG
        </button>
        <button 
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          onClick={handleCopyAsReact}
          disabled={nodes.length === 0}
        >
          Copy as React Component
        </button>
      </div>
      
      Debug section - can be removed in production
      
      <div className="w-full mt-8">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100 mb-2">Debug Info</h2>
        <pre className="w-full p-4 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-auto text-xs font-mono">
          {debug}
        </pre>
      </div>
     
    </div>
  );
};

export default MarkdownFlowDiagramConverter;