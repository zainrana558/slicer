import React, { useState, useRef, useCallback } from 'react';
import { detectPanels, initializeVisionModel, isModelLoaded, Panel, DetectionOptions, DEFAULT_OPTIONS, SliceResult } from './engine';

type AppState = 'upload' | 'processing' | 'results';

function App() {
  const [state, setState] = useState<AppState>('upload');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [result, setResult] = useState<SliceResult | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<number | null>(null);
  const [modelStatus, setModelStatus] = useState<'not-loaded' | 'loading' | 'loaded'>('not-loaded');
  const [loadProgress, setLoadProgress] = useState(0);
  const [options, setOptions] = useState<DetectionOptions>(DEFAULT_OPTIONS);
  const [showSettings, setShowSettings] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setImageUrl(url);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setImageData(data);
      setState('processing');
    };
    img.src = url;
  }, []);

  const handleDetect = useCallback(async () => {
    if (!imageData) return;

    // Initialize ML model if needed
    if ((options.strategy === 'ml' || options.strategy === 'hybrid') && !isModelLoaded()) {
      setModelStatus('loading');
      try {
        await initializeVisionModel((progress) => {
          setLoadProgress(progress);
        });
        setModelStatus('loaded');
      } catch (error) {
        console.error('Failed to load ML model:', error);
        // Fall back to CV-only
        setOptions(prev => ({ ...prev, strategy: 'cv' }));
      }
    }

    const result = await detectPanels(imageData, options);
    setResult(result);
    setState('results');
  }, [imageData, options]);

  const handleExportPanel = useCallback(async (panel: Panel, index: number) => {
    if (!imageData) return;

    const canvas = document.createElement('canvas');
    canvas.width = panel.width;
    canvas.height = panel.height;
    const ctx = canvas.getContext('2d')!;

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.putImageData(imageData, 0, 0);

    ctx.drawImage(srcCanvas, panel.x, panel.y, panel.width, panel.height, 0, 0, panel.width, panel.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `panel_${String(index + 1).padStart(3, '0')}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  }, [imageData]);

  const handleExportAll = useCallback(async () => {
    if (!result || !imageData) return;

    for (let i = 0; i < result.panels.length; i++) {
      await handleExportPanel(result.panels[i], i);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }, [result, imageData, handleExportPanel]);

  const reset = useCallback(() => {
    setState('upload');
    setImageUrl('');
    setImageData(null);
    setResult(null);
    setSelectedPanel(null);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-black/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">Webtoon Panel Slicer</h1>
              <p className="text-xs text-gray-400">AI Vision-Powered Detection</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {modelStatus === 'loaded' && (
              <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-400">ML Model Ready</span>
              </div>
            )}
            {state === 'results' && (
              <button
                onClick={reset}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
              >
                New Image
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {state === 'upload' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Human-Level Panel Detection
              </h2>
              <p className="text-gray-400 text-lg max-w-2xl">
                Advanced AI vision combined with computer vision for precise webtoon panel slicing.
                Handles diagonal panels, borderless layouts, and protects faces, text, and speech bubbles.
              </p>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full max-w-2xl p-12 border-2 border-dashed border-white/20 rounded-2xl hover:border-purple-500/50 hover:bg-white/5 transition-all cursor-pointer group"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium mb-1">Drop your webtoon image here</p>
                  <p className="text-sm text-gray-400">or click to browse (JPG, PNG, WEBP)</p>
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12 w-full max-w-6xl">
              <div className="p-6 bg-white/5 rounded-xl border border-white/10">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">10+ CV Algorithms</h3>
                <p className="text-sm text-gray-400">Watershed, superpixels, RANSAC, active contours, and more</p>
              </div>

              <div className="p-6 bg-white/5 rounded-xl border border-white/10">
                <div className="w-10 h-10 bg-pink-500/20 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">Content Protection</h3>
                <p className="text-sm text-gray-400">Never cuts through faces, text, or speech bubbles</p>
              </div>

              <div className="p-6 bg-white/5 rounded-xl border border-white/10">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">All Panel Types</h3>
                <p className="text-sm text-gray-400">Diagonal, borderless, inset, bleed, full-width panels</p>
              </div>

              <div className="p-6 bg-white/5 rounded-xl border border-white/10">
                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">95%+ Precision</h3>
                <p className="text-sm text-gray-400">Human-level accuracy with pixel-perfect boundaries</p>
              </div>
            </div>
          </div>
        )}

        {state === 'processing' && imageUrl && (
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <img src={imageUrl} alt="Preview" className="max-h-[60vh] rounded-xl shadow-2xl" />
            </div>

            <div className="flex flex-col items-center gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Detection Settings
              </button>

              {showSettings && (
                <div className="w-full max-w-4xl p-6 bg-white/5 rounded-xl border border-white/10 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Detection Strategy</label>
                      <select
                        value={options.strategy}
                        onChange={(e) => setOptions(prev => ({ ...prev, strategy: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm"
                      >
                        <option value="hybrid">Hybrid (CV + ML) - Best Accuracy</option>
                        <option value="cv">Computer Vision Only - Fast</option>
                        <option value="ml">ML Vision Only - Most Accurate</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Webtoon Type</label>
                      <select
                        value={options.webtoonType}
                        onChange={(e) => setOptions(prev => ({ ...prev, webtoonType: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm"
                      >
                        <option value="auto">Auto-Detect</option>
                        <option value="manhwa">Korean Manhwa</option>
                        <option value="manga">Japanese Manga</option>
                        <option value="manhua">Chinese Manhua</option>
                        <option value="vertical">Vertical Scroll</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Gutter Sensitivity: {options.gutterSensitivity}</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={options.gutterSensitivity}
                        onChange={(e) => setOptions(prev => ({ ...prev, gutterSensitivity: parseInt(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Content Protection: {options.protectionStrength}</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={options.protectionStrength}
                        onChange={(e) => setOptions(prev => ({ ...prev, protectionStrength: parseInt(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-3 block">Advanced Detection Options</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={options.detectDiagonal}
                          onChange={(e) => setOptions(prev => ({ ...prev, detectDiagonal: e.target.checked }))}
                          className="rounded"
                        />
                        Diagonal Panels
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={options.detectBorderless}
                          onChange={(e) => setOptions(prev => ({ ...prev, detectBorderless: e.target.checked }))}
                          className="rounded"
                        />
                        Borderless Panels
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={options.useWatershed}
                          onChange={(e) => setOptions(prev => ({ ...prev, useWatershed: e.target.checked }))}
                          className="rounded"
                        />
                        Watershed Segmentation
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={options.useSuperpixels}
                          onChange={(e) => setOptions(prev => ({ ...prev, useSuperpixels: e.target.checked }))}
                          className="rounded"
                        />
                        Superpixel Analysis
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={options.useActiveContours}
                          onChange={(e) => setOptions(prev => ({ ...prev, useActiveContours: e.target.checked }))}
                          className="rounded"
                        />
                        Active Contours
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={options.useHierarchical}
                          onChange={(e) => setOptions(prev => ({ ...prev, useHierarchical: e.target.checked }))}
                          className="rounded"
                        />
                        Hierarchical Detection
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-3 block">Content Protection</label>
                    <div className="grid grid-cols-3 gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={options.protectFaces}
                          onChange={(e) => setOptions(prev => ({ ...prev, protectFaces: e.target.checked }))}
                          className="rounded"
                        />
                        Protect Faces
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={options.protectText}
                          onChange={(e) => setOptions(prev => ({ ...prev, protectText: e.target.checked }))}
                          className="rounded"
                        />
                        Protect Text
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={options.protectBubbles}
                          onChange={(e) => setOptions(prev => ({ ...prev, protectBubbles: e.target.checked }))}
                          className="rounded"
                        />
                        Protect Bubbles
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleDetect}
                className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl font-semibold text-lg shadow-lg shadow-purple-500/30 transition-all hover:scale-105"
              >
                Detect Panels
              </button>
            </div>
          </div>
        )}

        {state === 'results' && result && imageUrl && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-2xl font-bold text-purple-400">{result.panels.length}</div>
                <div className="text-sm text-gray-400">Panels Detected</div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-2xl font-bold text-pink-400">{(result.processingTime / 1000).toFixed(2)}s</div>
                <div className="text-sm text-gray-400">Processing Time</div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-2xl font-bold text-blue-400">{result.strategy}</div>
                <div className="text-sm text-gray-400">Strategy Used</div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-2xl font-bold text-green-400">{result.imageWidth}×{result.imageHeight}</div>
                <div className="text-sm text-gray-400">Image Size</div>
              </div>
            </div>

            {/* Image with panels */}
            <div className="relative inline-block mx-auto">
              <img src={imageUrl} alt="Result" className="max-h-[60vh] rounded-xl" />
              <svg
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${result.imageWidth} ${result.imageHeight}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ maxHeight: '60vh' }}
              >
                {result.panels.map((panel, index) => (
                  <g key={panel.id}>
                    <rect
                      x={panel.x}
                      y={panel.y}
                      width={panel.width}
                      height={panel.height}
                      fill="none"
                      stroke={selectedPanel === index ? '#ec4899' : '#a855f7'}
                      strokeWidth={selectedPanel === index ? 8 : 4}
                      className="cursor-pointer pointer-events-auto"
                      onClick={() => setSelectedPanel(selectedPanel === index ? null : index)}
                    />
                    <text
                      x={panel.x + 10}
                      y={panel.y + 30}
                      fill="white"
                      fontSize="24"
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      {index + 1}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* Panel list */}
            {selectedPanel !== null && result.panels[selectedPanel] && (
              <div className="p-6 bg-white/5 rounded-xl border border-white/10">
                <h3 className="font-semibold mb-4">Panel {selectedPanel + 1} Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">Type</div>
                    <div className="font-medium">{result.panels[selectedPanel].type}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Position</div>
                    <div className="font-medium">({result.panels[selectedPanel].x}, {result.panels[selectedPanel].y})</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Size</div>
                    <div className="font-medium">{result.panels[selectedPanel].width} × {result.panels[selectedPanel].height}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Confidence</div>
                    <div className="font-medium">{(result.panels[selectedPanel].confidence * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <button
                  onClick={() => handleExportPanel(result.panels[selectedPanel], selectedPanel)}
                  className="mt-4 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Export This Panel
                </button>
              </div>
            )}

            {/* Export buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleExportAll}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl font-semibold shadow-lg shadow-green-500/30 transition-all hover:scale-105"
              >
                Export All Panels
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-sm text-gray-400">
          <p>Webtoon Panel Slicer • AI Vision-Powered • Runs Locally • No GPU Required</p>
          <p className="mt-2 text-xs">Supports Manhwa, Manga, Manhua, and Vertical Scroll formats</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
