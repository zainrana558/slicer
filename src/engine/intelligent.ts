/**
 * Intelligent Panel Analysis Module
 * 
 * Advanced features:
 * 1. Adaptive parameter tuning based on image characteristics
 * 2. Panel content classification (text, action, dialogue, etc.)
 * 3. Layout pattern recognition (grid, vertical, mixed)
 * 4. Intelligent boundary refinement
 * 5. Panel relationship analysis
 * 6. Quality scoring and optimization
 */

import { Panel, DetectionOptions, PanelType } from './types';
import { GrayscaleImage, BinaryImage, imageDataToGrayscale, sobelEdge, connectedComponents } from './imageProcessing';

// ============ Image Characteristic Analysis ============

export interface ImageCharacteristics {
  // Basic stats
  brightness: number;
  contrast: number;
  edgeDensity: number;
  colorfulness: number;
  
  // Content analysis
  textDensity: number;
  faceRegions: number;
  bubbleRegions: number;
  actionDensity: number;
  
  // Layout analysis
  gutterWidth: number;
  panelDensity: number;
  layoutType: 'grid' | 'vertical' | 'mixed' | 'freeform';
  
  // Quality indicators
  clarity: number;
  noise: number;
  compression: number;
}

export function analyzeImageCharacteristics(imageData: ImageData): ImageCharacteristics {
  const { width, height, data } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdge(gray);
  
  // Brightness analysis
  let totalBrightness = 0;
  for (let i = 0; i < gray.data.length; i++) {
    totalBrightness += gray.data[i];
  }
  const brightness = totalBrightness / gray.data.length;
  
  // Contrast analysis (standard deviation)
  let variance = 0;
  for (let i = 0; i < gray.data.length; i++) {
    variance += (gray.data[i] - brightness) ** 2;
  }
  const contrast = Math.sqrt(variance / gray.data.length);
  
  // Edge density
  let edgeCount = 0;
  const edgeThreshold = 50;
  for (let i = 0; i < edges.magnitude.length; i++) {
    if (edges.magnitude[i] > edgeThreshold) edgeCount++;
  }
  const edgeDensity = edgeCount / edges.magnitude.length;
  
  // Colorfulness (using RGB variance)
  let colorVariance = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const avg = (r + g + b) / 3;
    colorVariance += ((r - avg) ** 2 + (g - avg) ** 2 + (b - avg) ** 2) / 3;
  }
  const colorfulness = Math.sqrt(colorVariance / (width * height));
  
  // Text density (high-frequency edges in small regions)
  const textDensity = analyzeTextDensity(gray, width, height);
  
  // Face regions (skin tone detection)
  const faceRegions = countFaceRegions(imageData);
  
  // Bubble regions (bright ellipses with borders)
  const bubbleRegions = countBubbleRegions(imageData);
  
  // Action density (diagonal edges, motion lines)
  const actionDensity = analyzeActionDensity(edges, width, height);
  
  // Gutter width estimation
  const gutterWidth = estimateGutterWidth(gray, width, height);
  
  // Panel density estimation
  const panelDensity = estimatePanelDensity(gray, width, height);
  
  // Layout type detection
  const layoutType = detectLayoutType(gray, width, height);
  
  // Quality indicators
  const clarity = analyzeClarity(edges, width, height);
  const noise = analyzeNoise(gray, width, height);
  const compression = analyzeCompressionArtifacts(gray, width, height);
  
  return {
    brightness,
    contrast,
    edgeDensity,
    colorfulness,
    textDensity,
    faceRegions,
    bubbleRegions,
    actionDensity,
    gutterWidth,
    panelDensity,
    layoutType,
    clarity,
    noise,
    compression,
  };
}

function analyzeTextDensity(gray: GrayscaleImage, width: number, height: number): number {
  const { data } = gray;
  const edges = sobelEdge(gray);
  
  // Text has high-frequency edges in small clusters
  let textPixels = 0;
  const blockSize = 8;
  
  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      let edgeCount = 0;
      let totalPixels = 0;
      
      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          if (edges.magnitude[y * width + x] > 80) edgeCount++;
          totalPixels++;
        }
      }
      
      // High edge density in small block = likely text
      if (edgeCount / totalPixels > 0.3) {
        textPixels += totalPixels;
      }
    }
  }
  
  return textPixels / (width * height);
}

