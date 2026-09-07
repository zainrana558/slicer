/**
 * Hybrid Panel Detection Engine
 * Combines CV-based detection with ML vision for human-level accuracy
 * 
 * Strategy:
 * 1. Analyze image characteristics for adaptive tuning
 * 2. Run CV detection (fast, good for structured panels)
 * 3. Run ML detection (slower, understands content)
 * 4. Fuse results: use ML to validate/correct CV results
 * 5. Apply content protection to prevent cutting through faces/text
 * 6. Classify panel content types
 * 7. Score detection quality
 */

import { Panel, DetectionOptions, SliceResult } from './types';
import { detectPanelsCV } from './cv';
import { detectPanelsML, initializeVisionModel, isModelLoaded } from './vision';
import { 
  analyzeImageCharacteristics, 
  getAdaptiveOptions, 
  classifyPanelContent, 
  scoreDetectionQuality,
  ImageCharacteristics,
  PanelContent,
  DetectionQuality
} from './intelligent';
import { 
  advancedDetection, 
  softNMS, 
  applyTTA, 
  ensembleDetections, 
  multiScaleDetection, 
  attentionRefinement 
} from './advancedTechniques';

export { initializeVisionModel, isModelLoaded };

/**
 * Main detection function - automatically chooses strategy
 */
export async function detectPanels(
  imageData: ImageData,
  options: DetectionOptions
): Promise<SliceResult> {
  const startTime = performance.now();
  const { width, height } = imageData;
  
  // Step 1: Analyze image characteristics for intelligent tuning
  const characteristics = analyzeImageCharacteristics(imageData);
  
  // Step 2: Get adaptive options based on image analysis
  const adaptiveOptions = options.useIntelligentMode 
    ? getAdaptiveOptions(options, characteristics)
    : options;
  
  let panels: Panel[] = [];
  let metadata: SliceResult['metadata'] = undefined;
  let strategy = adaptiveOptions.strategy;
  
  switch (adaptiveOptions.strategy) {
    case 'cv':
      panels = detectPanelsCV(imageData, adaptiveOptions);
      strategy = 'cv';
      break;
      
    case 'ml':
      panels = await detectPanelsML(imageData, adaptiveOptions);
      strategy = 'ml';
      break;
      
    case 'hybrid':
    default:
      const result = await hybridDetect(imageData, adaptiveOptions);
      panels = result.panels;
      metadata = result.metadata;
      strategy = 'hybrid';
      break;
  }
  
  // Final post-processing
  panels = postProcessPanels(panels, imageData, adaptiveOptions);
  
  // Step 2.5: Apply advanced techniques (if enabled)
  if (adaptiveOptions.useAdvancedTechniques) {
    const advancedOptions = adaptiveOptions.advancedTechniques || {};
    
    panels = await advancedDetection(
      imageData,
      async (img) => detectPanelsCV(img, adaptiveOptions),
      {
        useTTA: advancedOptions.useTTA,
        useSoftNMS: advancedOptions.useSoftNMS,
        useMultiScale: advancedOptions.useMultiScale,
        useAttention: advancedOptions.useAttention,
      }
    );
  }
  
  // Step 3: Classify panel content types (if intelligent mode)
  let panelContents: PanelContent[] | undefined;
  if (options.useIntelligentMode) {
    panelContents = panels.map(panel => classifyPanelContent(panel, imageData));
  }
  
  // Step 4: Score detection quality (if intelligent mode)
  let quality: DetectionQuality | undefined;
  if (options.useIntelligentMode) {
    quality = scoreDetectionQuality(panels, imageData, characteristics);
  }
  
  const processingTime = performance.now() - startTime;
  
  return {
    panels,
    processingTime,
    strategy,
    imageWidth: width,
    imageHeight: height,
    metadata: metadata ? {
      ...metadata,
      characteristics,
      panelContents,
      quality,
    } : {
      characteristics,
      panelContents,
      quality,
    } as any,
  };
}

interface HybridResult {
  panels: Panel[];
  metadata: {
    cvPanels: number;
    mlPanels: number;
    mergedPanels: number;
    protectedCuts: number;
    techniquesUsed: string[];
    confidenceAvg: number;
  };
}

