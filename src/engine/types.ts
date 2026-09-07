/**
 * Core types for the Advanced Webtoon Panel Slicer engine
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Panel extends Rect {
  id: string;
  confidence: number;
  type: PanelType;
  angle?: number; // For diagonal panels
  pageIndex?: number;
  boundary?: Array<{ x: number; y: number }>; // For non-rectangular panels
}

export type PanelType = 
  | 'standard'      // Regular rectangular panel with clear borders
  | 'diagonal'      // Tilted/rotated panel
  | 'borderless'    // Panel with no visible border (bleed)
  | 'inset'         // Small panel overlaid on another
  | 'bleed'         // Panel extends to page edge
  | 'full-width'    // Panel spans full page width
  | 'split'         // Panel split vertically (common in manhwa)
  | 'irregular'     // Non-rectangular panel
  | 'overlapping';  // Panels that overlap each other

export type WebtoonType = 'manhwa' | 'manga' | 'manhua' | 'webtoon' | 'comic' | 'auto';

export type DetectionStrategy = 'cv' | 'ml' | 'hybrid' | 'ensemble';

export interface DetectionOptions {
  // Detection strategy
  strategy: DetectionStrategy;
  
  // Sensitivity (0-100)
  gutterSensitivity: number;
  edgeSensitivity: number;
  contentAwareness: number;
  
  // Panel constraints
  minPanelWidth: number;
  minPanelHeight: number;
  maxPanelCount: number;
  
  // Content protection
  protectFaces: boolean;
  protectText: boolean;
  protectBubbles: boolean;
  protectionStrength: number; // 0-100
  
  // Panel types to detect
  detectDiagonal: boolean;
  detectBorderless: boolean;
  detectInset: boolean;
  detectBleed: boolean;
  detectOverlapping: boolean;
  
  // Webtoon-specific
  webtoonType: WebtoonType;
  
  // Advanced options
  useMultiScale: boolean;       // Multi-scale feature pyramid
  useWatershed: boolean;        // Watershed segmentation
  useSuperpixels: boolean;      // SLIC superpixels
  useActiveContours: boolean;   // Snake refinement
  useTextureAnalysis: boolean;  // LBP texture features
  useMSER: boolean;             // Maximally Stable Extremal Regions
  useHierarchical: boolean;     // Hierarchical panel detection
  refineBoundaries: boolean;    // Refine boundaries with graph cut/active contours
  snapToEdges: boolean;         // Snap panel boundaries to strong edges
  
  // ML model options
  modelPath?: string;
  useGPU: boolean;
  
  // Output options
  mergeThreshold: number; // 0-100
  splitThreshold: number; // 0-100
  
  // Performance
  maxProcessingTime?: number; // ms, optional timeout
  fastMode?: boolean; // Skip expensive algorithms for faster results
}

export const DEFAULT_OPTIONS: DetectionOptions = {
  strategy: 'hybrid',
  gutterSensitivity: 65,
  edgeSensitivity: 60,
  contentAwareness: 75,
  minPanelWidth: 80,
  minPanelHeight: 100,
  maxPanelCount: 50,
  protectFaces: true,
  protectText: true,
  protectBubbles: true,
  protectionStrength: 80,
  detectDiagonal: true,
  detectBorderless: true,
  detectInset: true,
  detectBleed: true,
  detectOverlapping: true,
  webtoonType: 'auto',
  useMultiScale: true,
  useWatershed: true,
  useSuperpixels: true,
  useActiveContours: true,
  useTextureAnalysis: true,
  useMSER: true,
  useHierarchical: true,
  refineBoundaries: true,
  snapToEdges: true,
  useGPU: false,
  mergeThreshold: 15,
  splitThreshold: 20,
  fastMode: false,
};

export interface SliceResult {
  panels: Panel[];
  processingTime: number;
  strategy: string;
  imageWidth: number;
  imageHeight: number;
  metadata?: {
    cvPanels: number;
    mlPanels: number;
    mergedPanels: number;
    protectedCuts: number;
    techniquesUsed: string[];
    confidenceAvg: number;
  };
}

export interface BatchResult {
  results: Map<string, SliceResult>;
  totalTime: number;
  successCount: number;
  errorCount: number;
  errors: Map<string, Error>;
}
