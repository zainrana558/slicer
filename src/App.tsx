import React, { useState, useRef, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  detectPanels,
  exportPanelAsBlob,
  Panel,
  DetectionSettings,
  DEFAULT_SETTINGS,
} from './utils/panelDetector';

type AppState = 'upload' | 'editing' | 'preview';

// Panel Preview Card with canvas-based rendering
function PanelPreviewCard({
  panel,
  index,
  imageUrl,
  imageHeight,
  onExport,
}: {
  panel: Panel;
  index: number;
  imageUrl: string;
  imageHeight: number;
  onExport: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Set canvas to panel dimensions (scaled down for preview)
      const maxPreviewWidth = 400;
      const scale = Math.min(1, maxPreviewWidth / panel.width);
      canvas.width = panel.width * scale;
      canvas.height = panel.height * scale;
      ctx.drawImage(
        img,
        panel.x, panel.y, panel.width, panel.height,
        0, 0, canvas.width, canvas.height
      );
    };
    img.src = imageUrl;
  }, [panel, imageUrl]);

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 group hover:border-purple-500/50 transition-colors">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block"
        />
        <div className="absolute top-2 left-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg">
          #{index + 1}
        </div>
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onExport}
            className="bg-green-500 hover:bg-green-400 text-white p-1.5 rounded-lg transition-colors shadow-lg"
            title="Download panel"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      </div>
      <div className="p-2 flex items-center justify-between">
        <span className="text-gray-400 text-xs">
          {panel.width} × {panel.height}px
        </span>
        <span className="text-gray-500 text-xs">
          {Math.round((panel.height / imageHeight) * 100)}% of image
        </span>
      </div>
    </div>
  );
}