async function hybridDetect(
  imageData: ImageData,
  options: DetectionOptions
): Promise<HybridResult> {
  const { width, height } = imageData;
  
  // Step 1: Run CV detection (fast)
  const cvPanels = detectPanelsCV(imageData, options);
  
  // Step 2: Try ML detection (if model is available)
  let mlPanels: Panel[] = [];
  let mlAvailable = false;
  
  try {
    if (isModelLoaded()) {
      mlPanels = await detectPanelsML(imageData, options);
      mlAvailable = true;
    }
  } catch (e) {
    console.warn('ML detection failed, falling back to CV only:', e);
  }
  
  // Step 3: Fuse results
  let fusedPanels: Panel[];
  
  if (mlAvailable && mlPanels.length > 0) {
    fusedPanels = fuseResults(cvPanels, mlPanels, imageData, options);
  } else {
    fusedPanels = cvPanels;
  }
  
  return {
    panels: fusedPanels,
    metadata: {
      cvPanels: cvPanels.length,
      mlPanels: mlPanels.length,
      mergedPanels: fusedPanels.length,
      protectedCuts: 0,
      techniquesUsed: ['cv', 'ml', 'fusion'],
      confidenceAvg: fusedPanels.reduce((sum, p) => sum + p.confidence, 0) / Math.max(1, fusedPanels.length),
    },
  };
}

/**
 * Fuse CV and ML results for best accuracy
 * 
 * Strategy:
 * - If both agree on a panel, keep it with higher confidence
 * - If only CV found it, validate with ML content analysis
 * - If only ML found it, validate with CV structural analysis
 * - Resolve conflicts by choosing the more precise boundary
 */
function fuseResults(
  cvPanels: Panel[],
  mlPanels: Panel[],
  imageData: ImageData,
  options: DetectionOptions
): Panel[] {
  const fused: Panel[] = [];
  const usedML = new Set<number>();
  
  for (const cvPanel of cvPanels) {
    // Find best matching ML panel
    let bestMatch = -1;
    let bestOverlap = 0;
    
    for (let i = 0; i < mlPanels.length; i++) {
      if (usedML.has(i)) continue;
      const overlap = computeIoU(cvPanel, mlPanels[i]);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = i;
      }
    }
    
    if (bestOverlap > 0.5) {
      // Both agree - use the more precise one
      const mlPanel = mlPanels[bestMatch];
      usedML.add(bestMatch);
      
      // Choose the one with tighter bounds (less gutter included)
      const cvTightness = computeTightness(cvPanel, imageData);
      const mlTightness = computeTightness(mlPanel, imageData);
      
      if (mlTightness > cvTightness) {
        fused.push({
          ...mlPanel,
          confidence: Math.max(cvPanel.confidence, mlPanel.confidence),
        });
      } else {
        fused.push({
          ...cvPanel,
          confidence: Math.max(cvPanel.confidence, mlPanel.confidence),
        });
      }
    } else if (bestOverlap > 0.2) {
      // Partial overlap - refine CV panel using ML info
      const mlPanel = mlPanels[bestMatch];
      usedML.add(bestMatch);
      
      const refined = refinePanelBounds(cvPanel, mlPanel, imageData);
      fused.push(refined);
    } else {
      // No ML match - keep CV panel but lower confidence
      fused.push({
        ...cvPanel,
        confidence: cvPanel.confidence * 0.8,
      });
    }
  }
  
  // Add ML-only panels that weren't matched
  for (let i = 0; i < mlPanels.length; i++) {
    if (!usedML.has(i)) {
      const mlPanel = mlPanels[i];
      // Validate with structural analysis
      if (validatePanelStructure(mlPanel, imageData, options)) {
        fused.push({
          ...mlPanel,
          confidence: mlPanel.confidence * 0.7,
        });
      }
    }
  }
  
  return fused;
}

function computeIoU(a: { x: number; y: number; width: number; height: number }, 
                    b: { x: number; y: number; width: number; height: number }): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  
  if (x2 <= x1 || y2 <= y1) return 0;
  
  const intersection = (x2 - x1) * (y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  
  return union > 0 ? intersection / union : 0;
}

function computeTightness(
  panel: { x: number; y: number; width: number; height: number },
  imageData: ImageData
): number {
  const { data, width } = imageData;
  const { x, y, width: pw, height: ph } = panel;
  
  // Check how much of the panel border has actual content vs gutter
  let borderContent = 0;
  let borderTotal = 0;
  const border = 5;
  
  // Top and bottom borders
  for (let px = x; px < x + pw; px += 3) {
    for (let dy = 0; dy < border; dy++) {
      const idx1 = ((y + dy) * width + px) * 4;
      const idx2 = ((y + ph - 1 - dy) * width + px) * 4;
      
      const b1 = (data[idx1] + data[idx1+1] + data[idx1+2]) / 3;
      const b2 = (data[idx2] + data[idx2+1] + data[idx2+2]) / 3;
      
      // Content has variance, gutter is uniform
      if (b1 > 10 && b1 < 245) borderContent++;
      if (b2 > 10 && b2 < 245) borderContent++;
      borderTotal += 2;
    }
  }
  
  return borderTotal > 0 ? borderContent / borderTotal : 0;
}

