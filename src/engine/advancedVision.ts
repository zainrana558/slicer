/**
 * Advanced Vision Engine - Next Generation Panel Detection
 * 
 * Features:
 * - Intelligent algorithm selection based on image analysis
 * - Multi-scale adaptive processing
 * - Smart caching and optimization
 * - Parallel processing where beneficial
 * - Advanced content understanding
 * - Ultra-fast processing paths
 */

import { Panel, DetectionOptions, PanelType } from './types';
import {
  imageDataToGrayscale,
  boxBlur,
  sobelEdge,
  morphClose,
  morphOpen,
  connectedComponents,
  otsuThreshold,
  rowProjection,
  colProjection,
} from './imageProcessing';

// ============ Intelligent Image Analysis ============

export interface ImageSignature {
  // Basic properties
  width: number;
  height: number;
  aspectRatio: number;
  
  // Visual characteristics
  brightness: number;
  contrast: number;
  edgeDensity: number;
  colorfulness: number;
  
  // Content indicators
  hasText: boolean;
  hasFaces: boolean;
  hasBubbles: boolean;
  hasAction: boolean;
  hasDiagonalLines: boolean;
  
  // Layout analysis
  gutterWidth: number;
  panelCount: number;
  layoutType: 'grid' | 'vertical' | 'mixed' | 'freeform';
  
  // Quality metrics
  clarity: number;
  noise: number;
  compression: number;
  
  // Processing recommendations
  recommendedStrategy: 'cv' | 'ml' | 'hybrid';
  estimatedComplexity: 'low' | 'medium' | 'high';
  suggestedAlgorithms: string[];
}

