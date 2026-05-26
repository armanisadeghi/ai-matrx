'use client';

import React, { useState } from 'react';
import { Stars, Brain, MessageSquare, BookOpen, Clock, UserCircle, Sliders, Save, Zap, Code, ListChecks, Palette, CircuitBoard, UserCog, PanelTop, Image, BellRing, Smile } from 'lucide-react';

export default function AIExperienceCustomizer() {
  // State for all customization options
  const [communication, setCommunication] = useState({
    verbosity: 50,
    formality: 50,
    personality: 'balanced',
    tone: 'neutral',
    emoji: false,
    citations: true
  });
  
  const [knowledge, setKnowledge] = useState({
    expertise: ['general'],
    reasoning: 50,
    creativity: 50,
    memory: true
  });
  
  const [appearance, setAppearance] = useState({
    theme: 'light',
    fontsize: 'medium',
    uiDensity: 'comfortable'
  });
  
  const [preferences, setPreferences] = useState({
    codeBlocks: true,
    stepByStep: true,
    examples: true,
    autoSuggest: false,
    bulletPoints: true,
    imageGen: false,
    notifications: false
  });
  
  const [personalInfo, setPersonalInfo] = useState({
    name: '',
    age: '',
    city: '',
    occupation: '',
    interests: ''
  });
  
  // Handle slider changes
  const handleSliderChange = (category, field, value) => {
    if (category === 'communication') {
      setCommunication({
        ...communication,
        [field]: value
      });
    } else if (category === 'knowledge') {
      setKnowledge({
        ...knowledge,
        [field]: value
      });
    }
  };
  
  // Handle toggle changes
  const handleToggleChange = (category, field) => {
    if (category === 'communication') {
      setCommunication({
        ...communication,
        [field]: !communication[field]
      });
    } else if (category === 'knowledge') {
      setKnowledge({
        ...knowledge,
        [field]: !knowledge[field]
      });
    } else if (category === 'preferences') {
      setPreferences({
        ...preferences,
        [field]: !preferences[field]
      });
    }
  };
  
  // Handle select changes
  const handleSelectChange = (category, field, value) => {
    if (category === 'communication') {
      setCommunication({
        ...communication,
        [field]: value
      });
    } else if (category === 'appearance') {
      setAppearance({
        ...appearance,
        [field]: value
      });
    }
  };
  
  // Handle expertise changes (multiple select)
  const handleExpertiseChange = (expertise) => {
    if (knowledge.expertise.includes(expertise)) {
      setKnowledge({
        ...knowledge,
        expertise: knowledge.expertise.filter(item => item !== expertise)
      });
    } else {
      setKnowledge({
        ...knowledge,
        expertise: [...knowledge.expertise, expertise]
      });
    }
  };

  // Handle personal info changes
  const handlePersonalInfoChange = (e) => {
    setPersonalInfo({
      ...personalInfo,
      [e.target.name]: e.target.value
    });
  };

  // Handle saving the configuration
  const handleSave = () => {
    const config = {
      personalInfo,
      communication,
      knowledge,
      appearance,
      preferences
    };
    
    console.log('Configuration saved:', config);
    // Here you would typically send this to your backend
    alert('Your AI experience has been saved!');
  };
  
  // List of expertise options
  const expertiseOptions = [
    { id: 'general', label: 'General Knowledge' },
    { id: 'technology', label: 'Technology' },
    { id: 'science', label: 'Science' },
    { id: 'math', label: 'Mathematics' },
    { id: 'finance', label: 'Finance' },
    { id: 'health', label: 'Health & Medicine' },
    { id: 'arts', label: 'Arts & Culture' },
    { id: 'history', label: 'History' },
    { id: 'business', label: 'Business' },
    { id: 'cooking', label: 'Cooking' },
    { id: 'sports', label: 'Sports' },
    { id: 'travel', label: 'Travel' }
  ];
  
  // UI Components
  const Slider = ({ value, onChange, label, min = 0, max = 100, leftLabel = "Less", rightLabel = "More" }) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <span className="text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary rounded-md">{value}%</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[60px] text-left">{leftLabel}</span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[60px] text-right">{rightLabel}</span>
      </div>
    </div>
  );

  const Toggle = ({ checked, onChange, label, icon }) => (
    <div className="flex items-center justify-between py-2.5 px-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-gray-500 dark:text-gray-400">{icon}</span>}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
          checked ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );

  const Card = ({ title, icon, children, className = "", size = "normal" }) => {
    const sizeClasses = {
      small: "col-span-1",
      normal: "col-span-1 md:col-span-1",
      medium: "col-span-1 md:col-span-2",
      large: "col-span-1 md:col-span-3"
    };
    
    return (
      <div className={`bg-card border-border rounded-xl shadow-sm hover:shadow-md transition-all p-6 ${sizeClasses[size]} ${className}`}>
        <div className="flex items-center mb-5 pb-3 border-b border-border">
          <span className="p-2 rounded-lg bg-primary/10 text-primary mr-3">{icon}</span>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        {children}
      </div>
    );
  };
  
  const PersonalityCard = ({ selected, onChange }) => {
    const options = [
      { id: 'friendly', label: 'Friendly', description: 'Warm, approachable, casual' },
      { id: 'professional', label: 'Professional', description: 'Formal, precise, concise' },
      { id: 'enthusiastic', label: 'Enthusiastic', description: 'Energetic, encouraging, positive' },
      { id: 'balanced', label: 'Balanced', description: 'Neutral, adaptable, versatile' },
      { id: 'academic', label: 'Academic', description: 'Detailed, thorough, analytical' }
    ];
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => onChange('communication', 'personality', option.id)}
            className={`p-4 border-2 rounded-lg text-left transition-all ${
              selected === option.id
                ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary/40 dark:hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <div className={`font-semibold mb-1 ${selected === option.id ? 'text-primary' : 'text-gray-900 dark:text-gray-100'}`}>
              {option.label}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">{option.description}</div>
          </button>
        ))}
      </div>
    );
  };
  
  const ToneCard = ({ selected, onChange }) => {
    const options = [
      { id: 'neutral', label: 'Neutral' },
      { id: 'casual', label: 'Casual' },
      { id: 'formal', label: 'Formal' },
      { id: 'humorous', label: 'Humorous' },
      { id: 'empathetic', label: 'Empathetic' },
      { id: 'direct', label: 'Direct' }
    ];
    
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => onChange('communication', 'tone', option.id)}
            className={`px-4 py-2 border-2 rounded-lg text-sm font-medium transition-all ${
              selected === option.id
                ? 'border-primary bg-primary/5 text-primary shadow-sm'
                : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary/40 dark:hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  };
  
  // Render the UI
  return (
    <div className="flex flex-col h-full bg-textured text-gray-800 dark:text-gray-100">
      <header className="sticky top-0 z-10 bg-textured border-b border-border px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Zap className="h-7 w-7 text-blue-600 dark:text-blue-500 mr-2" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Customize Your AI Experience</h1>
          </div>
          <button
            onClick={handleSave}
            className="flex items-center px-4 py-2 bg-blue-600 dark:bg-blue-700 rounded-lg text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
          >
            <Save className="h-4 w-4 mr-2" />
            Save My Experience
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto h-full">
        <div className="max-w-7xl mx-auto">
          
          {/* Section 1: Personality & Style */}
          <section className="mb-12 pb-12 border-b border-border">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-sm">
                  1
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Personality & Communication Style</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 ml-11">
                Define how your AI assistant communicates and interacts with you
              </p>
            </div>
            
            <Card 
              title="AI Personality" 
              icon={<UserCog className="h-5 w-5" />}
              size="large"
              className="mb-5"
            >
              <PersonalityCard 
                selected={communication.personality} 
                onChange={handleSelectChange} 
              />
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <Card title="Conversation Tone" icon={<MessageSquare className="h-5 w-5" />}>
                <ToneCard 
                  selected={communication.tone} 
                  onChange={handleSelectChange}
                />
              </Card>
              
              <Card title="Verbosity" icon={<MessageSquare className="h-5 w-5" />}>
                <Slider
                  label="Response Length"
                  value={communication.verbosity}
                  onChange={(value) => handleSliderChange('communication', 'verbosity', value)}
                  leftLabel="Concise"
                  rightLabel="Detailed"
                />
              </Card>
              
              <Card title="Formality" icon={<MessageSquare className="h-5 w-5" />}>
                <Slider
                  label="Communication Style"
                  value={communication.formality}
                  onChange={(value) => handleSliderChange('communication', 'formality', value)}
                  leftLabel="Casual"
                  rightLabel="Formal"
                />
              </Card>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="Style Enhancements" icon={<Palette className="h-5 w-5" />}>
                <div className="space-y-1">
                  <Toggle
                    icon={<Smile className="h-4 w-4" />}
                    label="Use Emoji in Responses"
                    checked={communication.emoji}
                    onChange={() => handleToggleChange('communication', 'emoji')}
                  />
                  <Toggle
                    icon={<BookOpen className="h-4 w-4" />}
                    label="Include Academic Citations"
                    checked={communication.citations}
                    onChange={() => handleToggleChange('communication', 'citations')}
                  />
                </div>
              </Card>
              
              <Card title="Interactive Features" icon={<Zap className="h-5 w-5" />}>
                <div className="space-y-1">
                  <Toggle
                    icon={<BookOpen className="h-4 w-4" />}
                    label="Suggest Follow-up Questions"
                    checked={preferences.autoSuggest}
                    onChange={() => handleToggleChange('preferences', 'autoSuggest')}
                  />
                  <Toggle
                    label="Enable Notifications"
                    checked={preferences.notifications}
                    icon={<BellRing className="h-4 w-4" />}
                    onChange={() => handleToggleChange('preferences', 'notifications')}
                  />
                </div>
              </Card>
            </div>
          </section>
          
          {/* Knowledge & Capabilities */}
          <section className="mb-12 pb-12 border-b border-border">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-bold text-sm">
                  2
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Intelligence & Capabilities</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 ml-11">
                Configure how your AI thinks, reasons, and applies knowledge
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <Card title="Reasoning Depth" icon={<Brain className="h-5 w-5" />}>
                <Slider
                  label="Analytical Thinking"
                  value={knowledge.reasoning}
                  onChange={(value) => handleSliderChange('knowledge', 'reasoning', value)}
                  leftLabel="Simple"
                  rightLabel="Complex"
                />
              </Card>
              
              <Card title="Creativity Level" icon={<Stars className="h-5 w-5" />}>
                <Slider
                  label="Creative Thinking"
                  value={knowledge.creativity}
                  onChange={(value) => handleSliderChange('knowledge', 'creativity', value)}
                  leftLabel="Practical"
                  rightLabel="Imaginative"
                />
              </Card>
              
              <Card title="Memory Features" icon={<Clock className="h-5 w-5" />}>
                <div className="space-y-2">
                  <Toggle
                    icon={<Clock className="h-4 w-4" />}
                    label="Remember Context Across Sessions"
                    checked={knowledge.memory}
                    onChange={() => handleToggleChange('knowledge', 'memory')}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 pl-9">
                    Your AI will remember important information from previous conversations
                  </p>
                </div>
              </Card>
            </div>
            
            <Card 
              title="Areas of Expertise" 
              icon={<BookOpen className="h-5 w-5" />}
              size="large"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {expertiseOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleExpertiseChange(option.id)}
                    className={`py-2.5 px-4 text-sm font-medium border-2 rounded-lg flex items-center justify-center transition-all ${
                      knowledge.expertise.includes(option.id)
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary/40 dark:hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    {knowledge.expertise.includes(option.id) && (
                      <span className="mr-1.5 text-primary">✓</span>
                    )}
                    {option.label}
                  </button>
                ))}
              </div>
            </Card>
          </section>
          
          {/* Output Format & Preferences */}
          <section className="mb-12 pb-12 border-b border-border">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-bold text-sm">
                  3
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Response Format & Features</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 ml-11">
                Control how information is formatted and what features are enabled
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="Content Formatting" icon={<ListChecks className="h-5 w-5" />}>
                <div className="space-y-1.5">
                  <Toggle
                    label="Step-by-Step Explanations"
                    icon={<ListChecks className="h-4 w-4" />}
                    checked={preferences.stepByStep}
                    onChange={() => handleToggleChange('preferences', 'stepByStep')}
                  />
                  <Toggle
                    label="Include Practical Examples"
                    icon={<BookOpen className="h-4 w-4" />}
                    checked={preferences.examples}
                    onChange={() => handleToggleChange('preferences', 'examples')}
                  />
                  <Toggle
                    label="Use Bullet Points & Lists"
                    icon={<ListChecks className="h-4 w-4" />}
                    checked={preferences.bulletPoints}
                    onChange={() => handleToggleChange('preferences', 'bulletPoints')}
                  />
                </div>
              </Card>
              
              <Card title="Technical Features" icon={<Code className="h-5 w-5" />}>
                <div className="space-y-1.5">
                  <Toggle
                    label="Syntax Highlighted Code Blocks"
                    icon={<Code className="h-4 w-4" />}
                    checked={preferences.codeBlocks}
                    onChange={() => handleToggleChange('preferences', 'codeBlocks')}
                  />
                  <Toggle
                    label="Generate Image Descriptions"
                    icon={<Image className="h-4 w-4" />}
                    checked={preferences.imageGen}
                    onChange={() => handleToggleChange('preferences', 'imageGen')}
                  />
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Display Theme</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['light', 'dark', 'system'].map((theme) => (
                      <button
                        key={theme}
                        onClick={() => handleSelectChange('appearance', 'theme', theme)}
                        className={`p-2.5 border-2 rounded-lg capitalize text-sm font-medium transition-all ${
                          appearance.theme === theme
                            ? 'border-primary bg-primary/5 text-primary shadow-sm'
                            : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary/40 dark:hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </section>
          
          {/* Personal Information (moved to the bottom) */}
          <section className="mb-12">
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold text-sm">
                      4
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Personal Details <span className="text-base font-normal text-gray-500 dark:text-gray-400">(Optional)</span></h2>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 ml-11">
                    Provide context to make responses more personalized and relevant to you
                  </p>
                </div>
              </div>
            </div>
            
            <Card title="Personal Information" icon={<UserCircle className="h-5 w-5" />} size="large">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={personalInfo.name}
                    onChange={handlePersonalInfoChange}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-background text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">City/Location</label>
                  <input
                    type="text"
                    name="city"
                    value={personalInfo.city}
                    onChange={handlePersonalInfoChange}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-background text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    placeholder="Where you live"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Occupation</label>
                  <input
                    type="text"
                    name="occupation"
                    value={personalInfo.occupation}
                    onChange={handlePersonalInfoChange}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-background text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    placeholder="Your job or role"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Primary Interests</label>
                  <input
                    type="text"
                    name="interests"
                    value={personalInfo.interests}
                    onChange={handlePersonalInfoChange}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-background text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    placeholder="Topics you're interested in (e.g., cooking, technology, travel)"
                  />
                </div>
              </div>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}