function App() {
  const [state, setState] = useState<AppState>('upload');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [panels, setPanels] = useState<Panel[]>([]);
  const [settings, setSettings] = useState<DetectionSettings>(DEFAULT_SETTINGS);
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [editingPanel, setEditingPanel] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize-top' | 'resize-bottom' | null;
    panelId: string | null;
    startY: number;
    startPanel: Panel | null;
  }>({ type: null, panelId: null, startY: 0, startPanel: null });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load image
  const loadImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setImageUrl(url);
      setState('editing');
      // Auto-detect on load
      setTimeout(() => {
        runDetection(img, settings);
      }, 100);
    };
    img.src = url;
  }, [settings]);

  // Run detection
  const runDetection = useCallback((img?: HTMLImageElement | null, s?: DetectionSettings) => {
    const targetImage = img || image;
    const targetSettings = s || settings;
    if (!targetImage) return;

    setIsDetecting(true);
    setTimeout(() => {
      const detected = detectPanels(targetImage, targetSettings);
      setPanels(detected);
      setIsDetecting(false);
    }, 50);
  }, [image, settings]);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      loadImage(file);
    }
  }, [loadImage]);

  // Handle file input
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadImage(file);
    }
  }, [loadImage]);

  // Export all panels as ZIP
  const exportAllAsZip = useCallback(async () => {
    if (!image || panels.length === 0) return;
    setIsExporting(true);

    const zip = new JSZip();
    for (let i = 0; i < panels.length; i++) {
      const blob = await exportPanelAsBlob(image, panels[i], exportFormat, 0.95);
      zip.file(`panel_${String(i + 1).padStart(3, '0')}.${exportFormat}`, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'webtoon_panels.zip');
    setIsExporting(false);
  }, [image, panels, exportFormat]);

  // Export single panel
  const exportSinglePanel = useCallback(async (panel: Panel, index: number) => {
    if (!image) return;
    const blob = await exportPanelAsBlob(image, panel, exportFormat, 0.95);
    saveAs(blob, `panel_${String(index + 1).padStart(3, '0')}.${exportFormat}`);
  }, [image, exportFormat]);

  // Delete panel
  const deletePanel = useCallback((id: string) => {
    setPanels(prev => prev.filter(p => p.id !== id));
  }, []);

  // Add panel
  const addPanel = useCallback(() => {
    if (!image) return;
    const lastPanel = panels[panels.length - 1];
    const newY = lastPanel ? lastPanel.y + lastPanel.height : 0;
    const remainingHeight = image.naturalHeight - newY;
    if (remainingHeight < settings.minPanelHeight) return;

    const newPanel: Panel = {
      id: `panel-${Date.now()}`,
      x: 0,
      y: newY,
      width: image.naturalWidth,
      height: Math.min(remainingHeight, 300),
      confidence: 1,
    };
    setPanels(prev => [...prev, newPanel]);
  }, [image, panels, settings.minPanelHeight]);

  // Split panel
  const splitPanel = useCallback((id: string) => {
    setPanels(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx === -1) return prev;
      const panel = prev[idx];
      const halfHeight = Math.floor(panel.height / 2);
      const top: Panel = { ...panel, id: `panel-${Date.now()}-a`, height: halfHeight };
      const bottom: Panel = {
        ...panel,
        id: `panel-${Date.now()}-b`,
        y: panel.y + halfHeight,
        height: panel.height - halfHeight,
      };
      const result = [...prev];
      result.splice(idx, 1, top, bottom);
      return result;
    });
  }, []);

  // Mouse handlers for panel editing
  const handleMouseDown = useCallback((e: React.MouseEvent, panelId: string, type: 'move' | 'resize-top' | 'resize-bottom') => {
    e.stopPropagation();
    e.preventDefault();
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    setDragState({
      type,
      panelId,
      startY: e.clientY,
      startPanel: { ...panel },
    });
    setSelectedPanel(panelId);
  }, [panels]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.type || !dragState.panelId || !dragState.startPanel || !image) return;

    // Convert screen delta to image coordinates
    const deltaY = (e.clientY - dragState.startY) / zoom;
    const { startPanel, type } = dragState;

    setPanels(prev => prev.map(p => {
      if (p.id !== dragState.panelId) return p;

      if (type === 'move') {
        const newY = Math.max(0, Math.min(image.naturalHeight - p.height, Math.round(startPanel.y + deltaY)));
        return { ...p, y: newY };
      } else if (type === 'resize-top') {
        const newY = Math.max(0, Math.round(startPanel.y + deltaY));
        const newHeight = startPanel.height - (newY - startPanel.y);
        if (newHeight < settings.minPanelHeight) return p;
        return { ...p, y: newY, height: newHeight };
      } else if (type === 'resize-bottom') {
        const newHeight = Math.max(settings.minPanelHeight, Math.round(startPanel.height + deltaY));
        const maxY = startPanel.y + newHeight;
        if (maxY > image.naturalHeight) return p;
        return { ...p, height: newHeight };
      }
      return p;
    }));
  }, [dragState, zoom, image, settings.minPanelHeight]);

  const handleMouseUp = useCallback(() => {
    setDragState({ type: null, panelId: null, startY: 0, startPanel: null });
  }, []);

  // Draw canvas overlay
  useEffect(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    // Draw panels overlay
    panels.forEach((panel, index) => {
      const isSelected = panel.id === selectedPanel;
      const isEditing = panel.id === editingPanel;

      // Panel border
      ctx.strokeStyle = isSelected ? '#3b82f6' : isEditing ? '#10b981' : '#8b5cf6';
      ctx.lineWidth = isSelected || isEditing ? 3 : 2;
      ctx.setLineDash(isSelected ? [] : [5, 5]);
      ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);

      // Panel number label
      ctx.setLineDash([]);
      const labelSize = 24;
      const labelW = labelSize + 16;
      const labelH = labelSize + 4;
      const labelX = panel.x + 8;
      const labelY = panel.y + 8;
      const radius = 4;
      ctx.fillStyle = isSelected ? '#3b82f6' : '#8b5cf6';
      ctx.beginPath();
      ctx.moveTo(labelX + radius, labelY);
      ctx.lineTo(labelX + labelW - radius, labelY);
      ctx.quadraticCurveTo(labelX + labelW, labelY, labelX + labelW, labelY + radius);
      ctx.lineTo(labelX + labelW, labelY + labelH - radius);
      ctx.quadraticCurveTo(labelX + labelW, labelY + labelH, labelX + labelW - radius, labelY + labelH);
      ctx.lineTo(labelX + radius, labelY + labelH);
      ctx.quadraticCurveTo(labelX, labelY + labelH, labelX, labelY + labelH - radius);
      ctx.lineTo(labelX, labelY + radius);
      ctx.quadraticCurveTo(labelX, labelY, labelX + radius, labelY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${index + 1}`, labelX + labelW / 2, labelY + labelH / 2);

      // Resize handles
      if (isSelected || isEditing) {
        ctx.fillStyle = '#3b82f6';
        // Top handle
        ctx.fillRect(panel.x + panel.width / 2 - 15, panel.y - 4, 30, 8);
        // Bottom handle
        ctx.fillRect(panel.x + panel.width / 2 - 15, panel.y + panel.height - 4, 30, 8);
      }
    });
  }, [panels, image, selectedPanel, editingPanel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state !== 'editing') return;
      if (e.key === 'Delete' && selectedPanel) {
        deletePanel(selectedPanel);
        setSelectedPanel(null);
      }
      if (e.key === 'Escape') {
        setSelectedPanel(null);
        setEditingPanel(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, selectedPanel, deletePanel]);

  // Upload screen
  if (state === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-4xl font-bold text-white">Webtoon Panel Slicer</h1>
            </div>
            <p className="text-gray-400 text-lg">
              Advanced AI-powered panel detection for webtoons, comics, and manga
            </p>
            <div className="flex items-center justify-center gap-4 mt-3 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Edge Detection
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Color Analysis
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Variance Detection
              </span>
            </div>
          </div>

          <div
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer
              ${dragOver
                ? 'border-purple-400 bg-purple-500/20 scale-[1.02]'
                : 'border-gray-600 hover:border-purple-500 hover:bg-purple-500/10'
              }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileInput}
            />
            <div className="flex flex-col items-center gap-4">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300
                ${dragOver ? 'bg-purple-500/30 scale-110' : 'bg-gray-700/50'}`}>
                <svg className={`w-10 h-10 transition-colors ${dragOver ? 'text-purple-300' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-semibold text-white mb-1">
                  {dragOver ? 'Drop your webtoon here!' : 'Drop image or click to upload'}
                </p>
                <p className="text-gray-500 text-sm">
                  Supports PNG, JPG, WEBP • Max recommended: 4000px height
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { icon: '🔍', title: 'Auto Detect', desc: 'AI-powered panel boundary detection' },
              { icon: '✂️', title: 'Manual Edit', desc: 'Fine-tune panels with drag & resize' },
              { icon: '📦', title: 'Batch Export', desc: 'Export all panels as ZIP archive' },
            ].map((feature, i) => (
              <div key={i} className="bg-gray-800/50 rounded-xl p-4 text-center border border-gray-700/50">
                <div className="text-2xl mb-2">{feature.icon}</div>
                <h3 className="text-white font-medium text-sm">{feature.title}</h3>
                <p className="text-gray-500 text-xs mt-1">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Main editing/preview interface
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800/90 backdrop-blur-sm border-b border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-white font-bold text-lg">Webtoon Slicer</h1>
          {image && (
            <span className="text-gray-500 text-sm ml-2">
              {image.naturalWidth} × {image.naturalHeight}px • {panels.length} panels
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          {state === 'editing' && (
            <div className="flex items-center gap-1 bg-gray-700 rounded-lg px-2 py-1">
              <button
                onClick={() => setZoom(z => Math.max(0.1, z - 0.25))}
                className="text-gray-300 hover:text-white p-1"
                title="Zoom out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="text-gray-300 text-xs w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                className="text-gray-300 hover:text-white p-1"
                title="Zoom in"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={() => setZoom(1)}
                className="text-gray-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-gray-600 hover:bg-gray-500 ml-1"
                title="Reset zoom (100%)"
              >
                1:1
              </button>
            </div>
          )}

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showSettings ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            ⚙️ Settings
          </button>

          {state === 'editing' && (
            <>
              <button
                onClick={() => runDetection()}
                disabled={isDetecting}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isDetecting ? '⏳ Detecting...' : '🔍 Auto Detect'}
              </button>
              <button
                onClick={() => setState('preview')}
                className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                👁️ Preview
              </button>
            </>
          )}

          {state === 'preview' && (
            <button
              onClick={() => setState('editing')}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              ✏️ Edit
            </button>
          )}

          <button
            onClick={() => { setState('upload'); setImage(null); setPanels([]); }}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            📁 New
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Settings Panel */}
        {showSettings && (
          <aside className="w-72 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
            <h2 className="text-white font-semibold mb-4">Detection Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1">
                  Sensitivity: {settings.sensitivity}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={settings.sensitivity}
                  onChange={(e) => setSettings(s => ({ ...s, sensitivity: Number(e.target.value) }))}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1">
                  Min Panel Height: {settings.minPanelHeight}px
                </label>
                <input
                  type="range"
                  min="20"
                  max="500"
                  step="10"
                  value={settings.minPanelHeight}
                  onChange={(e) => setSettings(s => ({ ...s, minPanelHeight: Number(e.target.value) }))}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1">
                  Merge Threshold: {settings.mergeThreshold}px
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={settings.mergeThreshold}
                  onChange={(e) => setSettings(s => ({ ...s, mergeThreshold: Number(e.target.value) }))}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1">
                  Edge Strength: {settings.edgeStrength}
                </label>
                <input
                  type="range"
                  min="10"
                  max="150"
                  value={settings.edgeStrength}
                  onChange={(e) => setSettings(s => ({ ...s, edgeStrength: Number(e.target.value) }))}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs font-medium block mb-2">Border Type</label>
                <div className="grid grid-cols-2 gap-1">
                  {(['auto', 'white', 'black', 'any'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setSettings(s => ({ ...s, borderType: type }))}
                      className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        settings.borderType === type
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-gray-400 text-xs font-medium block">Detection Methods</label>
                {[
                  { key: 'useEdgeDetection', label: 'Edge Detection (Sobel)' },
                  { key: 'useColorAnalysis', label: 'Color Analysis' },
                  { key: 'useVarianceDetection', label: 'Variance Detection' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings[key as keyof DetectionSettings] as boolean}
                      onChange={(e) => setSettings(s => ({ ...s, [key]: e.target.checked }))}
                      className="accent-purple-500"
                    />
                    <span className="text-gray-300 text-xs">{label}</span>
                  </label>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-700">
                <label className="text-gray-400 text-xs font-medium block mb-2">Export Format</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['png', 'jpeg', 'webp'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className={`px-2 py-1.5 rounded text-xs font-medium uppercase transition-colors ${
                        exportFormat === fmt
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto relative" ref={containerRef}>
          {state === 'editing' && image && (
            <div
              className="relative inline-block mx-auto my-4"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={() => { setSelectedPanel(null); setEditingPanel(null); }}
            >
              <img
                src={imageUrl}
                alt="Webtoon"
                className="block max-w-none"
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 pointer-events-none"
                width={image.naturalWidth}
                height={image.naturalHeight}
                style={{ width: image.naturalWidth, height: image.naturalHeight }}
              />
              {/* Interactive panel overlays */}
              {panels.map((panel, index) => (
                <div key={panel.id} className="absolute" style={{
                  left: panel.x,
                  top: panel.y,
                  width: panel.width,
                  height: panel.height,
                }}>
                  {/* Click to select */}
                  <div
                    className="absolute inset-0 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setSelectedPanel(panel.id); }}
                  />
                  {/* Top resize handle */}
                  <div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-3 cursor-n-resize bg-blue-500/50 rounded hover:bg-blue-500/80 transition-colors"
                    style={{ display: selectedPanel === panel.id ? 'block' : 'none' }}
                    onMouseDown={(e) => handleMouseDown(e, panel.id, 'resize-top')}
                  />
                  {/* Bottom resize handle */}
                  <div
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-3 cursor-s-resize bg-blue-500/50 rounded hover:bg-blue-500/80 transition-colors"
                    style={{ display: selectedPanel === panel.id ? 'block' : 'none' }}
                    onMouseDown={(e) => handleMouseDown(e, panel.id, 'resize-bottom')}
                  />
                  {/* Move handle */}
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 cursor-move bg-blue-500/30 rounded-full hover:bg-blue-500/60 transition-colors flex items-center justify-center"
                    style={{ display: selectedPanel === panel.id ? 'flex' : 'none' }}
                    onMouseDown={(e) => handleMouseDown(e, panel.id, 'move')}
                  >
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3 3h-2v4h4v-2l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H7v2l-3-3 3-3v2h4V5H9l3-3z"/>
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}

          {state === 'preview' && image && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-lg">Panel Preview ({panels.length} panels)</h2>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm">
                    Total: {panels.reduce((acc, p) => acc + p.height, 0)}px / {image.naturalHeight}px
                  </span>
                  <button
                    onClick={exportAllAsZip}
                    disabled={isExporting}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {isExporting ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Exporting...
                      </>
                    ) : (
                      <>📦 Export All as ZIP</>
                    )}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {panels.map((panel, index) => (
                  <PanelPreviewCard
                    key={panel.id}
                    panel={panel}
                    index={index}
                    imageUrl={imageUrl}
                    imageHeight={image.naturalHeight}
                    onExport={() => exportSinglePanel(panel, index)}
                  />
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar - Panel list */}
        {state === 'editing' && (
          <aside className="w-64 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="p-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm">Panels ({panels.length})</h3>
              <button
                onClick={addPanel}
                className="text-purple-400 hover:text-purple-300 p-1"
                title="Add panel"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {panels.map((panel, index) => (
                <div
                  key={panel.id}
                  className={`p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedPanel === panel.id
                      ? 'bg-purple-500/20 border border-purple-500/50'
                      : 'bg-gray-700/50 hover:bg-gray-700 border border-transparent'
                  }`}
                  onClick={() => setSelectedPanel(panel.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium">Panel {index + 1}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); splitPanel(panel.id); }}
                        className="text-gray-400 hover:text-yellow-400 p-0.5"
                        title="Split panel"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 5h8m-4-9v14" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePanel(panel.id); }}
                        className="text-gray-400 hover:text-red-400 p-0.5"
                        title="Delete panel"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="text-gray-500 text-xs mt-1">
                    Y: {panel.y}px • H: {panel.height}px
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-700">
              <button
                onClick={exportAllAsZip}
                disabled={isExporting || panels.length === 0}
                className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isExporting ? '⏳ Exporting...' : '📦 Export All ZIP'}
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Status bar */}
      {image && (
        <footer className="bg-gray-800/90 border-t border-gray-700 px-4 py-1.5 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            {selectedPanel && (
              <span className="text-purple-400">
                Selected: Panel #{panels.findIndex(p => p.id === selectedPanel) + 1}
                {(() => {
                  const p = panels.find(p => p.id === selectedPanel);
                  return p ? ` (${p.width}×${p.height}px at Y:${p.y})` : '';
                })()}
              </span>
            )}
            {!selectedPanel && <span>Click a panel to select • Drag handles to resize</span>}
          </div>
          <div className="flex items-center gap-4">
            <span>Del: Delete • Esc: Deselect</span>
            <span className="text-gray-600">|</span>
            <span>{panels.length} panels detected</span>
          </div>
        </footer>
      )}

      {/* Loading overlay */}
      {isDetecting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 flex flex-col items-center gap-4 border border-gray-700 pulse-glow">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white font-medium">Analyzing image...</p>
            <p className="text-gray-400 text-sm">Detecting panel boundaries using vision algorithms</p>
            <div className="flex gap-2 mt-2">
              <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-400">Edge Detection</span>
              <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-400">Color Analysis</span>
              <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-400">Variance</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
