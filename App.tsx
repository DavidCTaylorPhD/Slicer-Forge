
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Viewer3D } from './components/Viewer3D';
import { Sidebar } from './components/Sidebar';
import { SheetViewer } from './components/SheetViewer';
import { AIAssistant } from './components/AIAssistant';
import { OversizedModal } from './components/OversizedModal';
import { WelcomeModal } from './components/WelcomeModal';
import { sliceGeometry } from './utils/slicer';
import { nestSlices } from './utils/nester';
import { splitSlice } from './utils/modifier';
import { useUndoRedo } from './hooks/useUndoRedo';
import { Axis, MaterialSettings, SliceSettings, Slice, Sheet, ModelStats } from './types';
import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { LayoutDashboard, Box, Layers, AlertTriangle, Play, Pause, SkipBack, SkipForward, BookOpen, X } from 'lucide-react';

// Ensure API KEY is available for GenAI
if (!process.env.GEMINI_API_KEY) {
  console.warn("process.env.GEMINI_API_KEY is not set. AI features will be disabled.");
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
  const [lowPolyGeometry, setLowPolyGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [isLowPoly, setIsLowPoly] = useState(false);
  
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
  const [activeTab, setActiveTab] = useState<'3d' | 'sheets' | 'assembly'>('3d');
  const [error, setError] = useState<string | null>(null);

  // Assembly State
  const [assemblyIndex, setAssemblyIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<number | null>(null);

  // PWA Installation State
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // FORCE SHOW for this session so the user can see it
    setShowWelcome(true);
    
    // Optional: Reset storage for future natural launches
    // localStorage.removeItem('sliceforge_welcome_seen');
  }, []);

  const handleCloseWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem('sliceforge_welcome_seen', 'true');
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
      const runNesting = async () => {
          if (state.slices.length > 0) {
              const result = await nestSlices(
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
      };
      runNesting();
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
      setLowPolyGeometry(null);
      setIsLowPoly(false);
      setError(null); 
    }
  };

  const handleModelLoaded = useCallback((geo: THREE.BufferGeometry) => {
    setOriginalGeometry(geo.clone());
    setLowPolyGeometry(null);
    setIsLowPoly(false);
    setAppState(prev => ({ ...prev, geometry: geo }));
    setError(null);
  }, [setAppState]);

  const handleLoadError = useCallback((errMessage: string) => {
      setError(errMessage);
      setAppState(prev => ({ ...prev, geometry: null }));
      setOriginalGeometry(null);
      setLowPolyGeometry(null);
      setFile(null);
  }, [setAppState]);

  const handleLowPolyToggle = async (enabled: boolean) => {
    if (!originalGeometry) return;
    
    setIsLowPoly(enabled);
    
    if (enabled) {
      if (lowPolyGeometry) {
        setAppState(prev => ({ ...prev, geometry: lowPolyGeometry }));
      } else {
        // Check triangle count - Worker handles it better, but we still have limits
        const currentTriangles = originalGeometry.index 
            ? originalGeometry.index.count / 3 
            : originalGeometry.attributes.position.count / 3;
            
        if (currentTriangles > 250000) {
           setError("Model is too complex for Performance Mode (max 250k triangles).");
           setIsLowPoly(false);
           return;
        }

        if (currentTriangles < 500) {
            setLowPolyGeometry(originalGeometry);
            setAppState(prev => ({ ...prev, geometry: originalGeometry }));
            return;
        }

        setIsProcessing(true);
        setProgress({ current: 0, total: 100, phase: 'Simplifying geometry (Background)...' });
        
        try {
            // Prepare data for worker - CLONE to avoid detaching original buffers
            const positions = (originalGeometry.attributes.position.array as Float32Array).slice();
            const indices = originalGeometry.index ? (originalGeometry.index.array as Uint32Array).slice() : null;
            
            // Target a reduction that keeps at least 2000 vertices or 15% of original
            const targetRatio = 0.15;

            // Create worker
            const worker = new Worker(new URL('./utils/simplify.worker.ts', import.meta.url), { type: 'module' });
            
            worker.onmessage = (e) => {
                const { success, positions: resultPositions, error: workerError } = e.data;
                
                if (success) {
                    const newGeo = new THREE.BufferGeometry();
                    newGeo.setAttribute('position', new THREE.BufferAttribute(resultPositions, 3));
                    newGeo.computeVertexNormals();
                    
                    setLowPolyGeometry(newGeo);
                    setAppState(prev => ({ ...prev, geometry: newGeo }));
                } else {
                    console.error("Worker simplification failed:", workerError);
                    setError("Failed to simplify model in background.");
                    setIsLowPoly(false);
                }
                
                setIsProcessing(false);
                worker.terminate();
            };

            worker.onerror = (err) => {
                console.error("Worker error:", err);
                setError("Simplification worker encountered an error.");
                setIsLowPoly(false);
                setIsProcessing(false);
                worker.terminate();
            };

            // Send data to worker (transferring CLONED buffers for speed)
            const transferables = [positions.buffer];
            if (indices) transferables.push(indices.buffer);

            worker.postMessage({
                positions,
                indices,
                targetRatio
            }, transferables as Transferable[]);

        } catch (err) {
            console.error("Failed to start simplification worker:", err);
            setError("Could not start background simplification.");
            setIsLowPoly(false);
            setIsProcessing(false);
        }
      }
    } else {
      setAppState(prev => ({ ...prev, geometry: originalGeometry }));
    }
  };

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
      
      setOriginalGeometry(newGeo);
      setLowPolyGeometry(null);
      setIsLowPoly(false);
      
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
          triangleCount: state.geometry.index 
              ? state.geometry.index.count / 3 
              : state.geometry.attributes.position.count / 3
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
        onShowWelcome={() => setShowWelcome(true)}
        isLowPoly={isLowPoly}
        onLowPolyToggle={handleLowPolyToggle}
      >
         <AIAssistant modelStats={modelStats} onSuggestParams={handleAISuggestion} />
      </Sidebar>

      <OversizedModal 
          oversized={oversizedSlices}
          onAutoSplit={handleAutoSplit}
          onIgnore={() => setOversizedSlices([])} 
      />

      <WelcomeModal 
        isOpen={showWelcome}
        onClose={handleCloseWelcome}
      />

      {showUserGuide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <BookOpen className="w-6 h-6 text-indigo-400" />
                <h2 className="text-xl font-bold text-white">How to Use SliceForge</h2>
              </div>
              <button onClick={() => setShowUserGuide(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center flex-shrink-0 font-bold">1</div>
                  <div>
                    <h3 className="font-semibold text-slate-100">Model Source</h3>
                    <p className="text-slate-400 text-sm">Click 'Choose File' to upload your STL model.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center flex-shrink-0 font-bold">2</div>
                  <div>
                    <h3 className="font-semibold text-slate-100">AI Advice</h3>
                    <p className="text-slate-400 text-sm">Optional: Click 'Analyze & Recommend' to let the AI suggest parameters.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center flex-shrink-0 font-bold">3</div>
                  <div>
                    <h3 className="font-semibold text-slate-100">Scale & Units</h3>
                    <p className="text-slate-400 text-sm">Use the toggle to switch between MM and IN. Check 'Model Dimensions' to ensure the size is correct.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center flex-shrink-0 font-bold">4</div>
                  <div>
                    <h3 className="font-semibold text-slate-100">Material Sheet</h3>
                    <p className="text-slate-400 text-sm">Set the Width, Length, and Thickness of the material you are using.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center flex-shrink-0 font-bold">5</div>
                  <div>
                    <h3 className="font-semibold text-slate-100">Slicing Params</h3>
                    <p className="text-slate-400 text-sm">Select your Slice Axis (X, Y, or Z) and choose a Nesting Strategy (Space or Sequential).</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center flex-shrink-0 font-bold">6</div>
                  <div>
                    <h3 className="font-semibold text-slate-100">Finish</h3>
                    <p className="text-slate-400 text-sm">Use the slider to set your 'Slice Count' and click the purple 'Slice & Nest' button.</p>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-800">
                <p className="text-xs text-slate-500 italic">Note: Ensure your material dimensions are large enough for your model slices to avoid oversized warnings.</p>
              </div>
            </div>
            <div className="p-6 bg-slate-800/50 flex justify-end">
              <button 
                onClick={() => setShowUserGuide(false)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-all"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-grow flex flex-col h-full relative">
        <div className="absolute top-4 left-4 z-10 flex space-x-2 bg-slate-900/90 backdrop-blur p-1 rounded-lg border border-slate-700 shadow-xl">
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
            <div className="w-px h-6 bg-slate-700 mx-1 self-center" />
            <button
                onClick={() => setShowUserGuide(true)}
                className="flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all text-slate-400 hover:text-white hover:bg-slate-800"
            >
                <BookOpen className="w-4 h-4 mr-2" />
                User Guide
            </button>
        </div>

        {error && (
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-900/90 text-red-100 px-6 py-3 rounded-lg shadow-xl border border-red-500/50 flex items-center animate-fade-in-down">
                <AlertTriangle className="w-5 h-5 mr-3" />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-4 text-red-200 hover:text-white font-bold">&times;</button>
            </div>
        )}

        {isProcessing && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]">
                <div className="bg-slate-900/90 border border-slate-700 p-8 rounded-2xl shadow-2xl flex flex-col items-center space-y-4 max-w-sm w-full">
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-bold text-white mb-1">{progress.phase}</h3>
                        <p className="text-slate-400 text-sm">This may take a moment for complex shapes.</p>
                    </div>
                    {progress.total > 0 && (
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div 
                                className="bg-indigo-500 h-full transition-all duration-300 ease-out"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                        </div>
                    )}
                </div>
            </div>
        )}

        <div className="flex-grow relative w-full h-full">
            {activeTab === '3d' && (
                <Viewer3D 
                    key={`${state.geometry?.uuid || 'empty'}-${isLowPoly}`}
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
