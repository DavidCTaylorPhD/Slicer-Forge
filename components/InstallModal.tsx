
import React from 'react';
import { X, Monitor, Download, CheckCircle, ArrowRight } from 'lucide-react';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: () => void;
  isInstallable: boolean;
}

export const InstallModal: React.FC<InstallModalProps> = ({ isOpen, onClose, onInstall, isInstallable }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Monitor className="text-white w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">Install SliceForge 3D</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-indigo-400 font-semibold text-sm uppercase tracking-wider">The Desktop Experience</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Transform SliceForge into a high-performance Windows application. No browser tabs, faster loading, and offline access.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                <div>
                  <p className="text-white text-sm font-medium">Standalone Window</p>
                  <p className="text-slate-500 text-xs">Run without browser distractions.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                <div>
                  <p className="text-white text-sm font-medium">Desktop & Taskbar</p>
                  <p className="text-slate-500 text-xs">Pin it just like any .exe program.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                <div>
                  <p className="text-white text-sm font-medium">Offline Support</p>
                  <p className="text-slate-500 text-xs">Access your tools without internet.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 space-y-6">
            <h4 className="text-white font-semibold text-center">How to Install</h4>
            
            {isInstallable ? (
              <div className="space-y-4">
                <p className="text-slate-400 text-xs text-center">
                  Click the button below to trigger the secure system installation prompt.
                </p>
                <button 
                  onClick={onInstall}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 transition-all transform active:scale-95"
                >
                  <Download className="w-5 h-5" />
                  <span>Install Now</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                  <p className="text-amber-200 text-xs leading-relaxed">
                    Browser prompt not detected. You can manually install by clicking the 
                    <strong className="text-white"> 'Install' icon </strong> 
                    in your address bar (top right) or via 
                    <strong className="text-white"> Menu &gt; Apps &gt; Install SliceForge</strong>.
                  </p>
                </div>
                <div className="flex justify-center">
                   <img 
                    src="https://web-dev.imgix.net/image/tc9uz7pbc3XF9akm0996vYy9nRy1/6pE7pE7pE7pE7pE7pE7p.png?auto=format&w=300" 
                    alt="Install UI Example" 
                    className="rounded-lg border border-slate-600 opacity-50 grayscale"
                   />
                </div>
              </div>
            )}
            
            <div className="pt-2 border-t border-slate-700">
               <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Standard PWA Framework</span>
                  <ArrowRight className="w-3 h-3" />
                  <span>v1.1.2 Production</span>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
