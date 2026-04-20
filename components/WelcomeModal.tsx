
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Layers, Scissors, Box, Zap } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row shadow-indigo-500/10"
          >
            {/* Global Close Button */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 z-50 p-2.5 text-slate-400 hover:text-white bg-slate-950/50 hover:bg-slate-800 backdrop-blur-md rounded-full transition-all border border-slate-700/50 no-drag"
              aria-label="Close welcome guide"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Column: Stylized Logo */}
            <div className="md:w-3/5 bg-slate-950 relative flex items-center justify-center min-h-[300px] md:min-h-[500px] border-r border-slate-800">
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#4f46e5_0%,transparent_70%)]" />
              </div>

              <div className="relative z-10 flex flex-col items-center">
                <motion.div 
                  initial={{ rotate: -10, scale: 0.8 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", damping: 12 }}
                  className="w-32 h-32 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/40 mb-8 border-2 border-indigo-400/50"
                >
                  <Layers className="text-white w-16 h-16" />
                </motion.div>
                
                <h1 className="text-5xl font-black text-white tracking-tighter mb-2 italic">
                  SLICE<span className="text-indigo-500 underline underline-offset-8 decoration-4 decoration-indigo-500">FORGE</span>
                </h1>
                <p className="text-slate-500 font-mono text-xs tracking-widest uppercase">Version 1.1.2 // Production Ready</p>
              </div>

              {/* Decorative Tech Grid */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                   style={{backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px'}} />
              
              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-12 h-12 border-l-2 border-t-2 border-indigo-500/30 m-6" />
              <div className="absolute bottom-0 right-0 w-12 h-12 border-r-2 border-b-2 border-indigo-500/30 m-6" />
            </div>

            {/* Right Column: Information */}
            <div className="md:w-2/5 p-8 lg:p-12 flex flex-col justify-center bg-slate-900/50 backdrop-blur-xl relative">
              <div className="space-y-8">
                <div>
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="h-px w-8 bg-indigo-500" />
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Introduction</span>
                  </div>
                  <h2 className="text-4xl font-bold text-white tracking-tighter leading-none mb-4">
                    Slice<span className="text-indigo-400">Forge</span>
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    The ultimate professional-grade slicer designed for accuracy and spatial efficiency.
                  </p>
                </div>

                <div className="space-y-5">
                  <FeatureItem 
                    icon={<Box className="w-5 h-5 text-indigo-400" />}
                    title="3D Visualization"
                    description="Real-time interactive 3D rendering of your STL and OBJ models."
                  />
                  <FeatureItem 
                    icon={<Layers className="w-5 h-5 text-emerald-400" />}
                    title="Smart Slicing"
                    description="Automated layer generation with intelligent splitting for oversized parts."
                  />
                  <FeatureItem 
                    icon={<Zap className="w-5 h-5 text-amber-400" />}
                    title="Optimized Nesting"
                    description="Space-efficient part placement across multiple material sheets."
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center space-x-3 group"
                >
                  <span className="text-lg">Start Slicing Now</span>
                  <Zap className="w-5 h-5 fill-white group-hover:rotate-12 transition-transform" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const FeatureItem = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="flex items-start space-x-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 transition-colors">
    <div className="flex-shrink-0 mt-1">{icon}</div>
    <div>
      <h4 className="text-sm font-semibold text-slate-100 mb-0.5">{title}</h4>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </div>
  </div>
);
