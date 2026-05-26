'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, User, Briefcase, GraduationCap, Award, Calendar } from 'lucide-react';

const ResumeBuilder = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    personalInfo: {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      title: '',
      summary: ''
    },
    experience: [{ company: '', position: '', startDate: '', endDate: '', description: '' }],
    education: [{ institution: '', degree: '', field: '', gradYear: '' }],
    skills: [{ name: '', level: 'Intermediate' }],
    certifications: [{ name: '', issuer: '', date: '' }]
  });

  const steps = [
    { name: 'Personal Information', icon: <User className="mb-1 mr-2" /> },
    { name: 'Professional Experience', icon: <Briefcase className="mb-1 mr-2" /> },
    { name: 'Education', icon: <GraduationCap className="mb-1 mr-2" /> },
    { name: 'Skills & Certifications', icon: <Award className="mb-1 mr-2" /> },
    { name: 'Review', icon: <Check className="mb-1 mr-2" /> }
  ];

  const handlePersonalInfoChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      personalInfo: {
        ...formData.personalInfo,
        [name]: value
      }
    });
  };

  const handleExperienceChange = (index, e) => {
    const { name, value } = e.target;
    const updatedExperience = [...formData.experience];
    updatedExperience[index] = {
      ...updatedExperience[index],
      [name]: value
    };
    setFormData({
      ...formData,
      experience: updatedExperience
    });
  };

  const addExperience = () => {
    setFormData({
      ...formData,
      experience: [...formData.experience, { company: '', position: '', startDate: '', endDate: '', description: '' }]
    });
  };

  const removeExperience = (index) => {
    const updatedExperience = [...formData.experience];
    updatedExperience.splice(index, 1);
    setFormData({
      ...formData,
      experience: updatedExperience
    });
  };

  const handleEducationChange = (index, e) => {
    const { name, value } = e.target;
    const updatedEducation = [...formData.education];
    updatedEducation[index] = {
      ...updatedEducation[index],
      [name]: value
    };
    setFormData({
      ...formData,
      education: updatedEducation
    });
  };

  const addEducation = () => {
    setFormData({
      ...formData,
      education: [...formData.education, { institution: '', degree: '', field: '', gradYear: '' }]
    });
  };

  const removeEducation = (index) => {
    const updatedEducation = [...formData.education];
    updatedEducation.splice(index, 1);
    setFormData({
      ...formData,
      education: updatedEducation
    });
  };

  const handleSkillChange = (index, e) => {
    const { name, value } = e.target;
    const updatedSkills = [...formData.skills];
    updatedSkills[index] = {
      ...updatedSkills[index],
      [name]: value
    };
    setFormData({
      ...formData,
      skills: updatedSkills
    });
  };

  const addSkill = () => {
    setFormData({
      ...formData,
      skills: [...formData.skills, { name: '', level: 'Intermediate' }]
    });
  };

  const removeSkill = (index) => {
    const updatedSkills = [...formData.skills];
    updatedSkills.splice(index, 1);
    setFormData({
      ...formData,
      skills: updatedSkills
    });
  };

  const handleCertificationChange = (index, e) => {
    const { name, value } = e.target;
    const updatedCertifications = [...formData.certifications];
    updatedCertifications[index] = {
      ...updatedCertifications[index],
      [name]: value
    };
    setFormData({
      ...formData,
      certifications: updatedCertifications
    });
  };

  const addCertification = () => {
    setFormData({
      ...formData,
      certifications: [...formData.certifications, { name: '', issuer: '', date: '' }]
    });
  };

  const removeCertification = (index) => {
    const updatedCertifications = [...formData.certifications];
    updatedCertifications.splice(index, 1);
    setFormData({
      ...formData,
      certifications: updatedCertifications
    });
  };

  const nextStep = () => {
    setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = () => {
    console.log('Form submitted:', formData);
    // In a real application, this would send the data to a server
    alert('Resume submitted successfully!');
  };

  const renderPersonalInfo = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
          <input
            type="text"
            name="fullName"
            value={formData.personalInfo.fullName}
            onChange={handlePersonalInfoChange}
            className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            placeholder="John Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Professional Title</label>
          <input
            type="text"
            name="title"
            value={formData.personalInfo.title}
            onChange={handlePersonalInfoChange}
            className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            placeholder="Senior Legal Counsel"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={formData.personalInfo.email}
            onChange={handlePersonalInfoChange}
            className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            placeholder="john.smith@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
            value={formData.personalInfo.phone}
            onChange={handlePersonalInfoChange}
            className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
        <input
          type="text"
          name="location"
          value={formData.personalInfo.location}
          onChange={handlePersonalInfoChange}
          className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
          placeholder="New York, NY"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Professional Summary</label>
        <textarea
          name="summary"
          value={formData.personalInfo.summary}
          onChange={handlePersonalInfoChange}
          rows={4}
          className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
          placeholder="Briefly describe your professional background and key strengths..."
        />
      </div>
    </div>
  );

  const renderExperience = () => (
    <div className="space-y-8">
      {formData.experience.map((exp, index) => (
        <div key={index} className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border-border shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center">
              <Briefcase className="mr-2" size={20} />
              Position {index + 1}
            </h3>
            {formData.experience.length > 1 && (
              <button
                type="button"
                onClick={() => removeExperience(index)}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
              >
                Remove
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label>
              <input
                type="text"
                name="company"
                value={exp.company}
                onChange={(e) => handleExperienceChange(index, e)}
                className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="Company Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Position</label>
              <input
                type="text"
                name="position"
                value={exp.position}
                onChange={(e) => handleExperienceChange(index, e)}
                className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="Job Title"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  type="text"
                  name="startDate"
                  value={exp.startDate}
                  onChange={(e) => handleExperienceChange(index, e)}
                  className="w-full p-3 pl-10 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                  placeholder="MM/YYYY"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  type="text"
                  name="endDate"
                  value={exp.endDate}
                  onChange={(e) => handleExperienceChange(index, e)}
                  className="w-full p-3 pl-10 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                  placeholder="MM/YYYY or Present"
                />
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              name="description"
              value={exp.description}
              onChange={(e) => handleExperienceChange(index, e)}
              rows={3}
              className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              placeholder="Describe your responsibilities and achievements..."
            />
          </div>
        </div>
      ))}
      
      <button
        type="button"
        onClick={addExperience}
        className="flex items-center justify-center w-full p-3 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/50 transition duration-150"
      >
        <span className="mr-2">+</span> Add Another Position
      </button>
    </div>
  );

  const renderEducation = () => (
    <div className="space-y-8">
      {formData.education.map((edu, index) => (
        <div key={index} className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border-border shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center">
              <GraduationCap className="mr-2" size={20} />
              Education {index + 1}
            </h3>
            {formData.education.length > 1 && (
              <button
                type="button"
                onClick={() => removeEducation(index)}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
              >
                Remove
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Institution</label>
              <input
                type="text"
                name="institution"
                value={edu.institution}
                onChange={(e) => handleEducationChange(index, e)}
                className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="University or Institution Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Degree</label>
              <input
                type="text"
                name="degree"
                value={edu.degree}
                onChange={(e) => handleEducationChange(index, e)}
                className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="e.g., Bachelor of Science, Juris Doctor"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Field of Study</label>
              <input
                type="text"
                name="field"
                value={edu.field}
                onChange={(e) => handleEducationChange(index, e)}
                className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="e.g., Medicine, Law, Biochemistry"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Graduation Year</label>
              <input
                type="text"
                name="gradYear"
                value={edu.gradYear}
                onChange={(e) => handleEducationChange(index, e)}
                className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="YYYY"
              />
            </div>
          </div>
        </div>
      ))}
      
      <button
        type="button"
        onClick={addEducation}
        className="flex items-center justify-center w-full p-3 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/50 transition duration-150"
      >
        <span className="mr-2">+</span> Add Another Education
      </button>
    </div>
  );

  const renderSkillsAndCertifications = () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
          <Award className="mr-2" size={20} />
          Skills
        </h3>
        
        <div className="space-y-4">
          {formData.skills.map((skill, index) => (
            <div key={index} className="flex items-center space-x-4">
              <div className="flex-grow">
                <input
                  type="text"
                  name="name"
                  value={skill.name}
                  onChange={(e) => handleSkillChange(index, e)}
                  className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                  placeholder="Skill name (e.g., Clinical Research, Contract Negotiation)"
                />
              </div>
              <div className="w-1/3">
                <select
                  name="level"
                  value={skill.level}
                  onChange={(e) => handleSkillChange(index, e)}
                  className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>
              {formData.skills.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSkill(index)}
                  className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        
        <button
          type="button"
          onClick={addSkill}
          className="mt-4 flex items-center justify-center w-full p-3 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/50 transition duration-150"
        >
          <span className="mr-2">+</span> Add Another Skill
        </button>
      </div>
      
      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
          <Award className="mr-2" size={20} />
          Certifications & Licenses
        </h3>
        
        <div className="space-y-6">
          {formData.certifications.map((cert, index) => (
            <div key={index} className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border-border shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-medium text-gray-700 dark:text-gray-300">Certification {index + 1}</h4>
                {formData.certifications.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCertification(index)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Certification Name</label>
                  <input
                    type="text"
                    name="name"
                    value={cert.name}
                    onChange={(e) => handleCertificationChange(index, e)}
                    className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                    placeholder="e.g., Board Certification, Bar Admission"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Issuing Organization</label>
                  <input
                    type="text"
                    name="issuer"
                    value={cert.issuer}
                    onChange={(e) => handleCertificationChange(index, e)}
                    className="w-full p-3 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                    placeholder="e.g., American Board of Internal Medicine"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Issued</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="text"
                    name="date"
                    value={cert.date}
                    onChange={(e) => handleCertificationChange(index, e)}
                    className="w-full p-3 pl-10 border border-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                    placeholder="MM/YYYY"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <button
          type="button"
          onClick={addCertification}
          className="mt-4 flex items-center justify-center w-full p-3 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/50 transition duration-150"
        >
          <span className="mr-2">+</span> Add Another Certification
        </button>
      </div>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Personal Information</h3>
        <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Full Name</p>
              <p className="font-medium dark:text-white">{formData.personalInfo.fullName || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Title</p>
              <p className="font-medium dark:text-white">{formData.personalInfo.title || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
              <p className="font-medium dark:text-white">{formData.personalInfo.email || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
              <p className="font-medium dark:text-white">{formData.personalInfo.phone || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Location</p>
              <p className="font-medium dark:text-white">{formData.personalInfo.location || 'Not provided'}</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Professional Summary</p>
            <p className="text-sm mt-1 dark:text-gray-300">{formData.personalInfo.summary || 'Not provided'}</p>
          </div>
        </div>
      </div>
      
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Experience ({formData.experience.length})</h3>
        {formData.experience.map((exp, index) => (
          <div key={index} className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border-border mb-4">
            <div className="flex justify-between">
              <div>
                <p className="font-medium dark:text-white">{exp.position || 'Position not specified'}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{exp.company || 'Company not specified'}</p>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {exp.startDate || 'Start date'} - {exp.endDate || 'End date'}
              </div>
            </div>
            <p className="text-sm mt-2 dark:text-gray-300">{exp.description || 'No description provided'}</p>
          </div>
        ))}
      </div>
      
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Education ({formData.education.length})</h3>
        {formData.education.map((edu, index) => (
          <div key={index} className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border-border mb-4">
            <div className="flex justify-between">
              <div>
                <p className="font-medium dark:text-white">{edu.degree || 'Degree not specified'} {edu.field ? `in ${edu.field}` : ''}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{edu.institution || 'Institution not specified'}</p>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {edu.gradYear || 'Graduation year not specified'}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Skills ({formData.skills.length})</h3>
          <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border-border">
            <ul className="space-y-2">
              {formData.skills.map((skill, index) => (
                <li key={index} className="flex justify-between">
                  <span className="dark:text-white">{skill.name || 'Skill not specified'}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{skill.level}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Certifications ({formData.certifications.length})</h3>
          <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border-border">
            <ul className="space-y-4">
              {formData.certifications.map((cert, index) => (
                <li key={index}>
                  <p className="font-medium dark:text-white">{cert.name || 'Certification not specified'}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{cert.issuer || 'Issuer not specified'}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{cert.date || 'Date not specified'}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      
      <div className="bg-blue-50 dark:bg-blue-900/50 p-6 rounded-xl border border-blue-100 dark:border-blue-800">
        <p className="text-blue-800 dark:text-blue-200 font-medium">Ready to submit your professional resume?</p>
        <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">You can review all sections and make any final changes before submitting.</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8 bg-textured rounded-2xl shadow-xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Professional Resume Builder</h1>
        <p className="text-gray-600 dark:text-gray-400">Create a standout resume for elite medical and legal positions</p>
      </div>
      
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {steps.map((step, i) => (
            <div 
              key={i} 
              className={`flex flex-col items-center ${
                i <= currentStep ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
              }`}
              style={{ width: `${100 / steps.length}%` }}
            >
              <div 
                className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  i <= currentStep ? 'bg-blue-100 dark:bg-blue-900' : 'bg-gray-100 dark:bg-gray-800'
                } mb-2`}
              >
                <span>{i < currentStep ? <Check size={16} className="text-blue-600 dark:text-blue-400" /> : step.icon}</span>
              </div>
              <span className="text-xs text-center">{step.name}</span>
            </div>
          ))}
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div 
            className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
          />
        </div>
      </div>
      
      {/* Form Steps */}
      <div>
        {currentStep === 0 && renderPersonalInfo()}
        {currentStep === 1 && renderExperience()}
        {currentStep === 2 && renderEducation()}
        {currentStep === 3 && renderSkillsAndCertifications()}
        {currentStep === 4 && renderReview()}
      </div>
      
      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        <button
          type="button"
          onClick={prevStep}
          disabled={currentStep === 0}
          className={`flex items-center px-6 py-3 rounded-lg font-medium ${
            currentStep === 0
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              : 'bg-textured border border-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <ChevronLeft className="mr-2" size={18} />
          Previous
        </button>
        
        {currentStep < steps.length - 1 ? (
          <button
            type="button"
            onClick={nextStep}
            className="flex items-center px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition duration-150"
          >
            Next
            <ChevronRight className="ml-2" size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center px-6 py-3 bg-green-600 dark:bg-green-500 text-white rounded-lg font-medium hover:bg-green-700 dark:hover:bg-green-600 transition duration-150"
          >
            Submit Resume
            <Check className="ml-2" size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ResumeBuilder;