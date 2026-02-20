
import React, { useState, useEffect } from 'react';
import { Layers, Settings, FileBox, Scissors, Maximize, Lock, Unlock, RotateCcw, Link as LinkIcon, GripHorizontal, ListOrdered, Monitor } from 'lucide-react';
import { Axis, MaterialSettings, SliceSettings, ModelStats } from '../types';

interface SidebarProps {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  material: MaterialSettings;
  setMaterial: React.Dispatch<React.SetStateAction<MaterialSettings>>;
  sliceSettings: SliceSettings;
  setSliceSettings: React.Dispatch<React.SetStateAction<SliceSettings>>;
  onSlice: () => void;
  isProcessing: boolean;
  canSlice: boolean;
  activeTab: string;
  modelStats: ModelStats | null;
  onResize: (dims: { x: number; y: number; z: number }) => void;
  children?: React.ReactNode;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onShowInstall?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onFileChange,
  material,
  setMaterial,
  sliceSettings,
  setSliceSettings,
  onSlice,
  isProcessing,
  canSlice,
  children,
  modelStats,
  onResize,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onShowInstall
}) => {
  const [localDims, setLocalDims] = useState<{ x: string; y: string; z: string }>({ x: '', y: '', z: '' });
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [modelUnit, setModelUnit] = useState<'mm' | 'in'>('mm');
  const [localMaterial, setLocalMaterial] = useState<MaterialSettings>(material);
  const [localSliceSettings, setLocalSliceSettings] = useState<SliceSettings>(sliceSettings);

  useEffect(() => {
    if (modelStats) {
      const factor = modelUnit === 'in' ? 1 / 25.4 : 1;
      setLocalDims({
        x: (modelStats.dimensions.x * factor).toFixed(2),
        y: (modelStats.dimensions.y * factor).toFixed(2),
        z: (modelStats.dimensions.z * factor).toFixed(2),
      });
    } else {
      setLocalDims({ x: '', y: '', z: '' });
    }
  }, [modelStats, modelUnit]);

  useEffect(() => {
      setLocalMaterial(material);
  }, [material]);

  useEffect(() => {
      setLocalSliceSettings(sliceSettings);
  }, [sliceSettings]);

  const handleDimChange = (axis: 'x' | 'y' | 'z', value: string) => {
    setLocalDims(prev => ({ ...prev, [axis]: value }));
  };

  const commitResize = (changedAxis?: 'x' | 'y' | 'z') => {
    if (!modelStats) return;
    const toRaw = (val: string) => {
        const num = parseFloat(val);
        if (isNaN(num)) return undefined;
        return modelUnit === 'in' ? num * 25.4 : num;
    };
    const toDisplay = (val: number) => {
        return modelUnit === 'in' ? (val / 25.4).toFixed(2) : val.toFixed(2);
    }
    let newX = toRaw(localDims.x) ?? modelStats.dimensions.x;
    let newY = toRaw(localDims.y) ?? modelStats.dimensions.y;
    let newZ = toRaw(localDims.z) ?? modelStats.dimensions.z;
    if (lockAspectRatio && changedAxis) {
      const original = modelStats.dimensions;
      if (changedAxis === 'x') {
        const ratio = newX / original.x;
        newY = original.y * ratio;
        newZ = original.z * ratio;
      } else if (changedAxis === 'y') {
        const ratio = newY / original.y;
        newX = original.x * ratio;
        newZ = original.z * ratio;
      } else if (changedAxis === 'z') {
        const ratio = newZ / original.z;
        newX = original.x * ratio;
        newY = original.y * ratio;
      }
      setLocalDims({
        x: toDisplay(newX),
        y: toDisplay(newY),
        z: toDisplay(newZ)
      });
    }
    onResize({ x: newX, y: newY, z: newZ });
  };

  const handleKeyDown = (e: React.KeyboardEvent, axis: 'x' | 'y' | 'z') => {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
      commitResize(axis);
    }
  };

  const handleReset = () => {
      if (modelStats) {
          const factor = modelUnit === 'in' ? 1 / 25.4 : 1;
          setLocalDims({
            x: (modelStats.dimensions.x * factor).toFixed(2),
            y: (modelStats.dimensions.y * factor).toFixed(2),
            z: (modelStats.dimensions.z * factor).toFixed(2),
          });
      }
  };

  const commitMaterial = () => {
      if (JSON.stringify(localMaterial) !== JSON.stringify(material)) {
          setMaterial(localMaterial);
      }
  };

  const handleMaterialChange = (updates: Partial<MaterialSettings>) => {
      setLocalMaterial(prev => ({ ...prev, ...updates }));
  };

  const commitSliceSettings = () => {
      if (JSON.stringify(localSliceSettings) !== JSON.stringify(sliceSettings)) {
          setSliceSettings(localSliceSettings);
      }
  };
  
  const handleLocalSliceChange = (updates: Partial<SliceSettings>) => {
      setLocalSliceSettings(prev => ({ ...prev, ...updates }));
  };

  const handleSyncToggle = (checked: boolean) => {
      const newSettings = {
          ...sliceSettings,
          syncWithMaterial: checked,
          layerHeight: checked ? material.thickness : sliceSettings.layerHeight
      };
      setLocalSliceSettings(newSettings);
      setSliceSettings(newSettings);
  };

  return (
    <div className="w-full md:w-96 bg-slate-900 border-r border-slate-800 flex flex-col h-screen overflow-y-auto">
      <div className="p-6 border-b border-slate-800 draggable-region">
        <div className="flex items-center justify-between pt-2"> 
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-2 rounded-lg no-drag">
              <Layers className="text-white w-6 h-6" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-white tracking-tight">SliceForge</h1>
                <p className="text-[10px] text-slate-500">Professional Slicing</p>
            </div>
          </div>
          
          <div className="flex space-x-1 no-drag">
               {onUndo && (
                 <button 
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Undo"
                 >
                     <RotateCcw className="w-4 h-4 -scale-x-100" /> 
                 </button>
               )}
               {onRedo && (
                 <button 
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Redo"
                 >
                     <RotateCcw className="w-4 h-4" />
                 </button>
               )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8 flex-grow">
        <section>
          <label className="flex items-center text-sm font-medium text-slate-300 mb-3">
            <FileBox className="w-4 h-4 mr-2 text-indigo-400" />
            Model Source
          </label>
          <div className="relative">
            <input
              type="file"
              accept=".stl,.obj"
              onChange={(e) => {
                  onFileChange(e);
                  e.target.value = ''; 
              }}
              className="block w-full text-sm text-slate-400
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-md file:border-0
                        file:text-sm file:font-semibold
                        file:bg-slate-800 file:text-indigo-400
                        hover:file:bg-slate-700
                        cursor-pointer"
            />
          </div>
        </section>

        {children}

        <section>
            <div className="flex justify-between items-center mb-3">
                <label className="flex items-center text-sm font-medium text-slate-300">
                    <Maximize className="w-4 h-4 mr-2 text-indigo-400" />
                    Model Dimensions
                </label>
                <div className="flex items-center space-x-2">
                    <div className="flex bg-slate-800 rounded p-0.5">
                        <button
                            onClick={() => setModelUnit('mm')}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded ${modelUnit === 'mm' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            mm
                        </button>
                        <button
                            onClick={() => setModelUnit('in')}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded ${modelUnit === 'in' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            in
                        </button>
                    </div>
                    
                    <button 
                        onClick={() => setLockAspectRatio(!lockAspectRatio)}
                        className={`p-1 rounded hover:bg-slate-800 transition-colors ${lockAspectRatio ? 'text-indigo-400' : 'text-slate-500'}`}
                        title={lockAspectRatio ? "Unlock Aspect Ratio" : "Lock Aspect Ratio"}
                    >
                        {lockAspectRatio ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                    <span className="text-[10px] text-slate-500 mb-1 block uppercase">Width (X) {modelUnit}</span>
                    <input
                        type="number"
                        step="0.1"
                        value={localDims.x}
                        disabled={!modelStats}
                        onChange={(e) => handleDimChange('x', e.target.value)}
                        onBlur={() => commitResize('x')}
                        onKeyDown={(e) => handleKeyDown(e, 'x')}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                </div>
                <div>
                    <span className="text-[10px] text-slate-500 mb-1 block uppercase">Length (Y) {modelUnit}</span>
                    <input
                        type="number"
                        step="0.1"
                        value={localDims.y}
                        disabled={!modelStats}
                        onChange={(e) => handleDimChange('y', e.target.value)}
                        onBlur={() => commitResize('y')}
                        onKeyDown={(e) => handleKeyDown(e, 'y')}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                </div>
                <div>
                    <span className="text-[10px] text-slate-500 mb-1 block uppercase">Height (Z) {modelUnit}</span>
                    <input
                        type="number"
                        step="0.1"
                        value={localDims.z}
                        disabled={!modelStats}
                        onChange={(e) => handleDimChange('z', e.target.value)}
                        onBlur={() => commitResize('z')}
                        onKeyDown={(e) => handleKeyDown(e, 'z')}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                </div>
            </div>
            {modelStats && (
                 <div className="flex justify-end">
                     <button onClick={handleReset} className="text-[10px] text-slate-500 hover:text-indigo-400 flex items-center transition-colors">
                         <RotateCcw className="w-3 h-3 mr-1" />
                         Reset Inputs
                     </button>
                 </div>
            )}
        </section>

        <section>
          <div className="flex justify-between items-center mb-3">
            <label className="flex items-center text-sm font-medium text-slate-300">
              <Settings className="w-4 h-4 mr-2 text-indigo-400" />
              Material Sheet
            </label>
            <div className="flex bg-slate-800 rounded p-0.5">
              <button
                onClick={() => {
                    setLocalMaterial(m => ({ ...m, unit: 'mm' }));
                    setMaterial({ ...material, unit: 'mm' });
                }}
                className={`px-2 py-0.5 text-xs font-medium rounded ${localMaterial.unit === 'mm' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                mm
              </button>
              <button
                onClick={() => {
                    setLocalMaterial(m => ({ ...m, unit: 'in' }));
                    setMaterial({ ...material, unit: 'in' });
                }}
                className={`px-2 py-0.5 text-xs font-medium rounded ${localMaterial.unit === 'in' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                in
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-slate-500 mb-1 block">Width ({localMaterial.unit})</span>
              <input
                type="number"
                value={localMaterial.width}
                onChange={(e) => handleMaterialChange({ width: Number(e.target.value) })}
                onBlur={commitMaterial}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <span className="text-xs text-slate-500 mb-1 block">Length ({localMaterial.unit})</span>
              <input
                type="number"
                value={localMaterial.length}
                onChange={(e) => handleMaterialChange({ length: Number(e.target.value) })}
                onBlur={commitMaterial}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="col-span-2">
              <span className="text-xs text-slate-500 mb-1 block">Thickness ({localMaterial.unit})</span>
              <input
                type="number"
                value={localMaterial.thickness}
                onChange={(e) => handleMaterialChange({ thickness: Number(e.target.value) })}
                onBlur={() => {
                    commitMaterial();
                    if (sliceSettings.syncWithMaterial) {
                        setSliceSettings({ ...sliceSettings, layerHeight: Number(localMaterial.thickness) });
                    }
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </section>

        <section>
          <label className="flex items-center text-sm font-medium text-slate-300 mb-3">
            <Scissors className="w-4 h-4 mr-2 text-indigo-400" />
            Slicing Parameters
          </label>

          <div className="space-y-4">
            <div>
              <span className="text-xs text-slate-500 mb-2 block">Slice Axis</span>
              <div className="flex bg-slate-800 rounded-md p-1">
                {(['x', 'y', 'z'] as Axis[]).map((axis) => (
                  <button
                    key={axis}
                    onClick={() => setSliceSettings({ ...sliceSettings, axis })}
                    className={`flex-1 py-1 text-xs font-medium rounded uppercase transition-all ${sliceSettings.axis === axis
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    {axis}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <span className="text-xs text-slate-500 mb-2 block">Nesting Strategy</span>
              <div className="flex bg-slate-800 rounded-md p-1">
                 <button
                    onClick={() => setSliceSettings({ ...sliceSettings, nestingOrder: 'optimized' })}
                    className={`flex-1 py-1 text-xs font-medium rounded flex items-center justify-center transition-all ${
                        (!sliceSettings.nestingOrder || sliceSettings.nestingOrder === 'optimized')
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                 >
                     <GripHorizontal className="w-3 h-3 mr-1" />
                     Space
                 </button>
                 <button
                    onClick={() => setSliceSettings({ ...sliceSettings, nestingOrder: 'sequential' })}
                    className={`flex-1 py-1 text-xs font-medium rounded flex items-center justify-center transition-all ${
                        sliceSettings.nestingOrder === 'sequential'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                 >
                     <ListOrdered className="w-3 h-3 mr-1" />
                     Sequential
                 </button>
              </div>
            </div>

            <div>
              <div className="flex bg-slate-800 rounded-md p-1 mb-3">
                <button
                  onClick={() => setSliceSettings({ ...sliceSettings, mode: 'count' })}
                  className={`flex-1 py-1 text-xs font-medium rounded transition-all ${sliceSettings.mode === 'count'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                    }`}
                >
                  By Count
                </button>
                <button
                  onClick={() => setSliceSettings({ ...sliceSettings, mode: 'height' })}
                  className={`flex-1 py-1 text-xs font-medium rounded transition-all ${sliceSettings.mode === 'height'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                    }`}
                >
                  By Height
                </button>
              </div>

              {sliceSettings.mode === 'count' ? (
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs text-slate-500">Slice Count</span>
                    <span className="text-xs text-indigo-400 font-mono">{localSliceSettings.count}</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="100"
                    value={localSliceSettings.count}
                    onChange={(e) => handleLocalSliceChange({ count: Number(e.target.value) })}
                    onMouseUp={commitSliceSettings}
                    onTouchEnd={commitSliceSettings}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs text-slate-500">Layer Height (units)</span>
                    <label className="flex items-center cursor-pointer">
                        <input 
                            type="checkbox"
                            checked={!!sliceSettings.syncWithMaterial}
                            onChange={(e) => handleSyncToggle(e.target.checked)}
                            className="w-3 h-3 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 mr-1.5"
                        />
                        <span className="text-[10px] text-indigo-400 flex items-center select-none">
                            <LinkIcon className="w-3 h-3 mr-1" />
                            Sync
                        </span>
                    </label>
                  </div>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={localSliceSettings.layerHeight}
                    disabled={localSliceSettings.syncWithMaterial}
                    onChange={(e) => handleLocalSliceChange({ layerHeight: Number(e.target.value) })}
                    onBlur={commitSliceSettings}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                    className={`w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${localSliceSettings.syncWithMaterial ? 'text-indigo-300' : ''}`}
                    placeholder="e.g. 5.0"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <button
          onClick={onSlice}
          disabled={!canSlice || isProcessing}
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-lg shadow-lg shadow-indigo-500/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {isProcessing ? (
             <div className="flex items-center justify-center space-x-2">
                 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                 <span>Generating...</span>
             </div>
          ) : (
             'Slice & Nest'
          )}
        </button>

        {onShowInstall && (
          <button 
            onClick={onShowInstall}
            className="w-full mt-2 flex items-center justify-center space-x-2 py-3 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-indigo-500/20 rounded-lg text-sm font-semibold transition-all group"
          >
            <Monitor className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span>Install Desktop App</span>
          </button>
        )}
      </div>

      <div className="p-4 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-600">v1.1.2 &copy; 2025 SliceForge</p>
      </div>
    </div>
  );
};
