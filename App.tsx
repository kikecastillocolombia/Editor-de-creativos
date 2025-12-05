
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { generateEditedImage, generateFilteredImage, generateAdjustedImage, generateAdVariation } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import { UndoIcon, RedoIcon, EyeIcon, UploadIcon, ResizeIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import MagicResizeModal from './components/MagicResizeModal';
import ChatBot from './components/ChatBot';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

type Tab = 'retouch' | 'adjust' | 'filters' | 'crop';
type ViewMode = 'editor' | 'generator';

// Define ad strategies with their potential prompts
const AD_STRATEGIES = {
    'Texto': [
        "Add a short, punchy headline in English (max 4 words) at the top like 'BEST SELLER' or 'NEW ARRIVAL'.",
        "Add text overlaid that emphasizes a benefit (e.g., 'Fast Results' or 'High Quality').",
        "Place a bold promotional text at the bottom saying 'Shop Now'.",
        "Remove any existing text and keep the product clean and minimalist."
    ],
    'Fondo': [
        "Change the background to a solid dark color (like matte black or navy) to make the product pop.",
        "Change the background to a solid light pastel color for a soft look.",
        "Change the background to a vibrant brand color like bright yellow or red.",
        "Set the background to pure clean white, DTC style.",
        "Add a subtle texture to the background like concrete or marble."
    ],
    'CTA': [
        "Add a visible 'Shop Now' button graphic in the bottom right corner.",
        "Add a textual Call to Action 'Discover More' in a stylish font.",
        "Add an 'Offer Ends Soon' element in the top corner."
    ],
    'Producto': [
        "Zoom in slightly on the product to show more detail.",
        "Show the product in a lifestyle context (e.g., on a table, in a hand).",
        "Give the product a 3D mockup feel with dynamic lighting."
    ],
    'Composición': [
        "Center the product perfectly with symmetrical spacing.",
        "Place the product to one side leaving negative space for text on the other.",
        "Add a thin elegant frame or border around the image."
    ],
    'Prueba Social': [
        "Add a graphic overlay of 5 stars (⭐⭐⭐⭐⭐) to suggest high ratings.",
        "Add a small badge saying 'Customer Favorite'.",
        "Add a short quote visual saying 'Highly Recommended'."
    ],
    'Urgencia': [
        "Add a 'Limited Edition' label.",
        "Add a 'Flash Sale -20%' badge.",
        "Add a 'Today Only' sticker graphic."
    ],
    'Color': [
        "Increase the saturation and vibrance of the product colors.",
        "Change the color palette to be warm (golden hour tones).",
        "Change the color palette to be cool and sleek (blues and silvers)."
    ],
    'Simple': [
        "Simple variation: Solid contrasting background color.",
        "Simple variation: Minimalist with no text or distractions.",
        "Simple variation: Add a simple border."
    ]
};

interface VariationResult {
  id: string;
  label: string;
  prompt: string;
  url: string | null;
  loading: boolean;
  error: string | null;
}

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('generator');

  // --- EDITOR STATE ---
  const [history, setHistory] = useState<File[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editHotspot, setEditHotspot] = useState<{ x: number, y: number } | null>(null);
  const [displayHotspot, setDisplayHotspot] = useState<{ x: number, y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('retouch');
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // --- AD GENERATOR STATE ---
  const [adBaseImage, setAdBaseImage] = useState<File | null>(null);
  const [adBaseImageUrl, setAdBaseImageUrl] = useState<string | null>(null);
  const [customAdPrompt, setCustomAdPrompt] = useState('');
  const [variations, setVariations] = useState<VariationResult[]>([]);

  // Magic Resize State
  const [resizeModalOpen, setResizeModalOpen] = useState(false);
  const [imageToResize, setImageToResize] = useState<File | null>(null);

  const currentImage = history[historyIndex] ?? null;
  const originalImage = history[0] ?? null;

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  // Effect to create and revoke object URLs safely for the current image
  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [currentImage]);
  
  // Effect to create and revoke object URLs safely for the original image
  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalImageUrl(null);
    }
  }, [originalImage]);

  // Effect for Ad Generator base image
  useEffect(() => {
    if (adBaseImage) {
      const url = URL.createObjectURL(adBaseImage);
      setAdBaseImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAdBaseImageUrl(null);
    }
  }, [adBaseImage]);


  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const addImageToHistory = useCallback((newImageFile: File) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    // Reset transient states after an action
    setCrop(undefined);
    setCompletedCrop(undefined);
  }, [history, historyIndex]);

  // Loads a file into the editor WITHOUT resetting Ad Generator state
  const loadFileIntoEditor = useCallback((file: File) => {
    setError(null);
    setHistory([file]);
    setHistoryIndex(0);
    setEditHotspot(null);
    setDisplayHotspot(null);
    setActiveTab('retouch');
    setCrop(undefined);
    setCompletedCrop(undefined);
  }, []);

  // Handles a completely new image upload (resets everything)
  const handleNewSession = useCallback((file: File) => {
    loadFileIntoEditor(file);
    
    // Also set as ad base image and reset variations
    setAdBaseImage(file);
    setVariations([]);
  }, [loadFileIntoEditor]);

  const handleAdImageUpload = (file: File) => {
    // Only reset variations and base image, let user explicitly click generate
    setAdBaseImage(file);
    setVariations([]);
    
    // Also load into editor in background so if they switch tabs it's ready
    loadFileIntoEditor(file);
  };

  const createVariation = (label: string, prompt: string): VariationResult => ({
      id: crypto.randomUUID(),
      label,
      prompt,
      url: null,
      loading: true,
      error: null
  });

  const processVariation = async (variation: VariationResult) => {
      if (!adBaseImage) return;
      try {
          const url = await generateAdVariation(adBaseImage, variation.prompt);
          setVariations(prev => prev.map(v => v.id === variation.id ? { ...v, url, loading: false } : v));
      } catch (e: any) {
          setVariations(prev => prev.map(v => v.id === variation.id ? { ...v, error: e.message || 'Error', loading: false } : v));
      }
  };

  const handleGenerateCustom = () => {
      if (!customAdPrompt.trim()) return;
      const newVariation = createVariation('Personalizado', customAdPrompt);
      setVariations(prev => [newVariation, ...prev]); // Add to top
      processVariation(newVariation);
      setCustomAdPrompt('');
  };

  const handleGenerateStrategy = (category: keyof typeof AD_STRATEGIES) => {
      const prompts = AD_STRATEGIES[category];
      const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
      
      const newVariation = createVariation(category, randomPrompt);
      setVariations(prev => [newVariation, ...prev]);
      processVariation(newVariation);
  };

  const handleGenerateMix = () => {
    if (!adBaseImage) return;

    // Pick 5 distinct categories randomly
    const categories = Object.keys(AD_STRATEGIES) as (keyof typeof AD_STRATEGIES)[];
    const shuffledCats = categories.sort(() => 0.5 - Math.random()).slice(0, 5);

    const newVariations = shuffledCats.map(cat => {
        const prompts = AD_STRATEGIES[cat];
        const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
        return createVariation(cat, randomPrompt);
    });

    setVariations(prev => [...newVariations, ...prev]);
    newVariations.forEach(v => processVariation(v));
  };

  const handleEditVariation = (url: string) => {
      const file = dataURLtoFile(url, `variation-${Date.now()}.png`);
      // Use loadFileIntoEditor to preserve Ad Generator state (variations & base image)
      loadFileIntoEditor(file);
      setViewMode('editor');
  };

  const handleOpenMagicResize = (fileOrUrl: File | string) => {
      if (typeof fileOrUrl === 'string') {
          const file = dataURLtoFile(fileOrUrl, 'resize-target.png');
          setImageToResize(file);
      } else {
          setImageToResize(fileOrUrl);
      }
      setResizeModalOpen(true);
  };

  const handleGenerate = useCallback(async () => {
    if (!currentImage) {
      setError('No hay imagen cargada para editar.');
      return;
    }
    
    if (!prompt.trim()) {
        setError('Por favor ingresa una descripción para tu edición.');
        return;
    }

    if (!editHotspot) {
        setError('Por favor haz clic en la imagen para seleccionar un área a editar.');
        return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
        const editedImageUrl = await generateEditedImage(currentImage, prompt, editHotspot);
        const newImageFile = dataURLtoFile(editedImageUrl, `edited-${Date.now()}.png`);
        addImageToHistory(newImageFile);
        setEditHotspot(null);
        setDisplayHotspot(null);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
        setError(`Error al generar la imagen. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, prompt, editHotspot, addImageToHistory]);
  
  const handleApplyFilter = useCallback(async (filterPrompt: string) => {
    if (!currentImage) {
      setError('No hay imagen cargada para aplicar un filtro.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const filteredImageUrl = await generateFilteredImage(currentImage, filterPrompt);
        const newImageFile = dataURLtoFile(filteredImageUrl, `filtered-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
        setError(`Error al aplicar el filtro. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory]);
  
  const handleApplyAdjustment = useCallback(async (adjustmentPrompt: string) => {
    if (!currentImage) {
      setError('No hay imagen cargada para aplicar un ajuste.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const adjustedImageUrl = await generateAdjustedImage(currentImage, adjustmentPrompt);
        const newImageFile = dataURLtoFile(adjustedImageUrl, `adjusted-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
        setError(`Error al aplicar el ajuste. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory]);

  const handleApplyCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current) {
        setError('Por favor selecciona un área para recortar.');
        return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        setError('No se pudo procesar el recorte.');
        return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = completedCrop.width * pixelRatio;
    canvas.height = completedCrop.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height,
    );
    
    const croppedImageUrl = canvas.toDataURL('image/png');
    const newImageFile = dataURLtoFile(croppedImageUrl, `cropped-${Date.now()}.png`);
    addImageToHistory(newImageFile);

  }, [completedCrop, addImageToHistory]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      setHistoryIndex(historyIndex - 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [canUndo, historyIndex]);
  
  const handleRedo = useCallback(() => {
    if (canRedo) {
      setHistoryIndex(historyIndex + 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [canRedo, historyIndex]);

  const handleReset = useCallback(() => {
    if (history.length > 0) {
      setHistoryIndex(0);
      setError(null);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [history]);

  const handleUploadNew = useCallback(() => {
      setHistory([]);
      setHistoryIndex(-1);
      setError(null);
      setPrompt('');
      setEditHotspot(null);
      setDisplayHotspot(null);
      setAdBaseImage(null);
  }, []);

  const handleDownload = useCallback((imgFile: File | null) => {
      if (imgFile) {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(imgFile);
          link.download = `calmeditor-${imgFile.name}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
      }
  }, []);
  
  const handleFileSelect = (files: FileList | null) => {
    if (files && files[0]) {
      handleNewSession(files[0]);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (activeTab !== 'retouch') return;
    
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    setDisplayHotspot({ x: offsetX, y: offsetY });

    const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
    const scaleX = naturalWidth / clientWidth;
    const scaleY = naturalHeight / clientHeight;

    const originalX = Math.round(offsetX * scaleX);
    const originalY = Math.round(offsetY * scaleY);

    setEditHotspot({ x: originalX, y: originalY });
};
  
  const tabLabels: Record<Tab, string> = {
      retouch: 'Retoque',
      crop: 'Recortar',
      adjust: 'Ajustes',
      filters: 'Filtros'
  };

  const renderAdGenerator = () => {
    if (!adBaseImage) {
        return (
            <div className="flex flex-col items-center justify-center w-full min-h-[50vh] p-8">
                <div className="max-w-xl text-center space-y-6">
                    <h2 className="text-3xl font-bold text-gray-100">Generador de Variaciones para Meta</h2>
                    <p className="text-gray-400">Sube tu creativo para generar automáticamente variaciones de alto rendimiento. Optimiza fondos, textos, CTAs y más.</p>
                     <div className="flex flex-col items-center gap-4">
                        <label className="relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white bg-blue-600 rounded-full cursor-pointer hover:bg-blue-500 transition-colors">
                            <UploadIcon className="w-6 h-6 mr-3" />
                            Subir Creativo
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleAdImageUpload(e.target.files[0])} />
                        </label>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="w-full max-w-7xl mx-auto flex flex-col gap-8 animate-fade-in pb-12">
            <div className="flex flex-col lg:flex-row gap-8 items-start">
                 {/* Left Column: Original + Controls */}
                <div className="w-full lg:w-1/3 flex flex-col gap-6">
                     
                     {/* Original Image */}
                     <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Creativo Original</h3>
                        <div className="relative rounded-xl overflow-hidden shadow-lg border border-gray-700 bg-black/20 group">
                            {adBaseImageUrl && <img src={adBaseImageUrl} alt="Original" className="w-full h-auto object-cover max-h-[400px]" />}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                <button 
                                    onClick={() => adBaseImage && handleOpenMagicResize(adBaseImage)}
                                    className="bg-purple-600/90 text-white font-semibold px-4 py-2 rounded-full text-sm hover:bg-purple-500 flex items-center gap-2"
                                >
                                    <ResizeIcon className="w-4 h-4" />
                                    Redimensión Mágica
                                </button>
                            </div>
                        </div>
                        <button onClick={handleUploadNew} className="text-xs text-gray-500 hover:text-white underline text-center mt-1">Subir Otra Imagen</button>
                     </div>

                     {/* Custom Input */}
                     <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                        <h3 className="text-sm font-bold text-gray-300 mb-2">Variación Alternativa</h3>
                        <div className="flex flex-col gap-2">
                             <textarea 
                                value={customAdPrompt}
                                onChange={(e) => setCustomAdPrompt(e.target.value)}
                                placeholder="Describe el cambio específico (ej. 'Pon el producto sobre arena de playa')..."
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 focus:ring-1 focus:ring-blue-500 outline-none resize-none h-20"
                             />
                             <button 
                                onClick={handleGenerateCustom}
                                disabled={!customAdPrompt.trim()}
                                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
                             >
                                Generar Personalizada
                             </button>
                        </div>
                     </div>

                     {/* Quick Actions Grid */}
                     <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
                        <h3 className="text-sm font-bold text-gray-300 mb-3">Cambios Rápidos (Aleatorios)</h3>
                        <div className="grid grid-cols-2 gap-2">
                             {Object.keys(AD_STRATEGIES).map((strategy) => (
                                 <button
                                    key={strategy}
                                    onClick={() => handleGenerateStrategy(strategy as keyof typeof AD_STRATEGIES)}
                                    className="bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 py-2 px-2 rounded-lg text-xs font-medium transition-colors text-center"
                                 >
                                    {strategy}
                                 </button>
                             ))}
                        </div>
                     </div>

                     {/* Generate Bundle Button */}
                     <button 
                        onClick={handleGenerateMix}
                        className="w-full bg-gradient-to-br from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex flex-col items-center"
                     >
                        <span>Generar Mix Automático</span>
                        <span className="text-xs font-normal opacity-80 mt-1">(5 Variaciones Aleatorias)</span>
                     </button>
                </div>

                {/* Right Column: Dynamic Grid */}
                 <div className="w-full lg:w-2/3 flex flex-col gap-4">
                    <h3 className="text-xl font-bold text-gray-200">Resultados ({variations.length})</h3>
                    {variations.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-xl text-gray-500">
                            <p>Tus variaciones aparecerán aquí.</p>
                            <p className="text-sm">Usa los botones de la izquierda para comenzar.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                            {variations.map((variation) => (
                                <div key={variation.id} className="flex flex-col gap-2 bg-gray-800/40 p-3 rounded-xl border border-gray-700/50 animate-fade-in">
                                    <div className="flex justify-between items-start">
                                        <span className="text-sm font-bold text-gray-200 truncate pr-2" title={variation.label}>{variation.label}</span>
                                        {/* Tooltip for full prompt */}
                                        <div className="relative group/info">
                                            <div className="w-4 h-4 rounded-full bg-gray-700 text-gray-400 flex items-center justify-center text-[10px] cursor-help">?</div>
                                            <div className="absolute right-0 top-6 w-48 bg-black/90 text-gray-300 text-xs p-2 rounded shadow-xl opacity-0 group-hover/info:opacity-100 pointer-events-none z-20">
                                                {variation.prompt}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-gray-900/50 flex items-center justify-center group">
                                        {variation.loading ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <Spinner />
                                                <span className="text-xs text-gray-400 animate-pulse">Creando...</span>
                                            </div>
                                        ) : variation.url ? (
                                            <>
                                                <img src={variation.url} alt={variation.label} className="w-full h-full object-cover" />
                                                {/* Hover Overlay */}
                                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                                                    <button 
                                                        onClick={() => handleEditVariation(variation.url!)}
                                                        className="w-full bg-white/90 text-black font-semibold px-4 py-2 rounded-lg text-xs hover:bg-white"
                                                    >
                                                        Editar / Recortar
                                                    </button>
                                                    <button 
                                                        onClick={() => handleOpenMagicResize(variation.url!)}
                                                        className="w-full bg-purple-600/90 text-white font-semibold px-4 py-2 rounded-lg text-xs hover:bg-purple-500 flex items-center justify-center gap-2"
                                                    >
                                                        <ResizeIcon className="w-3 h-3" />
                                                        Redimensión
                                                    </button>
                                                    <a 
                                                        href={variation.url} 
                                                        download={`ad-variation-${variation.label}.png`}
                                                        className="text-gray-300 text-xs hover:underline mt-1"
                                                    >
                                                        Descargar
                                                    </a>
                                                </div>
                                            </>
                                        ) : variation.error ? (
                                            <div className="text-red-400 text-xs text-center p-2 bg-red-900/20 rounded border border-red-900/50 w-full mx-2">
                                                {variation.error}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                 </div>
            </div>
            
            <MagicResizeModal 
                isOpen={resizeModalOpen} 
                onClose={() => setResizeModalOpen(false)} 
                imageFile={imageToResize} 
            />
        </div>
    )
  }

  const renderEditor = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-500/10 border border-red-500/20 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
            <h2 className="text-2xl font-bold text-red-300">Ocurrió un error</h2>
            <p className="text-md text-red-400">{error}</p>
            <button
                onClick={() => setError(null)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors"
              >
                Intentar de nuevo
            </button>
          </div>
        );
    }
    
    if (!currentImageUrl) {
      return <StartScreen onFileSelect={handleFileSelect} />;
    }

    const imageDisplay = (
      <div className="relative">
        {/* Base image is the original, always at the bottom */}
        {originalImageUrl && (
            <img
                key={originalImageUrl}
                src={originalImageUrl}
                alt="Original"
                className="w-full h-auto object-contain max-h-[60vh] rounded-xl pointer-events-none"
            />
        )}
        {/* The current image is an overlay that fades in/out for comparison */}
        <img
            ref={imgRef}
            key={currentImageUrl}
            src={currentImageUrl}
            alt="Current"
            onClick={handleImageClick}
            className={`absolute top-0 left-0 w-full h-auto object-contain max-h-[60vh] rounded-xl transition-opacity duration-200 ease-in-out ${isComparing ? 'opacity-0' : 'opacity-100'} ${activeTab === 'retouch' ? 'cursor-crosshair' : ''}`}
        />
      </div>
    );
    
    // For ReactCrop, we need a single image element. We'll use the current one.
    const cropImageElement = (
      <img 
        ref={imgRef}
        key={`crop-${currentImageUrl}`}
        src={currentImageUrl} 
        alt="Crop this image"
        className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
      />
    );


    return (
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative w-full shadow-2xl rounded-xl overflow-hidden bg-black/20">
            {isLoading && (
                <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in">
                    <Spinner />
                    <p className="text-gray-300">La IA está haciendo su magia...</p>
                </div>
            )}
            
            {activeTab === 'crop' ? (
              <ReactCrop 
                crop={crop} 
                onChange={c => setCrop(c)} 
                onComplete={c => setCompletedCrop(c)}
                aspect={aspect}
                className="max-h-[60vh]"
              >
                {cropImageElement}
              </ReactCrop>
            ) : imageDisplay }

            {displayHotspot && !isLoading && activeTab === 'retouch' && (
                <div 
                    className="absolute rounded-full w-6 h-6 bg-blue-500/50 border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10"
                    style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px` }}
                >
                    <div className="absolute inset-0 rounded-full w-6 h-6 animate-ping bg-blue-400"></div>
                </div>
            )}
        </div>
        
        <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-2 flex items-center justify-center gap-2 backdrop-blur-sm">
            {(['retouch', 'crop', 'adjust', 'filters'] as Tab[]).map(tab => (
                 <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full capitalize font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base ${
                        activeTab === tab 
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                >
                    {tabLabels[tab]}
                </button>
            ))}
        </div>
        
        <div className="w-full">
            {activeTab === 'retouch' && (
                <div className="flex flex-col items-center gap-4">
                    <p className="text-md text-gray-400">
                        {editHotspot ? '¡Genial! Ahora describe tu edición localizada abajo.' : 'Haz clic en un área de la imagen para hacer una edición precisa.'}
                    </p>
                    <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="w-full flex items-center gap-2">
                        <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={editHotspot ? "ej. 'cambia el color de mi camisa a azul'" : "Primero haz clic en un punto de la imagen"}
                            className="flex-grow bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-5 text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isLoading || !editHotspot}
                        />
                        <button 
                            type="submit"
                            className="bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                            disabled={isLoading || !prompt.trim() || !editHotspot}
                        >
                            Generar
                        </button>
                    </form>
                </div>
            )}
            {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!completedCrop?.width && completedCrop.width > 0} />}
            {activeTab === 'adjust' && <AdjustmentPanel onApplyAdjustment={handleApplyAdjustment} isLoading={isLoading} />}
            {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} />}
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button 
                onClick={handleUndo}
                disabled={!canUndo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Undo last action"
            >
                <UndoIcon className="w-5 h-5 mr-2" />
                Deshacer
            </button>
            <button 
                onClick={handleRedo}
                disabled={!canRedo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Redo last action"
            >
                <RedoIcon className="w-5 h-5 mr-2" />
                Rehacer
            </button>
            
            <div className="h-6 w-px bg-gray-600 mx-1 hidden sm:block"></div>

            {canUndo && (
              <button 
                  onMouseDown={() => setIsComparing(true)}
                  onMouseUp={() => setIsComparing(false)}
                  onMouseLeave={() => setIsComparing(false)}
                  onTouchStart={() => setIsComparing(true)}
                  onTouchEnd={() => setIsComparing(false)}
                  className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
                  aria-label="Press and hold to see original image"
              >
                  <EyeIcon className="w-5 h-5 mr-2" />
                  Comparar
              </button>
            )}

            <button 
                onClick={handleReset}
                disabled={!canUndo}
                className="text-center bg-transparent border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent"
              >
                Reiniciar
            </button>
            <button 
                onClick={handleUploadNew}
                className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
            >
                Subir Nueva
            </button>

            <button 
                onClick={() => handleDownload(currentImage)}
                className="flex-grow sm:flex-grow-0 ml-auto bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
            >
                Descargar Imagen
            </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header viewMode={viewMode} setViewMode={setViewMode} />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center ${currentImage || (viewMode === 'generator' && adBaseImage) ? 'items-start' : 'items-center'}`}>
        {viewMode === 'editor' ? renderEditor() : renderAdGenerator()}
      </main>
      <ChatBot />
    </div>
  );
};

export default App;