function countFaceRegions(imageData: ImageData): number {
  const { width, height, data } = imageData;
  const skinMask = new Uint8Array(width * height);
  
  // YCbCr skin detection
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
    
    if (y > 60 && cb > 85 && cb < 135 && cr > 135 && cr < 180) {
      skinMask[i] = 255;
    }
  }
  
  const skinBin: BinaryImage = { data: skinMask, width, height };
  const components = connectedComponents(skinBin);
  
  // Filter for face-sized regions
  return components.filter(c => c.area > 500 && c.area < 50000).length;
}

function countBubbleRegions(imageData: ImageData): number {
  const { width, height, data } = imageData;
  const bubbleMask = new Uint8Array(width * height);
  
  // Detect bright regions with dark borders
  for (let y = 5; y < height - 5; y++) {
    for (let x = 5; x < width - 5; x++) {
      const idx = y * width + x;
      const r = data[idx * 4];
      const g = data[idx * 4 + 1];
      const b = data[idx * 4 + 2];
      const brightness = (r + g + b) / 3;
      
      if (brightness > 240) {
        // Check for dark border nearby
        let hasBorder = false;
        for (let dy = -5; dy <= 5; dy += 5) {
          for (let dx = -5; dx <= 5; dx += 5) {
            const nIdx = (y + dy) * width + (x + dx);
            const nr = data[nIdx * 4];
            const ng = data[nIdx * 4 + 1];
            const nb = data[nIdx * 4 + 2];
            if ((nr + ng + nb) / 3 < brightness - 80) {
              hasBorder = true;
              break;
            }
          }
          if (hasBorder) break;
        }
        
        if (hasBorder) bubbleMask[idx] = 255;
      }
    }
  }
  
  const bubbleBin: BinaryImage = { data: bubbleMask, width, height };
  const components = connectedComponents(bubbleBin);
  
  return components.filter(c => c.area > 200).length;
}

function analyzeActionDensity(edges: { magnitude: Float32Array; direction: Float32Array }, width: number, height: number): number {
  // Action scenes have many diagonal edges (motion lines)
  let diagonalEdges = 0;
  let totalEdges = 0;
  
  for (let i = 0; i < edges.magnitude.length; i++) {
    if (edges.magnitude[i] > 50) {
      totalEdges++;
      const angle = Math.abs(edges.direction[i] * 180 / Math.PI);
      // Diagonal angles: 30-60° or 120-150°
      if ((angle > 30 && angle < 60) || (angle > 120 && angle < 150)) {
        diagonalEdges++;
      }
    }
  }
  
  return totalEdges > 0 ? diagonalEdges / totalEdges : 0;
}

function estimateGutterWidth(gray: GrayscaleImage, width: number, height: number): number {
  const { data } = gray;
  
  // Find low-variance horizontal strips (gutters)
  const rowVariances: number[] = [];
  const blockSize = 10;
  
  for (let y = 0; y < height; y += blockSize) {
    let sum = 0, sumSq = 0, count = 0;
    
    for (let x = 0; x < width; x++) {
      const v = data[y * width + x];
      sum += v;
      sumSq += v * v;
      count++;
    }
    
    const mean = sum / count;
    const variance = (sumSq / count) - (mean * mean);
    rowVariances.push(variance);
  }
  
  // Find consecutive low-variance rows
  let maxGutterWidth = 0;
  let currentWidth = 0;
  const threshold = 200;
  
  for (const variance of rowVariances) {
    if (variance < threshold) {
      currentWidth += blockSize;
      maxGutterWidth = Math.max(maxGutterWidth, currentWidth);
    } else {
      currentWidth = 0;
    }
  }
  
  return maxGutterWidth;
}

