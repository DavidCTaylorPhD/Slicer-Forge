
import React from 'react';
import { AlertTriangle, Scissors, XCircle } from 'lucide-react';
import { Slice } from '../types';

interface OversizedModalProps {
  oversized: Slice[];
  onAutoSplit: () => void;
  onIgnore: () => void;
}

export const OversizedModal: React.FC<OversizedModalProps> = ({ oversized, onAutoSplit, onIgnore }) => {
  if (oversized.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-red-500/50 rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-red-900/30 p-4 border-b border-red-500/30 flex items-center">
          <AlertTriangle className="w-6 h-6 text-red-400 mr-3" />
          <h2 className="text-lg font-bold text-white">Parts Too Large</h2>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-slate-300 text-sm leading-relaxed">
            <strong className="text-white">{oversized.length} part(s)</strong> exceed the dimensions of your material sheet. 
            They cannot be laser cut as a single piece.
          </p>
          
          <div className="bg-slate-800 rounded p-3 max-h-32 overflow-y-auto border border-slate-700">
            <ul className="space-y-1">
                {oversized.map(s => (
                    <li key={s.id} className="text-xs text-slate-400 flex justify-between">
                        <span>Slice ID: {s.id}</span>
                        <span>{s.bounds.width.toFixed(1)} x {s.bounds.height.toFixed(1)} mm</span>
                    </li>
                ))}
            </ul>
          </div>

          <p className="text-slate-400 text-xs border-l-2 border-indigo-500 pl-3">
            <strong>Auto-Split</strong> will break these into smaller pieces with interlocking puzzle joints.
            <br/><br/>
            Split parts will be labeled sequentially (e.g., Layer 12 becomes <strong>12.1</strong> and <strong>12.2</strong>) so you can easily identify and assemble them.
          </p>
        </div>

        <div className="p-4 bg-slate-800/50 flex space-x-3">
          <button 
            onClick={onIgnore}
            className="flex-1 py-2 px-4 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors text-sm font-medium"
          >
            Ignore
          </button>
          <button 
            onClick={onAutoSplit}
            className="flex-1 py-2 px-4 rounded-lg bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-lg transition-all transform active:scale-95 text-sm font-bold flex items-center justify-center"
          >
            <Scissors className="w-4 h-4 mr-2" />
            Break & Joint Parts
          </button>
        </div>
      </div>
    </div>
  );
};
