import React, { useState, useEffect, useRef } from 'react';
import { Search, Brain, CheckCircle2, Clock, Zap, Activity, ChevronRight, Database, FileText, Globe } from 'lucide-react';

const ResearchWorkflowUI = () => {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Market Analysis Research", status: "completed", progress: 100, type: "analysis", results: ["Market size: $2.3B", "Growth rate: 15% YoY", "Key players identified"] },
    { id: 2, title: "Competitor Intelligence", status: "completed", progress: 100, type: "intelligence", results: ["12 competitors analyzed", "Pricing strategies mapped", "SWOT analysis complete"] },
    { id: 3, title: "Patent Landscape Review", status: "processing", progress: 73, type: "research", results: ["127 patents reviewed", "Filing trends analyzed"] },
    { id: 4, title: "Customer Sentiment Analysis", status: "processing", progress: 45, type: "analysis", results: ["Social media scraped", "Sentiment scoring in progress"] },
    { id: 5, title: "Technology Stack Evaluation", status: "processing", progress: 28, type: "technical", results: ["Framework comparison started"] },
    { id: 6, title: "Regulatory Compliance Check", status: "queued", progress: 0, type: "compliance", results: [] },
    { id: 7, title: "Financial Impact Modeling", status: "queued", progress: 0, type: "financial", results: [] }
  ]);

  const [selectedTask, setSelectedTask] = useState(tasks[2]);
  const [darkMode, setDarkMode] = useState(true);
  const [streamingData, setStreamingData] = useState({});
  const streamBuffers = useRef({});

  // Simulate real-time streaming for active tasks
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prevTasks => 
        prevTasks.map(task => {
          if (task.status === 'processing' && task.progress < 100) {
            const increment = Math.random() * 3 + 0.5;
            const newProgress = Math.min(task.progress + increment, 100);
            
            // Add streaming results
            if (Math.random() > 0.7) {
              const streamingResults = [
                "New data point discovered",
                "Analysis pattern identified",
                "Cross-reference validated",
                "Insight generated",
                "Connection established",
                "Verification completed"
              ];
              
              const newResult = streamingResults[Math.floor(Math.random() * streamingResults.length)];
              task.results = [...(task.results || []), newResult];
            }
            
            // Mark as completed when reaching 100%
            if (newProgress === 100) {
              return { ...task, progress: newProgress, status: 'completed' };
            }
            
            return { ...task, progress: newProgress };
          }
          return task;
        })
      );
    }, 800);

    return () => clearInterval(interval);
  }, []);

  const getTaskIcon = (type) => {
    switch (type) {
      case 'analysis': return <Brain className="w-4 h-4" />;
      case 'intelligence': return <Search className="w-4 h-4" />;
      case 'research': return <FileText className="w-4 h-4" />;
      case 'technical': return <Database className="w-4 h-4" />;
      case 'compliance': return <CheckCircle2 className="w-4 h-4" />;
      case 'financial': return <Activity className="w-4 h-4" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-emerald-500';
      case 'processing': return 'text-blue-500';
      case 'queued': return 'text-slate-400';
      default: return 'text-slate-400';
    }
  };

  const processingTasks = tasks.filter(task => task.status === 'processing');

  return (
    <div className={`min-h-dvh transition-colors duration-300 ${darkMode ? 'dark bg-slate-900' : 'bg-slate-50'}`}>
      <div className="flex h-dvh">
        {/* Sidebar */}
        <div className={`w-80 border-r transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          {/* Header */}
          <div className={`p-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between mb-4">
              <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Research Hub
              </h1>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <div className="text-xs text-slate-500 mb-1">Completed</div>
                <div className={`text-lg font-bold text-emerald-500`}>
                  {tasks.filter(t => t.status === 'completed').length}
                </div>
              </div>
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <div className="text-xs text-slate-500 mb-1">Active</div>
                <div className={`text-lg font-bold text-blue-500`}>
                  {processingTasks.length}
                </div>
              </div>
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <div className="text-xs text-slate-500 mb-1">Queued</div>
                <div className={`text-lg font-bold text-slate-400`}>
                  {tasks.filter(t => t.status === 'queued').length}
                </div>
              </div>
            </div>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {tasks.map((task, index) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className={`p-4 rounded-xl cursor-pointer transition-all duration-300 transform hover:scale-[1.02] ${
                  selectedTask?.id === task.id 
                    ? (darkMode ? 'bg-blue-500/20 border-blue-500/30 shadow-blue-500/20' : 'bg-blue-50 border-blue-200 shadow-blue-200/50')
                    : (darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-white hover:bg-slate-50')
                } border shadow-lg`}
                style={{
                  animationDelay: `${index * 0.1}s`
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${darkMode ? 'bg-slate-600' : 'bg-slate-100'} ${getStatusColor(task.status)}`}>
                    {getTaskIcon(task.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-slate-900'} truncate`}>
                        {task.title}
                      </h3>
                      {task.status === 'completed' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 animate-pulse" />
                      )}
                      {task.status === 'processing' && (
                        <div className="w-4 h-4 flex-shrink-0">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping mx-auto"></div>
                        </div>
                      )}
                    </div>
                    
                    {/* Progress Bar */}
                    <div className={`w-full h-2 rounded-full mb-2 ${darkMode ? 'bg-slate-600' : 'bg-slate-200'}`}>
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${
                          task.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${task.progress}%` }}
                      >
                        {task.status === 'processing' && (
                          <div className="w-full h-full rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 capitalize">{task.status}</span>
                      <span className={`text-xs font-medium ${getStatusColor(task.status)}`}>
                        {task.progress}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {/* Header */}
          <div className={`p-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-100'} ${getStatusColor(selectedTask?.status)}`}>
                {getTaskIcon(selectedTask?.type)}
              </div>
              <div>
                <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {selectedTask?.title}
                </h1>
                <p className="text-slate-500 capitalize">
                  {selectedTask?.status} • {selectedTask?.progress}% Complete
                </p>
              </div>
            </div>

            {/* Real-time Processing Indicator */}
            {processingTasks.length > 0 && (
              <div className={`p-4 rounded-xl ${darkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'} border`}>
                <div className="flex items-center gap-3 mb-3">
                  <Zap className="w-5 h-5 text-blue-500" />
                  <span className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {processingTasks.length} Task{processingTasks.length > 1 ? 's' : ''} Processing Simultaneously
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {processingTasks.map(task => (
                    <div key={task.id} className={`px-3 py-1 rounded-full text-xs ${darkMode ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'} flex items-center gap-1`}>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      {task.title}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Progress Details */}
              <div className={`p-6 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <h2 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Progress Overview
                </h2>
                <div className={`w-full h-4 rounded-full mb-4 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      selectedTask?.status === 'completed' ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-blue-400 to-blue-600'
                    }`}
                    style={{ width: `${selectedTask?.progress || 0}%` }}
                  >
                    <div className="w-full h-full rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    {selectedTask?.progress || 0}% Complete
                  </span>
                  <span className={`text-sm font-medium ${getStatusColor(selectedTask?.status)}`}>
                    {selectedTask?.status?.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Live Results Stream */}
              <div className={`p-6 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="w-5 h-5 text-blue-500" />
                  <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Live Results Stream
                  </h2>
                  {selectedTask?.status === 'processing' && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      Streaming
                    </div>
                  )}
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {selectedTask?.results?.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-50'} transform transition-all duration-300 animate-in slide-in-from-left-2`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0"></div>
                        <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {result}
                        </span>
                        <span className="text-xs text-slate-500 ml-auto">
                          {new Date().toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {selectedTask?.status === 'processing' && (
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50/50'} border-2 border-dashed ${darkMode ? 'border-slate-600' : 'border-slate-300'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse flex-shrink-0"></div>
                        <span className={`text-sm italic ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Processing new insights...
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Task Details */}
              <div className={`p-6 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <h2 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Task Details
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-slate-500">Type</span>
                    <p className={`font-medium capitalize ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {selectedTask?.type}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500">Status</span>
                    <p className={`font-medium capitalize ${getStatusColor(selectedTask?.status)}`}>
                      {selectedTask?.status}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500">Started</span>
                    <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {new Date().toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500">Results Count</span>
                    <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {selectedTask?.results?.length || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResearchWorkflowUI;