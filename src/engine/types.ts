/**
 * Core types for the Webtoon Panel Slicer engine
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
}

export type PanelType = 
  | 'standard'      // Regular rectangular panel with clear borders
  | 'diagonal'      // Tilted/rotated panel
  | 'borderless'    // Panel with no visible border (bleed)
  | 'inset'         // Small panel overlaid on another
  | 'bleed'         // Panel extends to page edge
  | 'full-width'    // Panel spans full page width
  | 'split'         // Panel split vertically (common in manhwa)
  | 'irregular';    // Non-rectangular panel

export interface DetectionOptions {
  // Detection strategy
  strategy: 'cv' | 'ml' | 'hybrid';
  
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
  
  // Webtoon-specific
  webtoonType: 'manhwa' | 'manga' | 'manhua' | 'vertical' | 'auto';
  
  // ML model options
  modelPath?: string;
  useGPU: boolean;
  
  // Output options
  mergeThreshold: number; // 0-100
  splitThreshold: number; // 0-100
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
  webtoonType: 'auto',
  useGPU: false,
  mergeThreshold: 15,
  splitThreshold: 20,
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
  };
}

export interface BatchResult {
  results: Map<string, SliceResult>;
  totalTime: number;
  successCount: number;
  errorCount: number;
  errors: Map<string, Error>;
}