function estimatePanelDensity(gray: GrayscaleImage, width: number, height: number): number {
  const edges = sobelEdge(gray);
  
  // Count distinct panel-like regions
  const edgeThreshold = 60;
  const edgeBin: BinaryImage = {
    data: new Uint8Array(width * height),
    width, height
  };
  
  for (let i = 0; i < edges.magnitude.length; i++) {
    edgeBin.data[i] = edges.magnitude[i] > edgeThreshold ? 255 : 0;
  }
  
  const components = connectedComponents(edgeBin);
  
  // Filter for panel-sized components
  const panelLike = components.filter(c => 
    c.width > 50 && c.height > 50 && c.area > 2500
  );
  
  return panelLike.length;
}

function detectLayoutType(gray: GrayscaleImage, width: number, height: number): 'grid' | 'vertical' | 'mixed' | 'freeform' {
  // Analyze gutter patterns
  const rowVariances: number[] = [];
  const colVariances: number[] = [];
  
  for (let y = 0; y < height; y += 10) {
    let sum = 0, sumSq = 0, count = 0;
    for (let x = 0; x < width; x++) {
      const v = gray.data[y * width + x];
      sum += v;
      sumSq += v * v;
      count++;
    }
    rowVariances.push((sumSq / count) - ((sum / count) ** 2));
  }
  
  for (let x = 0; x < width; x += 10) {
    let sum = 0, sumSq = 0, count = 0;
    for (let y = 0; y < height; y++) {
      const v = gray.data[y * width + x];
      sum += v;
      sumSq += v * v;
      count++;
    }
    colVariances.push((sumSq / count) - ((sum / count) ** 2));
  }
  
  // Count low-variance lines (gutters)
  const threshold = 200;
  const rowGutters = rowVariances.filter(v => v < threshold).length;
  const colGutters = colVariances.filter(v => v < threshold).length;
  
  const rowRatio = rowGutters / rowVariances.length;
  const colRatio = colGutters / colVariances.length;
  
  // Classify layout
  if (rowRatio > 0.3 && colRatio > 0.3) return 'grid';
  if (rowRatio > 0.3 && colRatio < 0.1) return 'vertical';
  if (rowRatio > 0.15 || colRatio > 0.15) return 'mixed';
  return 'freeform';
}

function analyzeClarity(edges: { magnitude: Float32Array }, width: number, height: number): number {
  // Sharp edges = high clarity
  let strongEdges = 0;
  for (let i = 0; i < edges.magnitude.length; i++) {
    if (edges.magnitude[i] > 100) strongEdges++;
  }
  return strongEdges / edges.magnitude.length;
}

function analyzeNoise(gray: GrayscaleImage, width: number, height: number): number {
  const { data } = gray;
  
  // High-frequency noise detection
  let noisePixels = 0;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = data[y * width + x];
      const neighbors = [
        data[(y-1) * width + x],
        data[(y+1) * width + x],
        data[y * width + (x-1)],
        data[y * width + (x+1)],
      ];
      
      const avg = neighbors.reduce((a, b) => a + b, 0) / 4;
      if (Math.abs(center - avg) > 30) noisePixels++;
    }
  }
  
  return noisePixels / (width * height);
}

function analyzeCompressionArtifacts(gray: GrayscaleImage, width: number, height: number): number {
  // Block-based artifacts (8x8 blocks)
  const { data } = gray;
  let blockVariance = 0;
  const blockSize = 8;
  let blockCount = 0;
  
  for (let by = 0; by < height - blockSize; by += blockSize) {
    for (let bx = 0; bx < width - blockSize; bx += blockSize) {
      let sum = 0, sumSq = 0, count = 0;
      
      for (let y = by; y < by + blockSize; y++) {
        for (let x = bx; x < bx + blockSize; x++) {
          const v = data[y * width + x];
          sum += v;
          sumSq += v * v;
          count++;
        }
      }
      
      const variance = (sumSq / count) - ((sum / count) ** 2);
      blockVariance += variance;
      blockCount++;
    }
  }
  
  // High block variance = compression artifacts
  return blockVariance / blockCount;
}