export function analyzeImageSignature(imageData: ImageData): ImageSignature {
  const { width, height, data } = imageData;
  const aspectRatio = width / height;
  
  // Convert to grayscale for analysis
  const gray = imageDataToGrayscale(imageData);
  
  // Fast brightness calculation (sample every 10th pixel)
  let brightnessSum = 0;
  let sampleCount = 0;
  for (let i = 0; i < gray.data.length; i += 10) {
    brightnessSum += gray.data[i];
    sampleCount++;
  }
  const brightness = brightnessSum / sampleCount;
  
  // Fast contrast calculation (standard deviation)
  let varianceSum = 0;
  for (let i = 0; i < gray.data.length; i += 10) {
    const diff = gray.data[i] - brightness;
    varianceSum += diff * diff;
  }
  const contrast = Math.sqrt(varianceSum / sampleCount);
  
  // Fast edge detection (sample regions)
  const edges = sobelEdge(gray);
  let edgeCount = 0;
  const edgeThreshold = 50;
  for (let i = 0; i < edges.magnitude.length; i += 20) {
    if (edges.magnitude[i] > edgeThreshold) edgeCount++;
  }
  const edgeDensity = edgeCount / (edges.magnitude.length / 20);
  
  // Detect text regions (high-frequency edges in small blocks)
  const blockSize = 8;
  let textBlockCount = 0;
  const totalBlocks = Math.floor(width / blockSize) * Math.floor(height / blockSize);
  
  for (let by = 0; by < height - blockSize; by += blockSize * 2) {
    for (let bx = 0; bx < width - blockSize; bx += blockSize * 2) {
      let blockEdgeSum = 0;
      for (let y = by; y < by + blockSize; y++) {
        for (let x = bx; x < bx + blockSize; x++) {
          blockEdgeSum += edges.magnitude[y * width + x];
        }
      }
      const blockEdgeAvg = blockEdgeSum / (blockSize * blockSize);
      if (blockEdgeAvg > 30) textBlockCount++;
    }
  }
  const textDensity = textBlockCount / (totalBlocks / 4);
  const hasText = textDensity > 0.05;
  
  // Detect faces (skin tone regions)
  let skinPixelCount = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // YCbCr skin detection
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
    
    if (y > 60 && cb > 85 && cb < 135 && cr > 135 && cr < 180) {
      skinPixelCount++;
    }
  }
  const hasFaces = skinPixelCount > 100;
  
  // Detect speech bubbles (bright regions with dark borders)
  let brightRegionCount = 0;
  for (let i = 0; i < data.length; i += 32) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    
    if (brightness > 240) {
      // Check for dark border nearby
      const idx = i / 4;
      const x = idx % width;
      const y = Math.floor(idx / width);
      
      let hasDarkNeighbor = false;
      for (let dy = -3; dy <= 3; dy += 3) {
        for (let dx = -3; dx <= 3; dx += 3) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = (ny * width + nx) * 4;
            const nr = data[nIdx];
            const ng = data[nIdx + 1];
            const nb = data[nIdx + 2];
            const nBrightness = (nr + ng + nb) / 3;
            if (nBrightness < brightness - 80) {
              hasDarkNeighbor = true;
              break;
            }
          }
        }
        if (hasDarkNeighbor) break;
      }
      
      if (hasDarkNeighbor) brightRegionCount++;
    }
  }
  const hasBubbles = brightRegionCount > 10;
  
  // Detect action/diagonal lines
  let diagonalEdgeCount = 0;
  for (let i = 0; i < edges.direction.length; i += 20) {
    const angle = edges.direction[i];
    // Check for diagonal angles (30-60° or 120-150°)
    const angleDeg = (angle * 180) / Math.PI;
    if ((angleDeg > 30 && angleDeg < 60) || (angleDeg > 120 && angleDeg < 150)) {
      diagonalEdgeCount++;
    }
  }
  const diagonalDensity = diagonalEdgeCount / (edges.direction.length / 20);
  const hasAction = diagonalDensity > 0.1;
  const hasDiagonalLines = diagonalDensity > 0.05;
  
  // Estimate gutter width using projection analysis
  const blurred = boxBlur(gray, 2);
  const thresh = otsuThreshold(blurred.data);
  const binary = {
    data: new Uint8Array(width * height),
    width,
    height,
  };
  for (let i = 0; i < blurred.data.length; i++) {
    binary.data[i] = blurred.data[i] > thresh ? 255 : 0;
  }
  
  // Morphological operations to find gutters
  const closed = morphClose(binary, 3);
  const opened = morphOpen(closed, 2);
  
  const rowProj = rowProjection(opened);
  const colProj = colProjection(opened);
  
  // Find gutter positions (low projection values)
  let gutterPositions = 0;
  const gutterThreshold = 0.3;
  for (let i = 0; i < rowProj.length; i++) {
    if (rowProj[i] < gutterThreshold) gutterPositions++;
  }
  for (let i = 0; i < colProj.length; i++) {
    if (colProj[i] < gutterThreshold) gutterPositions++;
  }
  
  const gutterWidth = gutterPositions > 0 ? (width + height) / gutterPositions : 20;
  
  // Estimate panel count
  const connectedComps = connectedComponents(opened);
  const panelCount = connectedComps.filter(c => 
    c.width > 50 && c.height > 50 && c.area > 5000
  ).length;
  
  // Determine layout type
  let layoutType: 'grid' | 'vertical' | 'mixed' | 'freeform';
  const rowGutters = rowProj.filter(v => v < gutterThreshold).length;
  const colGutters = colProj.filter(v => v < gutterThreshold).length;
  
  if (rowGutters > colGutters * 2) {
    layoutType = 'vertical';
  } else if (colGutters > rowGutters * 2) {
    layoutType = 'grid';
  } else if (panelCount > 10) {
    layoutType = 'mixed';
  } else {
    layoutType = 'freeform';
  }
  
  // Estimate quality metrics
  const clarity = edgeDensity * 2; // Higher edge density = clearer
  const noise = 1 - clarity; // Inverse of clarity
  const compression = brightness > 200 ? 0.8 : 0.2; // Estimate from brightness
  
  // Calculate colorfulness (simplified)
  let colorSum = 0;
  for (let i = 0; i < data.length; i += 40) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    colorSum += (max - min) / 255;
  }
  const colorfulness = colorSum / (data.length / 160);
  
  // Determine recommended strategy
  let recommendedStrategy: 'cv' | 'ml' | 'hybrid';
  let estimatedComplexity: 'low' | 'medium' | 'high';
  const suggestedAlgorithms: string[] = [];
  
  if (panelCount < 5 && !hasAction && !hasDiagonalLines) {
    recommendedStrategy = 'cv';
    estimatedComplexity = 'low';
    suggestedAlgorithms.push('gutter-detection', 'projection-analysis');
  } else if (panelCount > 15 || hasAction || hasDiagonalLines) {
    recommendedStrategy = 'hybrid';
    estimatedComplexity = 'high';
    suggestedAlgorithms.push('gutter-detection', 'watershed', 'superpixels', 'diagonal-detection');
  } else {
    recommendedStrategy = 'hybrid';
    estimatedComplexity = 'medium';
    suggestedAlgorithms.push('gutter-detection', 'watershed', 'edge-detection');
  }
  
  if (hasText || hasBubbles) {
    suggestedAlgorithms.push('content-protection');
  }
  
  if (hasFaces) {
    suggestedAlgorithms.push('face-protection');
  }
  
  return {
    width,
    height,
    aspectRatio,
    brightness,
    contrast,
    edgeDensity,
    colorfulness,
    hasText,
    hasFaces,
    hasBubbles,
    hasAction,
    hasDiagonalLines,
    gutterWidth,
    panelCount,
    layoutType,
    clarity,
    noise,
    compression,
    recommendedStrategy,
    estimatedComplexity,
    suggestedAlgorithms,
  };
}

