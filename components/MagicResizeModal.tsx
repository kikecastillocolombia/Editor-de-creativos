/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { generateResizedImage } from '../services/geminiService';
import Spinner from './Spinner';

interface MagicResizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageFile: File | null;
}

const MagicResizeModal: React.FC<MagicResizeModalProps> = ({ isOpen, onClose, imageFile }) => {
  const [selectedRatio, setSelectedRatio] = useState<'1:1' | '4:5' | '9:16'>('9:16');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (imageFile) {
        const url = URL.createObjectURL(imageFile);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }
  }, [imageFile]);

  // Reset state when modal opens/closes or image changes
  useEffect(() => {
    if (isOpen) {
        setResultUrl(null);
        setError(null);
        setIsGenerating(false);
    }
  }, [isOpen, imageFile]);

  if (!isOpen || !imageFile) return null;

  const handleResize = async () => {
    setIsGenerating(true);
    setError(null);
    setResultUrl(null);
    
    try {
        const url = await generateResizedImage(imageFile, selectedRatio);
        setResultUrl(url);
    } catch (err: any) {
        setError(err.message || "Failed to resize image");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleDownload = () => {
      if (resultUrl) {
          const link = document.createElement('a');
          link.href = resultUrl;
          link.download = `resized-${selectedRatio}-${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-900">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-purple-400">✨</span> Magic Resize
                </h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl leading-none">&times;</button>
            </div>

            <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
                {/* Controls Side */}
                <div className="w-full md:w-1/3 p-6 border-r border-gray-800 bg-gray-800/30 flex flex-col gap-6 overflow-y-auto">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Select Target Ratio</h3>
                        <div className="grid grid-cols-1 gap-3">
                            <button 
                                onClick={() => setSelectedRatio('1:1')}
                                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${selectedRatio === '1:1' ? 'bg-purple-500/20 border-purple-500 text-white shadow-lg shadow-purple-900/20' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                            >
                                <span className="font-medium">Square (1:1)</span>
                                <div className="w-6 h-6 border-2 border-current rounded-sm"></div>
                            </button>
                            <button 
                                onClick={() => setSelectedRatio('4:5')}
                                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${selectedRatio === '4:5' ? 'bg-purple-500/20 border-purple-500 text-white shadow-lg shadow-purple-900/20' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                            >
                                <span className="font-medium">Portrait (4:5)</span>
                                <div className="w-5 h-6 border-2 border-current rounded-sm"></div>
                            </button>
                            <button 
                                onClick={() => setSelectedRatio('9:16')}
                                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${selectedRatio === '9:16' ? 'bg-purple-500/20 border-purple-500 text-white shadow-lg shadow-purple-900/20' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                            >
                                <span className="font-medium">Story (9:16)</span>
                                <div className="w-4 h-7 border-2 border-current rounded-sm"></div>
                            </button>
                        </div>
                    </div>

                    <div className="mt-auto">
                        <button
                            onClick={handleResize}
                            disabled={isGenerating}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-4 px-6 rounded-lg shadow-lg shadow-purple-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? 'Resizing...' : 'Generate Resize'}
                        </button>
                    </div>
                </div>

                {/* Preview Side */}
                <div className="w-full md:w-2/3 bg-black/50 p-6 flex items-center justify-center relative min-h-[400px]">
                    {isGenerating && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                            <Spinner />
                            <p className="mt-4 text-purple-300 font-medium animate-pulse">Expanding your creative...</p>
                        </div>
                    )}
                    
                    {error && (
                         <div className="text-center bg-red-500/10 border border-red-500/20 p-6 rounded-lg">
                            <h2 className="text-lg font-bold text-red-300 mb-2">Error</h2>
                            <p className="text-sm text-red-400">{error}</p>
                         </div>
                    )}

                    {!resultUrl && !error && previewUrl && (
                        <div className="flex flex-col items-center gap-2 max-w-full h-full justify-center">
                            <p className="text-gray-500 mb-2 text-sm">Original Preview</p>
                             <img src={previewUrl} className="max-w-full max-h-[60vh] object-contain rounded-md border border-gray-700" alt="Preview" />
                        </div>
                    )}

                    {resultUrl && !isGenerating && (
                        <div className="flex flex-col items-center gap-4 w-full h-full justify-center">
                             <img src={resultUrl} className="max-w-full max-h-[65vh] object-contain rounded-md shadow-2xl border border-gray-700" alt="Resized Result" />
                             <div className="flex gap-4">
                                <button onClick={handleDownload} className="bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-6 rounded-full shadow-lg transition-transform hover:-translate-y-0.5">
                                    Download Result
                                </button>
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default MagicResizeModal;