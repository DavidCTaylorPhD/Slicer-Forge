
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Viewer3D } from './components/Viewer3D';
import { Sidebar } from './components/Sidebar';
import { SheetViewer } from './components/SheetViewer';
import { AIAssistant } from './components/AIAssistant';
import { OversizedModal } from './components/OversizedModal';
import { InstallModal } from './components/InstallModal';
import { sliceGeometry } from './utils/slicer';
import { nestSlices } from './utils/nester';
import { splitSlice } from './utils/modifier';
import { useUndoRedo } from './hooks/useUndoRedo';
import { Axis, MaterialSettings, SliceSettings, Slice, Sheet, ModelStats } from './types';
import * as THREE from 'three';
import { LayoutDashboard, Box, Layers, AlertTriangle, Play, Pause, SkipBack, SkipForward, BookOpen } from 'lucide-react';
import { InstructionsTab } from './components/InstructionsTab';

// Ensure API KEY is available for GenAI
if (!process.env.API_KEY) {
  console.warn("process.env.API_KEY is not set. AI features will be disabled.");
}

interface AppState {
    geometry: THREE.BufferGeometry | null;
    material: MaterialSettings;
    sliceSettings: SliceSettings;
    slices: Slice[];
}

const initialAppState: AppState = {
    geometry: null,
    material: { width: 200, length: 200, thickness: 3, unit: 'mm' },
    sliceSettings: { axis: Axis.Y, count: 20, mode: 'count', layerHeight: 10, nestingOrder: 'optimized' },
    slices: []
};

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [originalGeometry, setOriginalGeometry] = useState<THREE.BufferGeometry | null>(null);
  
  const { 
      state, 
      set: setAppState, 
      undo, 
      redo, 
      canUndo, 
      canRedo,
      reset: resetAppState 
  } = useUndoRedo<AppState>(initialAppState);

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [oversizedSlices, setOversizedSlices] = useState<Slice[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' });
  const [activeTab, setActiveTab] = useState<'3d' | 'sheets' | 'assembly' | 'instructions'>('instructions');
  const [error, setError] = useState<string | null>(null);

  // Assembly State
  const [assemblyIndex, setAssemblyIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<number | null>(null);

  // PWA Installation State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowInstallModal(true);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    setShowInstallModal(false);
  };

  const updateMaterial = useCallback((material: MaterialSettings) => {
      setAppState(prev => ({ ...prev, material }));
  }, [setAppState]);

  const updateSliceSettings = useCallback((sliceSettings: SliceSettings) => {
      setAppState(prev => ({ ...prev, sliceSettings }));
  }, [setAppState]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
              if (e.shiftKey) {
                  if (canRedo) redo();
              } else {
                  if (canUndo) undo();
              }
          } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
              if (canRedo) redo();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  useEffect(() => {
    setAssemblyIndex(state.slices.length);
  }, [state.slices]);

  useEffect(() => {
      if (state.slices.length > 0) {
          const result = nestSlices(
              state.slices, 
              state.material, 
              state.sliceSettings.nestingOrder || 'optimized'
          );
          setSheets(result.sheets);
          setOversizedSlices(result.oversized);
      } else {
          setSheets([]);
          setOversizedSlices([]);
      }
  }, [state.slices, state.material, state.sliceSettings.nestingOrder]);

  useEffect(() => {
    if (isPlaying) {
        playIntervalRef.current = window.setInterval(() => {
            setAssemblyIndex(prev => {
                if (prev >= state.slices.length) {
                    setIsPlaying(false);
                    return prev;
                }
                return prev + 1;
            });
        }, 200); 
    } else {
        if (playIntervalRef.current) {
            clearInterval(playIntervalRef.current);
            playIntervalRef.current = null;
        }
    }
    return () => {
        if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, state.slices.length]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      resetAppState(initialAppState);
      setOriginalGeometry(null);
      setError(null); 
    }
  };

  const handleModelLoaded = useCallback((geo: THREE.BufferGeometry) => {
    setOriginalGeometry(geo.clone());
    setAppState(prev => ({ ...prev, geometry: geo }));
    setError(null);
  }, [setAppState]);

  const handleLoadError = useCallback((errMessage: string) => {
      setError(errMessage);
      setAppState(prev => ({ ...prev, geometry: null }));
      setOriginalGeometry(null);
      setFile(null);
  }, [setAppState]);

  const handleResize = (newDims: { x: number, y: number, z: number }) => {
      if (!originalGeometry) return;
      const newGeo = originalGeometry.clone();
      newGeo.computeBoundingBox();
      if (!newGeo.boundingBox) return;
      
      const size = new THREE.Vector3();
      newGeo.boundingBox.getSize(size);
      
      if (size.x === 0 || size.y === 0 || size.z === 0) return;

      const scaleX = newDims.x / size.x;
      const scaleY = newDims.y / size.y;
      const scaleZ = newDims.z / size.z;
      
      newGeo.scale(scaleX, scaleY, scaleZ);
      newGeo.computeBoundingBox();
      
      setAppState(prev => ({ 
          ...prev, 
          geometry: newGeo,
          slices: [] 
      }));
  };

  const modelStats: ModelStats | null = useMemo(() => {
      if (!state.geometry) return null;
      state.geometry.computeBoundingBox();
      const box = state.geometry.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);
      return {
          dimensions: { x: size.x, y: size.y, z: size.z },
          volume: size.x * size.y * size.z, 
          triangleCount: state.geometry.attributes.position.count / 3
      };
  }, [state.geometry]);

  const handleSlice = async () => {
    if (!state.geometry) return;
    setIsProcessing(true);
    setProgress({ current: 0, total: 100, phase: 'Initializing...' });
    setError(null);
    setActiveTab('3d'); 
    
    try {
        let finalCount = state.sliceSettings.count;
        if (state.sliceSettings.mode === 'height') {
            if (state.sliceSettings.layerHeight <= 0) {
                throw new Error("Layer height must be greater than 0.");
            }
            if (modelStats) {
                const dim = state.sliceSettings.axis === Axis.X ? modelStats.dimensions.x
                            : state.sliceSettings.axis === Axis.Y ? modelStats.dimensions.y
                            : modelStats.dimensions.z;
                
                const calculatedCount = (dim / state.sliceSettings.layerHeight) - 1;
                finalCount = Math.max(2, Math.floor(calculatedCount));
                
                if (finalCount < 2) {
                        finalCount = 2;
                }
            }
        }

        const generatedSlices = await sliceGeometry(
            state.geometry, 
            state.sliceSettings.axis, 
            finalCount,
            (current, total) => {
                setProgress({ 
                    current, 
                    total, 
                    phase: `Slicing layer ${current}/${total}` 
                });
            }
        );

        if (generatedSlices.length === 0) {
            setError("No slices were generated. Try changing the axis or parameters.");
            setIsProcessing(false);
            return;
        }
        
        setAppState(prev => ({ ...prev, slices: generatedSlices }));
        setIsProcessing(false);
        setActiveTab('sheets'); 
    } catch (e: any) {
        setError(e.message || "An error occurred during slicing.");
        setIsProcessing(false);
    }
  };

  const handleAutoSplit = () => {
      if (oversizedSlices.length === 0) return;
      const scaleFactor = state.material.unit === 'in' ? 25.4 : 1;
      const maxW = state.material.width * scaleFactor - 10; 
      const maxH = state.material.length * scaleFactor - 10;
      let newSlices = [...state.slices];
      oversizedSlices.forEach(badSlice => {
          newSlices = newSlices.filter(s => s.id !== badSlice.id);
          const parts = splitSlice(badSlice, state.sliceSettings.axis, maxW, maxH);
          newSlices.push(...parts);
      });
      setAppState(prev => ({ ...prev, slices: newSlices }));
  };

  const handleAISuggestion = (axis: Axis, count: number) => {
      setAppState(prev => ({ 
          ...prev, 
          sliceSettings: { ...prev.sliceSettings, axis, count, mode: 'count' } 
      }));
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      <Sidebar
        onFileChange={handleFileChange}
        material={state.material}
        setMaterial={updateMaterial}
        sliceSettings={state.sliceSettings}
        setSliceSettings={updateSliceSettings}
        onSlice={handleSlice}
        isProcessing={isProcessing}
        canSlice={!!state.geometry}
        activeTab={activeTab}
        modelStats={modelStats}
        onResize={handleResize}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onShowInstall={() => setShowInstallModal(true)}
      >
         <AIAssistant modelStats={modelStats} onSuggestParams={handleAISuggestion} />
      </Sidebar>

      <OversizedModal 
          oversized={oversizedSlices}
          onAutoSplit={handleAutoSplit}
          onIgnore={() => setOversizedSlices([])} 
      />

      <InstallModal 
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        onInstall={handleInstallClick}
        isInstallable={!!deferredPrompt}
      />

      <div className="flex-grow flex flex-col h-full relative">
        <div className="absolute top-4 left-4 z-10 flex space-x-2 bg-slate-900/90 backdrop-blur p-1 rounded-lg border border-slate-700 shadow-xl">
            <button
                onClick={() => setActiveTab('instructions')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'instructions' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
            >
                <BookOpen className="w-4 h-4 mr-2" />
                Instructions
            </button>
            <button
                onClick={() => setActiveTab('3d')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === '3d' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
            >
                <Box className="w-4 h-4 mr-2" />
                3D Model
            </button>
            <button
                onClick={() => setActiveTab('sheets')}
                disabled={sheets.length === 0}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'sheets' 
                    ? 'bg-indigo-600 text-white shadow' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent'
                }`}
            >
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Nested Sheets ({sheets.length})
            </button>
            <button
                onClick={() => setActiveTab('assembly')}
                disabled={state.slices.length === 0}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'assembly' 
                    ? 'bg-indigo-600 text-white shadow' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent'
                }`}
            >
                <Layers className="w-4 h-4 mr-2" />
                Assembly View
            </button>
        </div>

        {error && (
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-900/90 text-red-100 px-6 py-3 rounded-lg shadow-xl border border-red-500/50 flex items-center animate-fade-in-down">
                <AlertTriangle className="w-5 h-5 mr-3" />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-4 text-red-200 hover:text-white font-bold">&times;</button>
            </div>
        )}

        <div className="flex-grow relative w-full h-full">
            {activeTab === 'instructions' && (
                <InstructionsTab />
            )}

            {activeTab === '3d' && (
                <Viewer3D 
                    key={state.geometry?.uuid || 'empty'}
                    file={file} 
                    geometry={state.geometry}
                    onModelLoaded={handleModelLoaded} 
                    onError={handleLoadError}
                    slices={state.slices}
                    sliceAxis={state.sliceSettings.axis}
                    showSlicesOnly={false}
                    processingHeight={isProcessing ? (progress.current / progress.total) * (modelStats?.dimensions[state.sliceSettings.axis] || 100) : undefined}
                />
            )}
            
            {activeTab === 'assembly' && (
                <>
                    <Viewer3D 
                        key={state.geometry?.uuid || 'assembly'}
                        file={file} 
                        geometry={state.geometry}
                        onModelLoaded={handleModelLoaded} 
                        onError={handleLoadError}
                        slices={state.slices}
                        sliceAxis={state.sliceSettings.axis}
                        showSlicesOnly={true}
                        assemblyIndex={assemblyIndex}
                        material={state.material} 
                    />
                    
                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-xl p-4 shadow-2xl flex flex-col space-y-3">
                        <div className="flex justify-between text-xs text-slate-400 font-mono uppercase">
                            <span>Layer 0</span>
                            <span className="text-indigo-400">Current: {assemblyIndex}</span>
                            <span>Layer {state.slices.length}</span>
                        </div>
                        
                        <input 
                            type="range" 
                            min="0" 
                            max={state.slices.length} 
                            value={assemblyIndex} 
                            onChange={(e) => {
                                setAssemblyIndex(Number(e.target.value));
                                setIsPlaying(false);
                            }}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                        />
                        
                        <div className="flex justify-center items-center space-x-6">
                            <button 
                                onClick={() => {
                                    setAssemblyIndex(Math.max(0, assemblyIndex - 1));
                                    setIsPlaying(false);
                                }}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                            >
                                <SkipBack className="w-5 h-5" />
                            </button>
                            
                            <button 
                                onClick={() => {
                                    if (assemblyIndex >= state.slices.length) setAssemblyIndex(0); 
                                    setIsPlaying(!isPlaying);
                                }}
                                className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-500/30 transition-transform transform active:scale-95"
                            >
                                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current pl-0.5" />}
                            </button>
                            
                            <button 
                                onClick={() => {
                                    setAssemblyIndex(Math.min(state.slices.length, assemblyIndex + 1));
                                    setIsPlaying(false);
                                }}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                            >
                                <SkipForward className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'sheets' && (
                <div className="w-full h-full bg-slate-900 p-20 flex justify-center">
                     <div className="w-full max-w-5xl h-full">
                        <SheetViewer sheets={sheets} slices={state.slices} axis={state.sliceSettings.axis} scale={1.5} />
                     </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default App;