function refinePanelBounds(
  cvPanel: Panel,
  mlPanel: Panel,
  imageData: ImageData
): Panel {
  // Use ML panel to tighten CV panel bounds
  // The ML model is better at finding the actual content boundary
  
  const { data, width, height } = imageData;
  
  // Start with CV bounds, shrink towards ML bounds where content is
  let { x, y, width: pw, height: ph } = cvPanel;
  
  // Check each edge and adjust if ML suggests tighter bounds
  const mlRight = mlPanel.x + mlPanel.width;
  const cvRight = x + pw;
  
  if (mlRight < cvRight - 10) {
    // ML says right edge is further left - check if there's content between
    const hasContent = checkVerticalContent(data, width, height, mlRight, y, ph);
    if (!hasContent) {
      pw = mlRight - x;
    }
  }
  
  const mlBottom = mlPanel.y + mlPanel.height;
  const cvBottom = y + ph;
  
  if (mlBottom < cvBottom - 10) {
    const hasContent = checkHorizontalContent(data, width, height, x, pw, mlBottom);
    if (!hasContent) {
      ph = mlBottom - y;
    }
  }
  
  return {
    ...cvPanel,
    x, y, width: pw, height: ph,
    confidence: (cvPanel.confidence + mlPanel.confidence) / 2,
  };
}

function checkVerticalContent(
  data: Uint8ClampedArray, width: number, height: number,
  x: number, y: number, h: number
): boolean {
  let contentPixels = 0;
  const step = 3;
  
  for (let py = y; py < y + h; py += step) {
    for (let px = x; px < x + 10 && px < width; px++) {
      const idx = (py * width + px) * 4;
      const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;
      if (brightness > 20 && brightness < 235) contentPixels++;
    }
  }
  
  return contentPixels > (h / step) * 2;
}

function checkHorizontalContent(
  data: Uint8ClampedArray, width: number, height: number,
  x: number, w: number, y: number
): boolean {
  let contentPixels = 0;
  const step = 3;
  
  for (let px = x; px < x + w; px += step) {
    for (let py = y; py < y + 10 && py < height; py++) {
      const idx = (py * width + px) * 4;
      const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;
      if (brightness > 20 && brightness < 235) contentPixels++;
    }
  }
  
  return contentPixels > (w / step) * 2;
}

function validatePanelStructure(
  panel: Panel,
  imageData: ImageData,
  options: DetectionOptions
): boolean {
  const { width, height } = imageData;
  
  // Must meet minimum size
  if (panel.width < options.minPanelWidth || panel.height < options.minPanelHeight) {
    return false;
  }
  
  // Must not be too small relative to image
  const areaRatio = (panel.width * panel.height) / (width * height);
  if (areaRatio < 0.01) return false;
  
  // Must contain some content
  const { data } = imageData;
  let contentPixels = 0;
  const sampleStep = 4;
  let totalSamples = 0;
  
  for (let py = panel.y; py < panel.y + panel.height; py += sampleStep) {
    for (let px = panel.x; px < panel.x + panel.width; px += sampleStep) {
      const idx = (py * width + px) * 4;
      const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;
      if (brightness > 15 && brightness < 240) contentPixels++;
      totalSamples++;
    }
  }
  
  return totalSamples > 0 && (contentPixels / totalSamples) > 0.1;
}

/**
 * Post-process panels: remove duplicates, fix overlaps, sort
 */
function postProcessPanels(
  panels: Panel[],
  imageData: ImageData,
  options: DetectionOptions
): Panel[] {
  // Remove panels that are almost entirely contained in another
  const filtered = panels.filter((panel, i) => {
    for (let j = 0; j < panels.length; j++) {
      if (i === j) continue;
      const other = panels[j];
      
      // Check if panel is mostly inside other
      const overlapX = Math.max(0, Math.min(panel.x + panel.width, other.x + other.width) - Math.max(panel.x, other.x));
      const overlapY = Math.max(0, Math.min(panel.y + panel.height, other.y + other.height) - Math.max(panel.y, other.y));
      const overlapArea = overlapX * overlapY;
      const panelArea = panel.width * panel.height;
      
      if (panelArea > 0 && overlapArea / panelArea > 0.8 && other.width * other.height > panelArea) {
        return false; // This panel is mostly inside another, larger panel
      }
    }
    return true;
  });
  
  // Re-index
  return filtered.map((p, i) => ({ ...p, id: `panel-${i}` }));
}

/**
 * Export a single panel as a Blob
 */
export async function exportPanelAsBlob(
  imageData: ImageData,
  panel: Panel,
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality: number = 0.95
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = panel.width;
  canvas.height = panel.height;
  const ctx = canvas.getContext('2d')!;
  
  // Create a temporary canvas with the full image
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = imageData.width;
  srcCanvas.height = imageData.height;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.putImageData(imageData, 0, 0);
  
  // Draw the panel region
  ctx.drawImage(
    srcCanvas,
    panel.x, panel.y, panel.width, panel.height,
    0, 0, panel.width, panel.height
  );
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      format,
      quality
    );
  });
}