// ============ Adaptive Parameter Tuning ============

export function getAdaptiveOptions(
  baseOptions: DetectionOptions,
  characteristics: ImageCharacteristics
): DetectionOptions {
  const options = { ...baseOptions };
  
  // Adjust gutter sensitivity based on gutter width
  if (characteristics.gutterWidth > 20) {
    // Wide gutters = easier detection
    options.gutterSensitivity = Math.min(100, baseOptions.gutterSensitivity + 10);
  } else if (characteristics.gutterWidth < 10) {
    // Narrow gutters = harder detection
    options.gutterSensitivity = Math.max(0, baseOptions.gutterSensitivity - 10);
  }
  
  // Adjust protection strength based on content
  if (characteristics.faceRegions > 5 || characteristics.bubbleRegions > 10) {
    // Lots of faces/bubbles = increase protection
    options.protectionStrength = Math.min(100, baseOptions.protectionStrength + 15);
  }
  
  // Adjust edge sensitivity based on clarity
  if (characteristics.clarity > 0.1) {
    // Clear image = can use lower threshold
    options.edgeSensitivity = Math.max(0, baseOptions.edgeSensitivity - 10);
  } else if (characteristics.noise > 0.05) {
    // Noisy image = need higher threshold
    options.edgeSensitivity = Math.min(100, baseOptions.edgeSensitivity + 15);
  }
  
  // Adjust strategy based on layout
  if (characteristics.layoutType === 'vertical') {
    options.webtoonType = 'webtoon';
  } else if (characteristics.layoutType === 'grid') {
    options.webtoonType = 'manga';
  }
  
  // Enable/disable features based on image characteristics
  if (characteristics.actionDensity > 0.3) {
    // Action-heavy = enable diagonal detection
    options.detectDiagonal = true;
  }
  
  if (characteristics.panelDensity > 15) {
    // Many panels = disable expensive features for speed
    options.fastMode = true;
  }
  
  // Adjust based on compression artifacts
  if (characteristics.compression > 500) {
    // Heavy compression = more aggressive smoothing
    options.edgeSensitivity = Math.min(100, baseOptions.edgeSensitivity + 20);
  }
  
  return options;
}

// ============ Panel Content Classification ============

export interface PanelContent {
  type: 'dialogue' | 'action' | 'establishing' | 'close-up' | 'transition' | 'mixed';
  textDensity: number;
  faceCount: number;
  motionLines: number;
  brightness: number;
  confidence: number;
}

