
import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { ModelStats, Axis } from '../types';

interface AIAssistantProps {
    modelStats: ModelStats | null;
    onSuggestParams: (axis: Axis, count: number) => void;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ modelStats, onSuggestParams }) => {
    const [loading, setLoading] = useState(false);
    const [advice, setAdvice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!modelStats) return;
        if (!process.env.API_KEY) {
            setError("API Key not found. Please configure process.env.API_KEY.");
            return;
        }

        setLoading(true);
        setError(null);
        
        try {
            /* Initialize GoogleGenAI with API KEY from environment variable */
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `
                I have a 3D model with the following statistics:
                Dimensions: X=${modelStats.dimensions.x.toFixed(2)}, Y=${modelStats.dimensions.y.toFixed(2)}, Z=${modelStats.dimensions.z.toFixed(2)} units.
                Volume: ${modelStats.volume.toFixed(2)} cubic units.
                Triangle Count: ${modelStats.triangleCount}.
                
                I need to slice this model into flat layers for laser cutting assembly.
                Please analyze these stats and recommend:
                1. The best slicing axis (X, Y, or Z) to preserve structural integrity or visual detail.
                2. An optimal slice count (between 5 and 50).
                3. A brief explanation of why.
            `;

            /* Request structured JSON response using gemini-3-pro-preview */
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            recommendedAxis: {
                                type: Type.STRING,
                                description: 'The best slicing axis (x, y, or z).',
                            },
                            recommendedCount: {
                                type: Type.NUMBER,
                                description: 'The recommended number of layers (5-50).',
                            },
                            explanation: {
                                type: Type.STRING,
                                description: 'Rationale for the recommendation.',
                            }
                        },
                        required: ["recommendedAxis", "recommendedCount", "explanation"],
                        propertyOrdering: ["recommendedAxis", "recommendedCount", "explanation"]
                    }
                }
            });
            
            /* Extract and parse JSON from the property .text */
            const text = response.text;
            if (text) {
                const result = JSON.parse(text);
                setAdvice(result.explanation);
                onSuggestParams(result.recommendedAxis.toLowerCase() as Axis, Math.round(result.recommendedCount));
            }

        } catch (e) {
            console.error(e);
            setError("Failed to analyze model. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 bg-slate-800 rounded-lg border border-indigo-500/30 mt-4">
            <div className="flex items-center space-x-2 mb-3">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-md font-semibold text-indigo-100">AI Slice Advisor</h3>
            </div>
            
            {!modelStats ? (
                <p className="text-sm text-slate-400">Load a model to enable AI analysis.</p>
            ) : (
                <>
                    <p className="text-xs text-slate-400 mb-3">
                        Get optimized slicing parameters powered by Gemini 3 Pro.
                    </p>
                    
                    {advice && (
                        <div className="mb-3 p-3 bg-indigo-900/20 border border-indigo-500/20 rounded text-sm text-indigo-200">
                            {advice}
                        </div>
                    )}

                    {error && (
                         <div className="mb-3 p-3 bg-red-900/20 border border-red-500/20 rounded text-sm text-red-200 flex items-center">
                            <AlertCircle className="w-4 h-4 mr-2" />
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleAnalyze}
                        disabled={loading}
                        className="w-full flex items-center justify-center py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Analyzing Geometry...
                            </>
                        ) : (
                            "Analyze & Recommend"
                        )}
                    </button>
                </>
            )}
        </div>
    );
};