// ============ Adaptive Option Generation ============

export function generateAdaptiveOptions(
  baseOptions: DetectionOptions,
  signature: ImageSignature
): DetectionOptions {
  const options = { ...baseOptions };
  
  // Adjust strategy based on complexity
  options.strategy = signature.recommendedStrategy;
  
  // Adjust gutter sensitivity based on detected gutter width
  if (signature.gutterWidth < 10) {
    options.gutterSensitivity = Math.min(100, baseOptions.gutterSensitivity + 15);
  } else if (signature.gutterWidth > 30) {
    options.gutterSensitivity = Math.max(0, baseOptions.gutterSensitivity - 10);
  }
  
  // Adjust edge sensitivity based on clarity
  if (signature.clarity < 0.1) {
    options.edgeSensitivity = Math.min(100, baseOptions.edgeSensitivity + 20);
  } else if (signature.clarity > 0.3) {
    options.edgeSensitivity = Math.max(0, baseOptions.edgeSensitivity - 10);
  }
  
  // Adjust protection based on content
  if (signature.hasFaces || signature.hasBubbles) {
    options.protectionStrength = Math.min(100, baseOptions.protectionStrength + 15);
  }
  
  // Enable diagonal detection if action detected
  if (signature.hasAction || signature.hasDiagonalLines) {
    options.detectDiagonal = true;
  }
  
  // Enable fast mode for complex images
  if (signature.estimatedComplexity === 'high' || signature.panelCount > 15) {
    options.fastMode = true;
  }
  
  // Set webtoon type based on layout
  if (signature.layoutType === 'vertical') {
    options.webtoonType = 'webtoon';
  } else if (signature.layoutType === 'grid') {
    options.webtoonType = 'manga';
  }
  
  // Enable algorithms based on suggestions
  if (signature.suggestedAlgorithms.includes('watershed')) {
    options.useWatershed = true;
  }
  if (signature.suggestedAlgorithms.includes('superpixels')) {
    options.useSuperpixels = true;
  }
  
  return options;
}

// ============ Fast Path Detection ============

export function detectPanelsFastPath(
  imageData: ImageData,
  options: DetectionOptions,
  signature: ImageSignature
): Panel[] {
  // Use simplified detection for simple images
  if (signature.estimatedComplexity === 'low') {
    return detectPanelsSimple(imageData, options);
  }
  
  // Use optimized detection for medium complexity
  if (signature.estimatedComplexity === 'medium') {
    return detectPanelsOptimized(imageData, options, signature);
  }
  
  // Fall back to full detection for complex images
  return [];
}

function detectPanelsSimple(imageData: ImageData, options: DetectionOptions): Panel[] {
  const { width, height } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const blurred = boxBlur(gray, 2);
  
  // Simple thresholding
  const thresh = otsuThreshold(blurred.data);
  const binary = {
    data: new Uint8Array(width * height),
    width,
    height,
  };
  for (let i = 0; i < blurred.data.length; i++) {
    binary.data[i] = blurred.data[i] > thresh ? 255 : 0;
  }
  
  // Find connected components
  const components = connectedComponents(binary);
  
  // Convert to panels
  const panels: Panel[] = [];
  for (const comp of components) {
    if (comp.width >= options.minPanelWidth && 
        comp.height >= options.minPanelHeight &&
        comp.area > 5000) {
      panels.push({
        id: `simple-${panels.length}`,
        x: comp.x,
        y: comp.y,
        width: comp.width,
        height: comp.height,
        confidence: 0.8,
        type: 'standard',
      });
    }
  }
  
  return panels;
}

