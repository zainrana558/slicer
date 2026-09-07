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

// ============ PANEL PREVIEW CARD ============
function PanelPreviewCard({
  panel,
  index,
  imageUrl,
  onExport,
  isSelected,
  onClick,
}: {
  panel: Panel;
  index: number;
  imageUrl: string;
  onExport: () => void;
  isSelected: boolean;
  onClick: () => void;
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
      const maxW = 300;
      const scale = Math.min(1, maxW / panel.width);
      canvas.width = panel.width * scale;
      canvas.height = panel.height * scale;
      ctx.drawImage(
        img,
        panel.x, panel.y, panel.width, panel.height,
        0, 0, canvas.width, canvas.height
      );
    };
    img.src = imageUrl;
  }, [imageUrl, panel]);

  const typeColors: Record<string, string> = {
    standard: 'bg-blue-500',
    diagonal: 'bg-purple-500',
    borderless: 'bg-amber-500',
    inset: 'bg-pink-500',
    bleed: 'bg-teal-500',
  };

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'ring-2 ring-purple-400 shadow-lg shadow-purple-500/20 scale-[1.02]'
          : 'ring-1 ring-gray-700 hover:ring-gray-500 hover:shadow-md'
      } bg-gray-800`}
    >
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block"
        />
        {/* Panel number badge */}
        <div className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <span className="text-white text-xs font-bold">{index + 1}</span>
        </div>
        {/* Type badge */}
        <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${typeColors[panel.type] || 'bg-gray-500'}`}>
          {panel.type}
        </div>
        {/* Confidence */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm">
          <span className="text-[10px] text-gray-300">{(panel.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
      {/* Actions */}
      <div className="p-2 flex items-center justify-between">
        <span className="text-gray-400 text-xs truncate">
          {panel.width}×{panel.height}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onExport(); }}
          className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs transition-opacity"
        >
          Export
        </button>
      </div>
    </div>
  );
}

