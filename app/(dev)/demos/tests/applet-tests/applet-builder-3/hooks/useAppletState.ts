// hooks/useAppletState.ts
import { create } from 'zustand';
import { AppletState } from '../types';

interface AppletStore extends AppletState {
  setStep: (step: number) => void;
  setAppName: (name: string) => void;
  setTemplate: (templateId: string | null) => void;
  setColor: (color: string) => void;
  setCapabilities: (capabilities: string[]) => void;
  setDeployment: (type: 'private' | 'team' | 'public') => void;
}

export const useAppletStore = create<AppletStore>((set) => ({
  currentStep: 1,
  appName: 'My AI Applet',
  selectedTemplate: null,
  selectedColor: '#6366f1',
  selectedCapabilities: [],
  deployment: 'private',
  setStep: (step) => set({ currentStep: step }),
  setAppName: (name) => set({ appName: name }),
  setTemplate: (templateId) => set({ selectedTemplate: templateId }),
  setColor: (color) => set({ selectedColor: color }),
  setCapabilities: (capabilities) => set({ selectedCapabilities: capabilities }),
  setDeployment: (type) => set({ deployment: type })
}));