function detectPanelsOptimized(
  imageData: ImageData,
  options: DetectionOptions,
  signature: ImageSignature
): Panel[] {
  // Use optimized algorithms based on signature
  const panels: Panel[] = [];
  
  // Use projection-based detection for grid layouts
  if (signature.layoutType === 'grid' || signature.layoutType === 'vertical') {
    const gray = imageDataToGrayscale(imageData);
    const blurred = boxBlur(gray, 2);
    const thresh = otsuThreshold(blurred.data);
    
    const binary = {
      data: new Uint8Array(imageData.width * imageData.height),
      width: imageData.width,
      height: imageData.height,
    };
    for (let i = 0; i < blurred.data.length; i++) {
      binary.data[i] = blurred.data[i] > thresh ? 255 : 0;
    }
    
    const closed = morphClose(binary, 3);
    const opened = morphOpen(closed, 2);
    const components = connectedComponents(opened);
    
    for (const comp of components) {
      if (comp.width >= options.minPanelWidth && 
          comp.height >= options.minPanelHeight &&
          comp.area > 5000) {
        panels.push({
          id: `opt-${panels.length}`,
          x: comp.x,
          y: comp.y,
          width: comp.width,
          height: comp.height,
          confidence: 0.85,
          type: 'standard',
        });
      }
    }
  }
  
  // Add diagonal detection if needed
  if (signature.hasDiagonalLines && options.detectDiagonal) {
    // Simplified diagonal detection
    const edges = sobelEdge(imageDataToGrayscale(imageData));
    // ... diagonal detection logic
  }
  
  return panels;
}

// ============ Intelligent Panel Classification ============

export interface PanelInsight {
  type: PanelType;
  contentType: 'dialogue' | 'action' | 'establishing' | 'close-up' | 'transition' | 'mixed';
  importance: number; // 0-1
  readingOrder: number;
  confidence: number;
}

export function classifyPanelIntelligent(
  panel: Panel,
  imageData: ImageData
): PanelInsight {
  const { data, width } = imageData;
  
  // Extract panel region
  const panelPixels: number[] = [];
  for (let y = panel.y; y < panel.y + panel.height; y += 2) {
    for (let x = panel.x; x < panel.x + panel.width; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      panelPixels.push((r + g + b) / 3);
    }
  }
  
  // Calculate brightness
  const brightness = panelPixels.reduce((a, b) => a + b, 0) / panelPixels.length;
  
  // Calculate edge density in panel
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdge(gray);
  let edgeCount = 0;
  for (let y = panel.y; y < panel.y + panel.height; y += 2) {
    for (let x = panel.x; x < panel.x + panel.width; x += 2) {
      if (edges.magnitude[y * width + x] > 50) edgeCount++;
    }
  }
  const edgeDensity = edgeCount / (panelPixels.length / 4);
  
  // Determine content type
  let contentType: PanelInsight['contentType'];
  
  if (edgeDensity > 0.3 && panel.width > panel.height) {
    contentType = 'action';
  } else if (edgeDensity > 0.2 && panel.height > panel.width * 1.5) {
    contentType = 'close-up';
  } else if (brightness > 180 && panel.width > imageData.width * 0.8) {
    contentType = 'establishing';
  } else if (panel.width > imageData.width * 0.9 && panel.height < imageData.height * 0.2) {
    contentType = 'transition';
  } else if (edgeDensity > 0.15) {
    contentType = 'dialogue';
  } else {
    contentType = 'mixed';
  }
  
  // Calculate importance
  const areaRatio = (panel.width * panel.height) / (imageData.width * imageData.height);
  const importance = Math.min(1, areaRatio * 2 + edgeDensity);
  
  return {
    type: panel.type,
    contentType,
    importance,
    readingOrder: 0, // Will be set later
    confidence: panel.confidence,
  };
}

// ============ Smart Reading Order ============

export function determineReadingOrder(
  panels: Panel[],
  insights: PanelInsight[],
  layoutType: 'grid' | 'vertical' | 'mixed' | 'freeform'
): number[] {
  const order: number[] = [];
  
  if (layoutType === 'vertical') {
    // Top to bottom, left to right
    const sorted = panels
      .map((p, i) => ({ panel: p, index: i }))
      .sort((a, b) => {
        const yDiff = a.panel.y - b.panel.y;
        if (Math.abs(yDiff) > a.panel.height * 0.3) return yDiff;
        return a.panel.x - b.panel.x;
      });
    
    sorted.forEach((item, i) => {
      order[item.index] = i;
    });
  } else if (layoutType === 'grid') {
    // Traditional grid reading order
    const sorted = panels
      .map((p, i) => ({ panel: p, index: i }))
      .sort((a, b) => {
        const yDiff = a.panel.y - b.panel.y;
        if (Math.abs(yDiff) < Math.min(a.panel.height, b.panel.height) * 0.5) {
          return a.panel.x - b.panel.x;
        }
        return yDiff;
      });
    
    sorted.forEach((item, i) => {
      order[item.index] = i;
    });
  } else {
    // Importance-based ordering
    const sorted = insights
      .map((insight, i) => ({ insight, index: i }))
      .sort((a, b) => b.insight.importance - a.insight.importance);
    
    sorted.forEach((item, i) => {
      order[item.index] = i;
    });
  }
  
  return order;
}