// ============ MAIN APP ============
function App() {
  const [state, setState] = useState<AppState>('upload');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imgData, setImgData] = useState<ImageData | null>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const [settings, setSettings] = useState<DetectionSettings>({ ...DEFAULT_SETTINGS });
  const [zoom, setZoom] = useState(1);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const [showSettings, setShowSettings] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [detectionTime, setDetectionTime] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw panel overlays on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    panels.forEach((panel, index) => {
      const isSelected = panel.id === selectedPanel;

      // Panel border
      ctx.strokeStyle = isSelected ? '#a855f7' : '#22d3ee';
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.setLineDash(isSelected ? [] : [6, 3]);
      ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);

      // Fill overlay
      ctx.fillStyle = isSelected ? 'rgba(168, 85, 247, 0.1)' : 'rgba(34, 211, 238, 0.05)';
      ctx.fillRect(panel.x, panel.y, panel.width, panel.height);

      // Panel number label
      const labelW = 28;
      const labelH = 20;
      const labelX = panel.x + 4;
      const labelY = panel.y + 4;

      ctx.setLineDash([]);
      const typeColorMap: Record<string, string> = {
        standard: '#3b82f6',
        diagonal: '#a855f7',
        borderless: '#f59e0b',
        inset: '#ec4899',
        bleed: '#14b8a6',
      };
      ctx.fillStyle = typeColorMap[panel.type] || '#6b7280';
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${index + 1}`, labelX + labelW / 2, labelY + labelH / 2);
    });
  }, [panels, selectedPanel, image]);

  // Load image from file
  const loadImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setImageUrl(url);

      // Extract ImageData
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setImgData(data);

      setState('editing');
      setPanels([]);
      setSelectedPanel(null);

      // Auto-fit zoom
      setTimeout(() => {
        if (containerRef.current) {
          const containerW = containerRef.current.clientWidth - 40;
          const containerH = containerRef.current.clientHeight - 40;
          const fitZoom = Math.min(
            containerW / img.naturalWidth,
            containerH / img.naturalHeight,
            1
          );
          setZoom(Math.max(0.1, fitZoom));
        }
      }, 100);
    };
    img.src = url;
  }, []);

  // Handle file input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadImage(file);
  };

  // Run detection
  const runDetection = useCallback(() => {
    if (!imgData) return;
    setIsDetecting(true);

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const start = performance.now();
      const detected = detectPanels(imgData, settings);
      const elapsed = performance.now() - start;
      setDetectionTime(elapsed);
      setPanels(detected);
      setIsDetecting(false);
    }, 50);
  }, [imgData, settings]);

  // Auto-detect on image load
  useEffect(() => {
    if (imgData && panels.length === 0) {
      runDetection();
    }
  }, [imgData]);

  // Export single panel
  const exportSinglePanel = async (panel: Panel, index: number) => {
    if (!imgData) return;
    const blob = await exportPanelAsBlob(imgData, panel, exportFormat, 0.95);
    saveAs(blob, `panel_${index + 1}.${exportFormat.split('/')[1]}`);
  };

  // Export all as ZIP
  const exportAllAsZip = async () => {
    if (!imgData || panels.length === 0) return;
    setIsExporting(true);
    const zip = new JSZip();
    const ext = exportFormat.split('/')[1];

    for (let i = 0; i < panels.length; i++) {
      const blob = await exportPanelAsBlob(imgData, panels[i], exportFormat, 0.95);
      zip.file(`panel_${String(i + 1).padStart(3, '0')}.${ext}`, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `webtoon_panels_${Date.now()}.zip`);
    setIsExporting(false);
  };

  // Zoom controls
  const zoomIn = () => setZoom(z => Math.min(5, z * 1.2));
  const zoomOut = () => setZoom(z => Math.max(0.1, z / 1.2));
  const fitToScreen = () => {
    if (!image || !containerRef.current) return;
    const containerW = containerRef.current.clientWidth - 40;
    const containerH = containerRef.current.clientHeight - 40;
    const fitZoom = Math.min(containerW / image.naturalWidth, containerH / image.naturalHeight, 1);
    setZoom(Math.max(0.1, fitZoom));
  };

  // Update setting helper
  const updateSetting = <K extends keyof DetectionSettings>(key: K, value: DetectionSettings[K]) => {
    setSettings(s => ({ ...s, [key]: value }));
  };

  // ============ RENDER ============
  return (
    <div className="h-screen w-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
            <span className="text-sm">🔍</span>
          </div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Webtoon Slicer
          </h1>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">AI Vision</span>
        </div>

        <div className="flex-1" />

        {state !== 'upload' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {image && `${image.naturalWidth}×${image.naturalHeight}`}
            </span>
            <span className="text-gray-600">|</span>
            <span className="text-xs text-gray-400">
              {panels.length} panels
            </span>
            {detectionTime > 0 && (
              <>
                <span className="text-gray-600">|</span>
                <span className="text-xs text-green-400">
                  {(detectionTime / 1000).toFixed(2)}s
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {state !== 'upload' && (
            <>
              <button
                onClick={() => setShowSettings(s => !s)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  showSettings ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                ⚙️ Settings
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
              >
                📁 New Image
              </button>
            </>
          )}
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Settings */}
        {state !== 'upload' && showSettings && (
          <aside className="w-72 bg-gray-900 border-r border-gray-800 overflow-y-auto shrink-0">
            <div className="p-4 space-y-5">
              {/* Detection Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  Detection
                </h3>
                <div className="space-y-3">
                  <SliderControl
                    label="Gutter Sensitivity"
                    value={settings.gutterSensitivity}
                    min={10} max={100}
                    onChange={v => updateSetting('gutterSensitivity', v)}
                    hint="How aggressively to find panel gaps"
                  />
                  <SliderControl
                    label="Edge Sensitivity"
                    value={settings.edgeSensitivity}
                    min={10} max={100}
                    onChange={v => updateSetting('edgeSensitivity', v)}
                    hint="Border detection threshold"
                  />
                  <SliderControl
                    label="Min Panel Size"
                    value={settings.minPanelSize}
                    min={30} max={300}
                    onChange={v => updateSetting('minPanelSize', v)}
                    hint="Minimum panel dimension (px)"
                  />
                  <SliderControl
                    label="Min Gap"
                    value={settings.minGapBetweenPanels}
                    min={2} max={30}
                    onChange={v => updateSetting('minGapBetweenPanels', v)}
                    hint="Minimum gap to be a gutter"
                  />
                </div>
              </div>

              {/* Content Protection */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  Content Protection
                </h3>
                <div className="space-y-2">
                  <ToggleControl
                    label="Protect Faces"
                    checked={settings.protectFaces}
                    onChange={v => updateSetting('protectFaces', v)}
                    hint="Avoid slicing through faces"
                  />
                  <ToggleControl
                    label="Protect Bubbles"
                    checked={settings.protectBubbles}
                    onChange={v => updateSetting('protectBubbles', v)}
                    hint="Avoid slicing through speech bubbles"
                  />
                  <ToggleControl
                    label="Protect Text"
                    checked={settings.protectText}
                    onChange={v => updateSetting('protectText', v)}
                    hint="Avoid slicing through text"
                  />
                  <SliderControl
                    label="Protection Strength"
                    value={settings.contentProtectionStrength}
                    min={0} max={100}
                    onChange={v => updateSetting('contentProtectionStrength', v)}
                  />
                </div>
              </div>

              {/* Panel Types */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  Panel Types
                </h3>
                <div className="space-y-2">
                  <ToggleControl
                    label="Diagonal Panels"
                    checked={settings.detectDiagonal}
                    onChange={v => updateSetting('detectDiagonal', v)}
                    hint="Detect angled panel borders"
                  />
                  <ToggleControl
                    label="Borderless Panels"
                    checked={settings.detectBorderless}
                    onChange={v => updateSetting('detectBorderless', v)}
                    hint="Detect panels without clear borders"
                  />
                  <ToggleControl
                    label="Inset Panels"
                    checked={settings.detectInset}
                    onChange={v => updateSetting('detectInset', v)}
                    hint="Detect small inset panels"
                  />
                </div>
              </div>

              {/* Layout */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Layout
                </h3>
                <div className="space-y-2">
                  <ToggleControl
                    label="Vertical Scroll (Webtoon)"
                    checked={settings.assumeVerticalScroll}
                    onChange={v => updateSetting('assumeVerticalScroll', v)}
                    hint="Optimize for vertical reading"
                  />
                  <ToggleControl
                    label="Merge Small Panels"
                    checked={settings.mergeSmallPanels}
                    onChange={v => updateSetting('mergeSmallPanels', v)}
                    hint="Combine tiny adjacent panels"
                  />
                  <ToggleControl
                    label="Adaptive Threshold"
                    checked={settings.useAdaptiveThreshold}
                    onChange={v => updateSetting('useAdaptiveThreshold', v)}
                    hint="Auto-adjust for lighting"
                  />
                </div>
              </div>

              {/* Advanced */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Advanced
                </h3>
                <div className="space-y-3">
                  <SliderControl
                    label="Morph Kernel"
                    value={settings.morphKernelSize}
                    min={3} max={15} step={2}
                    onChange={v => updateSetting('morphKernelSize', v)}
                    hint="Edge connection strength"
                  />
                  <SliderControl
                    label="Projection Smoothing"
                    value={settings.projectionSmoothing}
                    min={1} max={15}
                    onChange={v => updateSetting('projectionSmoothing', v)}
                    hint="Gutter detection smoothing"
                  />
                  <SliderControl
                    label="Max Panels"
                    value={settings.maxPanelCount}
                    min={5} max={100}
                    onChange={v => updateSetting('maxPanelCount', v)}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-800 space-y-2">
                <button
                  onClick={runDetection}
                  disabled={isDetecting}
                  className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDetecting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Analyzing...
                    </>
                  ) : (
                    <>🔍 Re-detect Panels</>
                  )}
                </button>
                <button
                  onClick={() => { setSettings({ ...DEFAULT_SETTINGS }); }}
                  className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
                >
                  Reset to Defaults
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto relative" ref={containerRef}>
          {state === 'upload' && (
            <div
              className="h-full flex items-center justify-center p-8"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`max-w-lg w-full p-12 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-purple-400 bg-purple-500/10 scale-105'
                    : 'border-gray-700 hover:border-gray-500 hover:bg-gray-900/50'
                }`}
              >
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                  <span className="text-4xl">📸</span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Drop your webtoon here</h2>
                <p className="text-gray-400 text-sm mb-4">
                  or click to browse files
                </p>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-500">
                  <span className="px-2 py-1 rounded bg-gray-800">PNG</span>
                  <span className="px-2 py-1 rounded bg-gray-800">JPG</span>
                  <span className="px-2 py-1 rounded bg-gray-800">WEBP</span>
                  <span className="px-2 py-1 rounded bg-gray-800">Any image format</span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3 text-left text-xs text-gray-400">
                  <div className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✓</span>
                    <span>Face & bubble protection</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✓</span>
                    <span>Diagonal panel detection</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✓</span>
                    <span>Borderless panel handling</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✓</span>
                    <span>No GPU required</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {state === 'editing' && image && (
            <div
              className="relative inline-block mx-auto my-4"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
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
                style={{ width: image.naturalWidth, height: image.naturalHeight }}
              />
              {/* Clickable panel overlays */}
              {panels.map((panel, index) => (
                <div
                  key={panel.id}
                  className={`absolute cursor-pointer transition-colors ${
                    selectedPanel === panel.id
                      ? 'bg-purple-500/10 ring-2 ring-purple-400'
                      : 'hover:bg-cyan-500/10'
                  }`}
                  style={{
                    left: panel.x,
                    top: panel.y,
                    width: panel.width,
                    height: panel.height,
                  }}
                  onClick={() => setSelectedPanel(panel.id === selectedPanel ? null : panel.id)}
                  onDoubleClick={() => exportSinglePanel(panel, index)}
                />
              ))}
            </div>
          )}

          {state === 'preview' && (
            <div className="p-6 max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Panel Preview</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                    {(['image/png', 'image/jpeg', 'image/webp'] as const).map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => setExportFormat(fmt)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          exportFormat === fmt ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {fmt.split('/')[1].toUpperCase()}
                      </button>
                    ))}
                  </div>
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
                    isSelected={selectedPanel === panel.id}
                    onClick={() => setSelectedPanel(panel.id === selectedPanel ? null : panel.id)}
                    onExport={() => exportSinglePanel(panel, index)}
                  />
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar - Panel list */}
        {state !== 'upload' && (
          <aside className="w-60 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm">
                Panels ({panels.length})
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => setState(state === 'preview' ? 'editing' : 'preview')}
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                  title={state === 'preview' ? 'Back to editor' : 'Preview panels'}
                >
                  {state === 'preview' ? '✏️' : '👁️'}
                </button>
              </div>
            </div>

            {/* Export format */}
            <div className="p-3 border-b border-gray-800">
              <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                {(['image/png', 'image/jpeg', 'image/webp'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                      exportFormat === fmt ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {fmt.split('/')[1].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Panel list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {panels.map((panel, index) => (
                <div
                  key={panel.id}
                  onClick={() => setSelectedPanel(panel.id === selectedPanel ? null : panel.id)}
                  className={`p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedPanel === panel.id
                      ? 'bg-purple-500/20 ring-1 ring-purple-500'
                      : 'hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300">
                        {index + 1}
                      </span>
                      <span className="text-xs text-gray-300 font-medium">
                        Panel {index + 1}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); exportSinglePanel(panel, index); }}
                      className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-white transition-colors"
                      title="Export"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-gray-500 text-[10px] mt-1 ml-7">
                    {panel.width}×{panel.height} • {panel.type}
                  </div>
                </div>
              ))}
              {panels.length === 0 && !isDetecting && (
                <div className="text-center py-8 text-gray-500 text-xs">
                  No panels detected.<br />Try adjusting settings.
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div className="p-3 border-t border-gray-800 space-y-2">
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

      {/* Zoom Controls */}
      {state === 'editing' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-gray-900/90 backdrop-blur-sm rounded-full px-3 py-1.5 border border-gray-700 shadow-xl z-40">
          <button onClick={zoomOut} className="p-1.5 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button onClick={fitToScreen} className="px-2 py-1 text-xs text-gray-300 hover:text-white font-mono min-w-[50px] text-center">
            {(zoom * 100).toFixed(0)}%
          </button>
          <button onClick={zoomIn} className="p-1.5 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {isDetecting && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-4 border border-gray-700 shadow-2xl max-w-sm">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-purple-500/30 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-purple-500 rounded-full animate-spin" />
              <div className="absolute inset-2 w-12 h-12 border-4 border-transparent border-t-cyan-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            </div>
            <div className="text-center">
              <p className="text-white font-semibold">Analyzing Image</p>
              <p className="text-gray-400 text-xs mt-1">Multi-pass vision pipeline running...</p>
              <div className="flex gap-2 mt-3 justify-center text-[10px] text-gray-500">
                <span className="px-2 py-0.5 rounded bg-gray-800">Gutter Analysis</span>
                <span className="px-2 py-0.5 rounded bg-gray-800">Edge Detection</span>
                <span className="px-2 py-0.5 rounded bg-gray-800">Content Protection</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ UI COMPONENTS ============

function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-400">{label}</label>
        <span className="text-xs text-purple-400 font-mono">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
      />
      {hint && <p className="text-[10px] text-gray-600 mt-0.5">{hint}</p>}
    </div>
  );
}

function ToggleControl({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs text-gray-300">{label}</span>
        {hint && <p className="text-[10px] text-gray-600">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-purple-600' : 'bg-gray-700'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export default App;