export function classifyPanelContent(
  panel: Panel,
  imageData: ImageData
): PanelContent {
  const { width, height, data } = imageData;
  const { x, y, width: pw, height: ph } = panel;
  
  // Extract panel region
  let textPixels = 0;
  let facePixels = 0;
  let motionPixels = 0;
  let totalBrightness = 0;
  let totalPixels = 0;
  
  const gray = new Float32Array(pw * ph);
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const idx = ((y + py) * width + (x + px)) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      gray[py * pw + px] = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += gray[py * pw + px];
      totalPixels++;
    }
  }
  
  const avgBrightness = totalBrightness / totalPixels;
  
  // Analyze edges for text and motion
  const edges = sobelEdge({ data: gray, width: pw, height: ph });
  
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const idx = py * pw + px;
      const mag = edges.magnitude[idx];
      const dir = edges.direction[idx];
      
      // Text: high-frequency edges in small clusters
      if (mag > 80) {
        // Check if surrounded by other edges (text cluster)
        let neighborEdges = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const ny = py + dy, nx = px + dx;
            if (ny >= 0 && ny < ph && nx >= 0 && nx < pw) {
              if (edges.magnitude[ny * pw + nx] > 80) neighborEdges++;
            }
          }
        }
        if (neighborEdges > 10) textPixels++;
      }
      
      // Motion: diagonal edges
      if (mag > 50) {
        const angle = Math.abs(dir * 180 / Math.PI);
        if ((angle > 30 && angle < 60) || (angle > 120 && angle < 150)) {
          motionPixels++;
        }
      }
      
      // Face: skin tone
      const imgIdx = ((y + py) * width + (x + px)) * 4;
      const r = data[imgIdx];
      const g = data[imgIdx + 1];
      const b = data[imgIdx + 2];
      const ycbcr = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
      
      if (ycbcr > 60 && cb > 85 && cb < 135 && cr > 135 && cr < 180) {
        facePixels++;
      }
    }
  }
  
  const textDensity = textPixels / totalPixels;
  const faceDensity = facePixels / totalPixels;
  const motionDensity = motionPixels / totalPixels;
  
  // Classify panel type
  let type: PanelContent['type'];
  let confidence = 0.5;
  
  if (textDensity > 0.15) {
    type = 'dialogue';
    confidence = 0.8;
  } else if (motionDensity > 0.2) {
    type = 'action';
    confidence = 0.75;
  } else if (faceDensity > 0.3 && pw < width * 0.4) {
    type = 'close-up';
    confidence = 0.7;
  } else if (avgBrightness > 180 && textDensity < 0.05) {
    type = 'establishing';
    confidence = 0.65;
  } else if (pw > width * 0.8 && ph < height * 0.2) {
    type = 'transition';
    confidence = 0.6;
  } else {
    type = 'mixed';
    confidence = 0.5;
  }
  
  return {
    type,
    textDensity,
    faceCount: Math.round(faceDensity * 10),
    motionLines: Math.round(motionDensity * 100),
    brightness: avgBrightness,
    confidence,
  };
}

// ============ Quality Scoring ============

export interface DetectionQuality {
  overallScore: number; // 0-100
  precision: number; // Estimated precision
  recall: number; // Estimated recall
  issues: string[];
  suggestions: string[];
}

export function scoreDetectionQuality(
  panels: Panel[],
  imageData: ImageData,
  characteristics: ImageCharacteristics
): DetectionQuality {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  let precision = 0.85; // Base precision
  let recall = 0.80; // Base recall
  
  // Check for potential issues
  const totalArea = imageData.width * imageData.height;
  const panelArea = panels.reduce((sum, p) => sum + p.width * p.height, 0);
  const coverageRatio = panelArea / totalArea;
  
  // Too much coverage = might be merging panels
  if (coverageRatio > 0.9) {
    issues.push('High panel coverage - may be merging distinct panels');
    suggestions.push('Try lowering merge threshold');
    precision -= 0.1;
  }
  
  // Too little coverage = might be missing panels
  if (coverageRatio < 0.3) {
    issues.push('Low panel coverage - may be missing panels');
    suggestions.push('Try increasing gutter sensitivity');
    recall -= 0.15;
  }
  
  // Check for very large panels
  const largePanels = panels.filter(p => p.width * p.height > totalArea * 0.5);
  if (largePanels.length > 0) {
    issues.push(`${largePanels.length} very large panel(s) detected`);
    suggestions.push('Check if large panels should be split');
    precision -= 0.05;
  }
  
  // Check for very small panels
  const smallPanels = panels.filter(p => p.width * p.height < totalArea * 0.01);
  if (smallPanels.length > 3) {
    issues.push(`${smallPanels.length} very small panel(s) detected`);
    suggestions.push('Consider increasing minimum panel size');
    precision -= 0.05;
  }
  
  // Adjust for image quality
  if (characteristics.noise > 0.1) {
    issues.push('High image noise detected');
    suggestions.push('Increase edge sensitivity for noisy images');
    precision -= 0.1;
    recall -= 0.1;
  }
  
  if (characteristics.compression > 500) {
    issues.push('Heavy compression artifacts detected');
    suggestions.push('Use higher quality source images if possible');
    precision -= 0.05;
  }
  
  // Calculate overall score
  const overallScore = Math.round((precision + recall) / 2 * 100);
  
  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    precision: Math.max(0, Math.min(1, precision)),
    recall: Math.max(0, Math.min(1, recall)),
    issues,
    suggestions,
  };
}
