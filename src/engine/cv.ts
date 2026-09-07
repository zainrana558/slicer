/**
 * Advanced Computer Vision Pipeline for Panel Detection
 * 
 * Multi-pass detection using:
 * 1. Multi-scale feature pyramids
 * 2. SLIC superpixels for boundary-adherent regions
 * 3. Watershed segmentation with morphological gradient
 * 4. Active contours for boundary refinement
 * 5. Texture analysis (LBP) for distinguishing gutters
 * 6. MSER for text/bubble detection
 * 7. RANSAC for diagonal line detection
 * 8. Distance transform for gutter analysis
 * 9. Adaptive thresholding
 * 10. Graph-based panel relationship analysis
 */

import { Rect, Panel, DetectionOptions, PanelType } from './types';
import {
  GrayscaleImage,
  BinaryImage,
  imageDataToGrayscale,
  boxBlur,
  gaussianBlur,
  sobelEdge,
  morphologicalGradient,
  adaptiveThreshold,
  morphDilate,
  morphErode,
  morphOpen,
  morphClose,
  distanceTransform,
  watershed,
  slicSuperpixels,
  connectedComponents,
  localBinaryPattern,
  lbpHistogram,
  ransacLineFit,
  buildFeaturePyramid,
  rowProjection,
  colProjection,
  activeContour,
  detectMSER,
  otsuThreshold,
} from './imageProcessing';

// ============ Content Protection ============

export interface ProtectionMask {
  data: Uint8Array;
  width: number;
  height: number;
  faceRegions: Rect[];
  textRegions: Rect[];
  bubbleRegions: Rect[];
}

export function buildProtectionMask(
  imageData: ImageData,
  options: DetectionOptions
): ProtectionMask {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  const faceRegions: Rect[] = [];
  const textRegions: Rect[] = [];
  const bubbleRegions: Rect[] = [];
  
  // Detect skin tones (faces) using YCbCr
  if (options.protectFaces) {
    const skinMask = new Uint8Array(width * height);
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
    
    // Find face regions using connected components
    const skinBin: BinaryImage = { data: skinMask, width, height };
    const skinComps = connectedComponents(skinBin);
    
    for (const comp of skinComps) {
      if (comp.area > 500 && comp.pixels / comp.area > 0.3) {
        // Likely a face
        const aspectRatio = comp.width / comp.height;
        if (aspectRatio > 0.5 && aspectRatio < 2.0) {
          faceRegions.push({
            x: comp.x,
            y: comp.y,
            width: comp.width,
            height: comp.height,
          });
          
          // Mark in protection mask
          for (let py = comp.y; py < comp.y + comp.height; py++) {
            for (let px = comp.x; px < comp.x + comp.width; px++) {
              if (skinMask[py * width + px] > 0) {
                mask[py * width + px] = 255;
              }
            }
          }
        }
      }
    }
  }
  
  // Detect text using MSER (Maximally Stable Extremal Regions)
  if (options.protectText) {
    const gray = imageDataToGrayscale(imageData);
    const blurred = boxBlur(gray, 1);
    
    const mserRegions = detectMSER(blurred, 30, 5000, 5);
    
    for (const region of mserRegions) {
      const aspectRatio = region.width / region.height;
      // Text characters are typically small and have specific aspect ratios
      if (region.area > 30 && region.area < 3000 && aspectRatio > 0.2 && aspectRatio < 5) {
        textRegions.push({
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
        });
        
        // Mark in protection mask
        for (let py = region.y; py < region.y + region.height; py++) {
          for (let px = region.x; px < region.x + region.width; px++) {
            if (px >= 0 && px < width && py >= 0 && py < height) {
              mask[py * width + px] = 255;
            }
          }
        }
      }
    }
  }
  
  // Detect speech bubbles using contour analysis
  if (options.protectBubbles) {
    const gray = imageDataToGrayscale(imageData);
    const edges = sobelEdge(gray);
    const thresh = otsuThreshold(edges.magnitude);
    const edgeBin: BinaryImage = {
      data: new Uint8Array(width * height),
      width, height
    };
    for (let i = 0; i < width * height; i++) {
      edgeBin.data[i] = edges.magnitude[i] > thresh ? 255 : 0;
    }
    
    // Find closed contours (potential bubbles)
    const closed = morphClose(edgeBin, 3);
    const bubbleComps = connectedComponents(closed);
    
    for (const comp of bubbleComps) {
      // Speech bubbles are typically:
      // - Large enough
      // - Roughly circular/oval
      // - Have high fill ratio (white interior)
      if (comp.area > 1000 && comp.pixels / comp.area > 0.5) {
        const aspectRatio = comp.width / comp.height;
        if (aspectRatio > 0.5 && aspectRatio < 2.5) {
          // Check if interior is bright (white bubble)
          let brightPixels = 0;
          const cx = comp.x + comp.width / 2;
          const cy = comp.y + comp.height / 2;
          const sampleRadius = Math.min(comp.width, comp.height) / 4;
          
          for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
            for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
              const px = Math.round(cx + dx);
              const py = Math.round(cy + dy);
              if (px >= 0 && px < width && py >= 0 && py < height) {
                const idx = (py * width + px) * 4;
                const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                if (brightness > 200) brightPixels++;
              }
            }
          }
          
          if (brightPixels > sampleRadius * sampleRadius) {
            bubbleRegions.push({
              x: comp.x,
              y: comp.y,
              width: comp.width,
              height: comp.height,
            });
            
            // Mark in protection mask
            for (let py = comp.y; py < comp.y + comp.height; py++) {
              for (let px = comp.x; px < comp.x + comp.width; px++) {
                mask[py * width + px] = 255;
              }
            }
          }
        }
      }
    }
  }
  
  // Dilate the mask to create protection zones
  const strength = options.protectionStrength / 100;
  const dilateRadius = Math.max(1, Math.round(strength * 20));
  const binMask: BinaryImage = { data: mask, width, height };
  const dilated = morphDilate(binMask, dilateRadius);
  
  return {
    data: dilated.data,
    width,
    height,
    faceRegions,
    textRegions,
    bubbleRegions,
  };
}

function doesCutIntersectContent(
  mask: ProtectionMask,
  isHorizontal: boolean,
  position: number,
  start: number,
  end: number
): boolean {
  const { data, width, height } = mask;
  let intersections = 0;
  const total = end - start;
  
  if (isHorizontal) {
    for (let x = start; x < end; x++) {
      if (data[position * width + x] > 0) intersections++;
    }
  } else {
    for (let y = start; y < end; y++) {
      if (data[y * width + position] > 0) intersections++;
    }
  }
  
  return (intersections / total) > 0.1;
}

// ============ Multi-Scale Gutter Detection ============

function detectGuttersMultiScale(
  gray: GrayscaleImage,
  options: DetectionOptions
): { rowGutters: number[]; colGutters: number[] } {
  const { width, height } = gray;
  
  // Build feature pyramid
  const pyramid = buildFeaturePyramid(gray, 4);
  
  // Detect gutters at each scale
  const allRowGutters: Set<number> = new Set();
  const allColGutters: Set<number> = new Set();
  
  for (let level = 0; level < pyramid.length; level++) {
    const scale = pyramid[level];
    const scaleRatio = width / scale.width;
    
    // Compute variance map for gutter detection
    const varianceMap = computeVarianceMap(scale, 8);
    
    // Threshold to find low-variance (gutter) regions
    const gutterThresh = 200 - options.gutterSensitivity * 1.5;
    const gutterBin: BinaryImage = {
      data: new Uint8Array(scale.width * scale.height),
      width: scale.width,
      height: scale.height,
    };
    
    for (let i = 0; i < varianceMap.length; i++) {
      gutterBin.data[i] = varianceMap[i] < gutterThresh ? 255 : 0;
    }
    
    // Project to find gutters
    const rowProj = rowProjection(gutterBin);
    const colProj = colProjection(gutterBin);
    
    // Find gutter positions
    const minGap = Math.max(2, Math.round(options.minPanelHeight * 0.02 / scaleRatio));
    const maxGap = Math.round(Math.min(scale.width, scale.height) * 0.15);
    
    const rowG = findGuttersInProjection(rowProj, scale.height, options.gutterSensitivity, minGap, maxGap);
    const colG = findGuttersInProjection(colProj, scale.width, options.gutterSensitivity, minGap, maxGap);
    
    // Scale back to original coordinates
    for (const g of rowG) allRowGutters.add(Math.round(g * scaleRatio));
    for (const g of colG) allColGutters.add(Math.round(g * scaleRatio));
  }
  
  // Merge gutters from different scales
  const mergedRowGutters = mergeCloseValues(Array.from(allRowGutters), 10);
  const mergedColGutters = mergeCloseValues(Array.from(allColGutters), 10);
  
  return { rowGutters: mergedRowGutters, colGutters: mergedColGutters };
}

function computeVarianceMap(gray: GrayscaleImage, blockSize: number): Float32Array {
  const { data, width, height } = gray;
  const variance = new Float32Array(width * height);
  
  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      let sum = 0, sumSq = 0, count = 0;
      
      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          const v = data[y * width + x];
          sum += v;
          sumSq += v * v;
          count++;
        }
      }
      
      const mean = sum / count;
      const v = (sumSq / count) - (mean * mean);
      
      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          variance[y * width + x] = v;
        }
      }
    }
  }
  
  return variance;
}

function findGuttersInProjection(
  projection: Float32Array,
  length: number,
  sensitivity: number,
  minGap: number,
  maxGap: number
): number[] {
  const gutters: number[] = [];
  const threshold = 1.0 - (sensitivity / 100) * 0.3;
  
  // Smooth projection
  const smoothed = new Float32Array(length);
  const kernelSize = 3;
  for (let i = 0; i < length; i++) {
    let sum = 0, count = 0;
    for (let j = -kernelSize; j <= kernelSize; j++) {
      const idx = Math.max(0, Math.min(length - 1, i + j));
      sum += projection[idx];
      count++;
    }
    smoothed[i] = sum / count;
  }
  
  // Find valleys
  let inGutter = false;
  let gutterStart = 0;
  
  for (let i = 0; i < length; i++) {
    if (smoothed[i] < threshold) {
      if (!inGutter) {
        gutterStart = i;
        inGutter = true;
      }
    } else {
      if (inGutter) {
        const gutterWidth = i - gutterStart;
        if (gutterWidth >= minGap && gutterWidth <= maxGap) {
          gutters.push(Math.floor((gutterStart + i) / 2));
        }
        inGutter = false;
      }
    }
  }
  
  return gutters;
}

function mergeCloseValues(values: number[], minDistance: number): number[] {
  if (values.length === 0) return [];
  
  const sorted = [...values].sort((a, b) => a - b);
  const merged: number[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - merged[merged.length - 1] > minDistance) {
      merged.push(sorted[i]);
    } else {
      // Average with previous
      merged[merged.length - 1] = Math.round((merged[merged.length - 1] + sorted[i]) / 2);
    }
  }
  
  return merged;
}

// ============ Watershed-Based Panel Detection ============

function detectPanelsWatershed(
  imageData: ImageData,
  options: DetectionOptions
): Panel[] {
  const { width, height } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const blurred = gaussianBlur(gray, 1.5);
  
  // Compute morphological gradient
  const gradient = morphologicalGradient(blurred, 2);
  
  // Find markers (seeds) for watershed
  // Use distance transform on thresholded image
  const thresh = otsuThreshold(gradient);
  const markers = new Int32Array(width * height);
  let nextMarker = 1;
  
  // Find local minima as seeds
  const localMinRadius = 5;
  for (let y = localMinRadius; y < height - localMinRadius; y++) {
    for (let x = localMinRadius; x < width - localMinRadius; x++) {
      const idx = y * width + x;
      const val = gradient[idx];
      
      if (val < thresh * 0.5) {
        let isMin = true;
        for (let dy = -localMinRadius; dy <= localMinRadius; dy++) {
          for (let dx = -localMinRadius; dx <= localMinRadius; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = (y + dy) * width + (x + dx);
            if (gradient[nIdx] < val) {
              isMin = false;
              break;
            }
          }
          if (!isMin) break;
        }
        
        if (isMin) {
          markers[idx] = nextMarker++;
        }
      }
    }
  }
  
  // Run watershed
  const labels = watershed(gradient, markers, width, height);
  
  // Convert labels to panels
  const panelMap = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; pixels: number }>();
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (label <= 0) continue;
      
      let panel = panelMap.get(label);
      if (!panel) {
        panel = { minX: x, minY: y, maxX: x, maxY: y, pixels: 0 };
        panelMap.set(label, panel);
      }
      panel.minX = Math.min(panel.minX, x);
      panel.minY = Math.min(panel.minY, y);
      panel.maxX = Math.max(panel.maxX, x);
      panel.maxY = Math.max(panel.maxY, y);
      panel.pixels++;
    }
  }
  
  // Convert to panels
  const panels: Panel[] = [];
  for (const [id, panel] of panelMap) {
    const w = panel.maxX - panel.minX + 1;
    const h = panel.maxY - panel.minY + 1;
    const area = w * h;
    
    if (w >= options.minPanelWidth && h >= options.minPanelHeight) {
      const fillRatio = panel.pixels / area;
      if (fillRatio > 0.5) {
        panels.push({
          id: `watershed-${id}`,
          x: panel.minX,
          y: panel.minY,
          width: w,
          height: h,
          confidence: fillRatio * 0.7,
          type: 'standard',
        });
      }
    }
  }
  
  return panels;
}

// ============ Superpixel-Based Detection ============

function detectPanelsSuperpixels(
  imageData: ImageData,
  options: DetectionOptions
): Panel[] {
  const { width, height } = imageData;
  
  // Generate superpixels
  const numSuperpixels = Math.round((width * height) / (100 * 100)); // ~100x100 pixel superpixels
  const { labels, superpixels } = slicSuperpixels(imageData, numSuperpixels, 10, 10);
  
  // Group superpixels into panels based on adjacency and similarity
  // Build adjacency graph
  const adjacency = new Map<number, Set<number>>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (!adjacency.has(label)) adjacency.set(label, new Set());
      
      // Check right neighbor
      if (x < width - 1) {
        const rightLabel = labels[y * width + x + 1];
        if (rightLabel !== label) {
          adjacency.get(label)!.add(rightLabel);
          if (!adjacency.has(rightLabel)) adjacency.set(rightLabel, new Set());
          adjacency.get(rightLabel)!.add(label);
        }
      }
      
      // Check bottom neighbor
      if (y < height - 1) {
        const bottomLabel = labels[(y + 1) * width + x];
        if (bottomLabel !== label) {
          adjacency.get(label)!.add(bottomLabel);
          if (!adjacency.has(bottomLabel)) adjacency.set(bottomLabel, new Set());
          adjacency.get(bottomLabel)!.add(label);
        }
      }
    }
  }
  
  // Find panel candidates by merging adjacent superpixels
  // Use texture analysis to determine which superpixels belong to the same panel
  const gray = imageDataToGrayscale(imageData);
  const lbp = localBinaryPattern(gray);
  
  // Compute LBP histogram for each superpixel
  const spHistograms = new Map<number, Float32Array>();
  for (const sp of superpixels) {
    const hist = lbpHistogram(lbp, sp.centerX - 25, sp.centerY - 25, 50, 50, width);
    spHistograms.set(sp.id, hist);
  }
  
  // Merge superpixels with similar texture
  const merged = new Map<number, Set<number>>();
  const visited = new Set<number>();
  
  for (const sp of superpixels) {
    if (visited.has(sp.id)) continue;
    
    const group = new Set<number>([sp.id]);
    visited.add(sp.id);
    
    const stack = [sp.id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      
      const currentHist = spHistograms.get(current);
      if (!currentHist) continue;
      
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        
        const neighborHist = spHistograms.get(neighbor);
        if (!neighborHist) continue;
        
        // Compare histograms (chi-squared distance)
        let chiSquared = 0;
        for (let i = 0; i < 256; i++) {
          const sum = currentHist[i] + neighborHist[i];
          if (sum > 0) {
            chiSquared += (currentHist[i] - neighborHist[i]) ** 2 / sum;
          }
        }
        
        if (chiSquared < 0.5) { // Similar texture
          group.add(neighbor);
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    
    merged.set(sp.id, group);
  }
  
  // Convert merged groups to panels
  const panels: Panel[] = [];
  for (const [seedId, group] of merged) {
    let minX = width, minY = height, maxX = 0, maxY = 0;
    
    for (const spId of group) {
      const sp = superpixels.find(s => s.id === spId);
      if (sp) {
        minX = Math.min(minX, sp.centerX - 25);
        minY = Math.min(minY, sp.centerY - 25);
        maxX = Math.max(maxX, sp.centerX + 25);
        maxY = Math.max(maxY, sp.centerY + 25);
      }
    }
    
    const w = maxX - minX;
    const h = maxY - minY;
    
    if (w >= options.minPanelWidth && h >= options.minPanelHeight) {
      panels.push({
        id: `superpixel-${seedId}`,
        x: Math.max(0, minX),
        y: Math.max(0, minY),
        width: Math.min(w, width - minX),
        height: Math.min(h, height - minY),
        confidence: 0.6,
        type: 'standard',
      });
    }
  }
  
  return panels;
}

// ============ Diagonal Panel Detection ============

function detectDiagonalPanels(
  imageData: ImageData,
  options: DetectionOptions
): Panel[] {
  const { width, height, data } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdge(gray);
  
  // Find edge points
  const edgePoints: Array<{ x: number; y: number }> = [];
  const edgeThreshold = 80;
  
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (edges.magnitude[y * width + x] > edgeThreshold) {
        edgePoints.push({ x, y });
      }
    }
  }
  
  // Use RANSAC to find lines
  const lines = ransacLineFit(edgePoints, 200, 5);
  
  // Find pairs of parallel lines that could form diagonal panels
  const panels: Panel[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const angleDiff = Math.abs(lines[i].angle - lines[j].angle);
      
      if (angleDiff < 0.2 || Math.abs(angleDiff - Math.PI) < 0.2) {
        // Parallel lines found
        const angle = (lines[i].angle + lines[j].angle) / 2;
        const angleDeg = (angle * 180) / Math.PI;
        
        // Only consider significant diagonal angles
        if (angleDeg > 15 && angleDeg < 165 && Math.abs(angleDeg - 90) > 15) {
          // Estimate panel bounds
          const panel = estimateDiagonalPanelBounds(lines[i], lines[j], width, height);
          
          if (panel && panel.width >= options.minPanelWidth && panel.height >= options.minPanelHeight) {
            panels.push({
              ...panel,
              id: `diagonal-${panels.length}`,
              confidence: 0.65,
              type: 'diagonal',
              angle: angleDeg,
            });
          }
        }
      }
    }
  }
  
  return panels;
}

function estimateDiagonalPanelBounds(
  line1: { angle: number; rho: number },
  line2: { angle: number; rho: number },
  width: number,
  height: number
): Rect | null {
  // Convert Hough lines to endpoints
  const points: Array<{ x: number; y: number }> = [];
  
  for (const line of [line1, line2]) {
    const cos = Math.cos(line.angle);
    const sin = Math.sin(line.angle);
    
    // Find intersection with image boundaries
    if (Math.abs(sin) > 0.01) {
      const y0 = (line.rho - 0 * cos) / sin;
      const y1 = (line.rho - width * cos) / sin;
      if (y0 >= 0 && y0 < height) points.push({ x: 0, y: y0 });
      if (y1 >= 0 && y1 < height) points.push({ x: width, y: y1 });
    }
    if (Math.abs(cos) > 0.01) {
      const x0 = (line.rho - 0 * sin) / cos;
      const x1 = (line.rho - height * sin) / cos;
      if (x0 >= 0 && x0 < width) points.push({ x: x0, y: 0 });
      if (x1 >= 0 && x1 < width) points.push({ x: x1, y: height });
    }
  }
  
  if (points.length < 3) return null;
  
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  
  return {
    x: Math.round(Math.max(0, Math.min(...xs))),
    y: Math.round(Math.max(0, Math.min(...ys))),
    width: Math.round(Math.min(width, Math.max(...xs)) - Math.max(0, Math.min(...xs))),
    height: Math.round(Math.min(height, Math.max(...ys)) - Math.max(0, Math.min(...ys))),
  };
}

// ============ Active Contour Refinement ============

function refinePanelBoundaries(
  panel: Panel,
  imageData: ImageData
): Panel {
  const { width, height } = imageData;
  const gray = imageDataToGrayscale(imageData);
  
  // Create initial contour from panel rectangle
  const margin = 5;
  const contour = [
    { x: panel.x - margin, y: panel.y - margin },
    { x: panel.x + panel.width + margin, y: panel.y - margin },
    { x: panel.x + panel.width + margin, y: panel.y + panel.height + margin },
    { x: panel.x - margin, y: panel.y + panel.height + margin },
  ];
  
  // Add more points for smoother contour
  const refinedContour: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < contour.length; i++) {
    const curr = contour[i];
    const next = contour[(i + 1) % contour.length];
    
    refinedContour.push(curr);
    
    // Add intermediate points
    const steps = 5;
    for (let s = 1; s < steps; s++) {
      refinedContour.push({
        x: curr.x + (next.x - curr.x) * (s / steps),
        y: curr.y + (next.y - curr.y) * (s / steps),
      });
    }
  }
  
  // Run active contour
  const finalContour = activeContour(gray, refinedContour, 0.1, 0.1, 1.0, 50);
  
  // Compute bounding box of refined contour
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (const p of finalContour) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  
  return {
    ...panel,
    x: Math.max(0, Math.round(minX)),
    y: Math.max(0, Math.round(minY)),
    width: Math.min(width - minX, Math.round(maxX - minX)),
    height: Math.min(height - minY, Math.round(maxY - minY)),
    boundary: finalContour,
  };
}

// ============ Graph-Based Boundary Refinement ============

function refineBoundariesWithGraphCut(
  panels: Panel[],
  imageData: ImageData,
  options: DetectionOptions
): Panel[] {
  const { width, height } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdge(gray);
  
  return panels.map(panel => {
    // For each panel boundary, try to snap to nearby strong edges
    const snapDistance = 10;
    let { x, y, width: w, height: h } = panel;
    
    // Try to snap left edge
    for (let dx = -snapDistance; dx <= snapDistance; dx++) {
      const testX = x + dx;
      if (testX < 0 || testX >= width) continue;
      
      let edgeStrength = 0;
      for (let dy = 0; dy < h; dy += 5) {
        edgeStrength += edges.magnitude[(y + dy) * width + testX];
      }
      
      if (edgeStrength > edges.magnitude[y * width + x] * 1.2) {
        x = testX;
        break;
      }
    }
    
    // Try to snap right edge
    for (let dx = -snapDistance; dx <= snapDistance; dx++) {
      const testX = x + w + dx;
      if (testX < 0 || testX >= width) continue;
      
      let edgeStrength = 0;
      for (let dy = 0; dy < h; dy += 5) {
        edgeStrength += edges.magnitude[(y + dy) * width + testX];
      }
      
      if (edgeStrength > edges.magnitude[y * width + (x + w)] * 1.2) {
        w = testX - x;
        break;
      }
    }
    
    // Try to snap top edge
    for (let dy = -snapDistance; dy <= snapDistance; dy++) {
      const testY = y + dy;
      if (testY < 0 || testY >= height) continue;
      
      let edgeStrength = 0;
      for (let dx = 0; dx < w; dx += 5) {
        edgeStrength += edges.magnitude[testY * width + (x + dx)];
      }
      
      if (edgeStrength > edges.magnitude[y * width + x] * 1.2) {
        y = testY;
        break;
      }
    }
    
    // Try to snap bottom edge
    for (let dy = -snapDistance; dy <= snapDistance; dy++) {
      const testY = y + h + dy;
      if (testY < 0 || testY >= height) continue;
      
      let edgeStrength = 0;
      for (let dx = 0; dx < w; dx += 5) {
        edgeStrength += edges.magnitude[testY * width + (x + dx)];
      }
      
      if (edgeStrength > edges.magnitude[(y + h) * width + x] * 1.2) {
        h = testY - y;
        break;
      }
    }
    
    return { ...panel, x, y, width: w, height: h };
  });
}

// ============ Hierarchical Panel Detection ============

function detectHierarchicalPanels(
  imageData: ImageData,
  options: DetectionOptions
): Panel[] {
  const { width, height } = imageData;
  const allPanels: Panel[] = [];
  
  // First pass: detect large panels
  const largePanelOptions = {
    ...options,
    minPanelWidth: Math.max(options.minPanelWidth, width * 0.3),
    minPanelHeight: Math.max(options.minPanelHeight, height * 0.2),
  };
  
  const largePanels = detectPanelsWatershed(imageData, largePanelOptions);
  allPanels.push(...largePanels);
  
  // Second pass: detect smaller panels within gaps
  for (const largePanel of largePanels) {
    // Check if this large panel contains smaller sub-panels
    const subPanelRegion = extractRegion(imageData, largePanel);
    const subPanels = detectPanelsWatershed(subPanelRegion, {
      ...options,
      minPanelWidth: options.minPanelWidth,
      minPanelHeight: options.minPanelHeight,
    });
    
    // If we found sub-panels, replace the large panel with them
    if (subPanels.length > 1) {
      // Remove the large panel
      const idx = allPanels.indexOf(largePanel);
      if (idx >= 0) allPanels.splice(idx, 1);
      
      // Add sub-panels with offset
      for (const subPanel of subPanels) {
        allPanels.push({
          ...subPanel,
          x: subPanel.x + largePanel.x,
          y: subPanel.y + largePanel.y,
          id: `sub-${subPanel.id}`,
          type: 'inset',
        });
      }
    }
  }
  
  return allPanels;
}

function extractRegion(imageData: ImageData, region: Rect): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = region.width;
  canvas.height = region.height;
  const ctx = canvas.getContext('2d')!;
  
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = imageData.width;
  srcCanvas.height = imageData.height;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.putImageData(imageData, 0, 0);
  
  ctx.drawImage(
    srcCanvas,
    region.x, region.y, region.width, region.height,
    0, 0, region.width, region.height
  );
  
  return ctx.getImageData(0, 0, region.width, region.height);
}

// ============ Improved Borderless Panel Detection ============

function detectBorderlessPanels(
  imageData: ImageData,
  options: DetectionOptions
): Panel[] {
  const { width, height, data } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdge(gray);
  
  const panels: Panel[] = [];
  
  // Look for regions with content but weak borders
  const blockSize = 50;
  const edgeThreshold = 30;
  
  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      const bw = Math.min(blockSize, width - bx);
      const bh = Math.min(blockSize, height - by);
      
      // Compute edge density in this block
      let edgeSum = 0;
      let contentPixels = 0;
      
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const idx = y * width + x;
          edgeSum += edges.magnitude[idx];
          
          const r = data[idx * 4];
          const g = data[idx * 4 + 1];
          const b = data[idx * 4 + 2];
          const brightness = (r + g + b) / 3;
          
          if (brightness > 20 && brightness < 240) {
            contentPixels++;
          }
        }
      }
      
      const avgEdge = edgeSum / (bw * bh);
      const contentRatio = contentPixels / (bw * bh);
      
      // If there's content but low edge density, it might be borderless
      if (contentRatio > 0.3 && avgEdge < edgeThreshold) {
        // Expand to find full borderless panel
        const expandedPanel = expandBorderlessPanel(imageData, bx, by, bw, bh, options);
        if (expandedPanel) {
          panels.push({
            ...expandedPanel,
            id: `borderless-${panels.length}`,
            confidence: 0.6,
            type: 'borderless',
          });
        }
      }
    }
  }
  
  return panels;
}

function expandBorderlessPanel(
  imageData: ImageData,
  startX: number,
  startY: number,
  startW: number,
  startH: number,
  options: DetectionOptions
): Rect | null {
  const { width, height } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdge(gray);
  
  let x = startX, y = startY, w = startW, h = startH;
  
  // Expand in each direction until we hit a strong edge or boundary
  const edgeThreshold = 50;
  const maxExpand = 100;
  
  // Expand left
  for (let dx = 0; dx < maxExpand && x > 0; dx++) {
    let edgeStrength = 0;
    for (let dy = 0; dy < h; dy += 5) {
      edgeStrength += edges.magnitude[(y + dy) * width + (x - 1)];
    }
    if (edgeStrength / (h / 5) > edgeThreshold) break;
    x--;
    w++;
  }
  
  // Expand right
  for (let dx = 0; dx < maxExpand && x + w < width; dx++) {
    let edgeStrength = 0;
    for (let dy = 0; dy < h; dy += 5) {
      edgeStrength += edges.magnitude[(y + dy) * width + (x + w)];
    }
    if (edgeStrength / (h / 5) > edgeThreshold) break;
    w++;
  }
  
  // Expand top
  for (let dy = 0; dy < maxExpand && y > 0; dy++) {
    let edgeStrength = 0;
    for (let dx = 0; dx < w; dx += 5) {
      edgeStrength += edges.magnitude[(y - 1) * width + (x + dx)];
    }
    if (edgeStrength / (w / 5) > edgeThreshold) break;
    y--;
    h++;
  }
  
  // Expand bottom
  for (let dy = 0; dy < maxExpand && y + h < height; dy++) {
    let edgeStrength = 0;
    for (let dx = 0; dx < w; dx += 5) {
      edgeStrength += edges.magnitude[(y + h) * width + (x + dx)];
    }
    if (edgeStrength / (w / 5) > edgeThreshold) break;
    h++;
  }
  
  if (w >= options.minPanelWidth && h >= options.minPanelHeight) {
    return { x, y, width: w, height: h };
  }
  
  return null;
}

// ============ Main Detection Pipeline ============

export function detectPanelsCV(imageData: ImageData, options: DetectionOptions): Panel[] {
  const { width, height } = imageData;
  const techniquesUsed: string[] = [];
  
  // Step 1: Multi-scale gutter detection
  const gray = imageDataToGrayscale(imageData);
  const { rowGutters, colGutters } = detectGuttersMultiScale(gray, options);
  techniquesUsed.push('multi-scale-gutters');
  
  // Step 2: Build protection mask
  const protectionMask = buildProtectionMask(imageData, options);
  techniquesUsed.push('content-protection');
  
  // Step 3: Create initial panel candidates from gutters
  const yBands = [0, ...rowGutters, height];
  const xBands = [0, ...colGutters, width];
  
  const gutterPanels: Panel[] = [];
  for (let i = 0; i < yBands.length - 1; i++) {
    for (let j = 0; j < xBands.length - 1; j++) {
      const y = yBands[i];
      const h = yBands[i + 1] - y;
      const x = xBands[j];
      const w = xBands[j + 1] - x;
      
      if (w >= options.minPanelWidth && h >= options.minPanelHeight) {
        // Check if cut intersects protected content
        const cutSafe = !doesCutIntersectContent(protectionMask, true, y, x, x + w) &&
                       !doesCutIntersectContent(protectionMask, false, x, y, y + h);
        
        if (cutSafe || options.protectionStrength < 30) {
          gutterPanels.push({
            id: `gutter-${gutterPanels.length}`,
            x, y, width: w, height: h,
            confidence: 0.7,
            type: classifyPanelType(imageData, x, y, w, h, options),
          });
        }
      }
    }
  }
  
  // Step 4: Watershed detection (if enabled, skip in fast mode)
  let watershedPanels: Panel[] = [];
  if (options.useWatershed && !options.fastMode) {
    watershedPanels = detectPanelsWatershed(imageData, options);
    techniquesUsed.push('watershed');
  }
  
  // Step 5: Superpixel detection (if enabled, skip in fast mode)
  let superpixelPanels: Panel[] = [];
  if (options.useSuperpixels && !options.fastMode) {
    superpixelPanels = detectPanelsSuperpixels(imageData, options);
    techniquesUsed.push('superpixels');
  }
  
  // Step 6: Diagonal panel detection (if enabled)
  let diagonalPanels: Panel[] = [];
  if (options.detectDiagonal) {
    diagonalPanels = detectDiagonalPanels(imageData, options);
    techniquesUsed.push('diagonal-ransac');
  }
  
  // Step 7: Borderless panel detection (if enabled, skip in fast mode)
  let borderlessPanels: Panel[] = [];
  if (options.detectBorderless && !options.fastMode) {
    borderlessPanels = detectBorderlessPanels(imageData, options);
    techniquesUsed.push('borderless-detection');
  }
  
  // Step 8: Hierarchical detection (if enabled, skip in fast mode)
  let hierarchicalPanels: Panel[] = [];
  if (options.useHierarchical && !options.fastMode) {
    hierarchicalPanels = detectHierarchicalPanels(imageData, options);
    techniquesUsed.push('hierarchical');
  }
  
  // Step 9: Combine all panel candidates
  let allPanels = [
    ...gutterPanels,
    ...watershedPanels,
    ...superpixelPanels,
    ...diagonalPanels,
    ...borderlessPanels,
    ...hierarchicalPanels,
  ];
  
  // Step 10: Detect and handle overlapping panels
  allPanels = detectOverlappingPanels(allPanels, options);
  techniquesUsed.push('overlap-detection');
  
  // Step 11: Merge duplicate panels (but keep overlapping ones separate)
  allPanels = mergeOverlappingPanels(allPanels, options.mergeThreshold);
  techniquesUsed.push('merge-duplicates');
  
  // Step 11: Graph-based boundary refinement (skip in fast mode)
  if (options.refineBoundaries && !options.fastMode) {
    allPanels = refineBoundariesWithGraphCut(allPanels, imageData, options);
    techniquesUsed.push('graph-cut-refinement');
  }
  
  // Step 12: Refine boundaries with active contours (skip in fast mode)
  if (options.useActiveContours && options.refineBoundaries && !options.fastMode) {
    allPanels = allPanels.map(panel => refinePanelBoundaries(panel, imageData));
    techniquesUsed.push('active-contours');
  }
  
  // Step 13: Edge snapping for pixel-perfect boundaries (skip in fast mode)
  if (options.snapToEdges && !options.fastMode) {
    allPanels = snapToStrongEdges(allPanels, imageData, options);
    techniquesUsed.push('edge-snapping');
  }
  
  // Step 14: Sort in reading order
  allPanels = sortReadingOrder(allPanels, options.webtoonType);
  
  // Limit panel count
  return allPanels.slice(0, options.maxPanelCount);
}

function classifyPanelType(
  imageData: ImageData,
  x: number, y: number, w: number, h: number,
  options: DetectionOptions
): PanelType {
  const { width, height } = imageData;
  
  const bleedsLeft = x < 5;
  const bleedsRight = x + w > width - 5;
  const bleedsTop = y < 5;
  const bleedsBottom = y + h > height - 5;
  
  if (bleedsLeft && bleedsRight && !bleedsTop && !bleedsBottom) return 'full-width';
  if (bleedsLeft || bleedsRight || bleedsTop || bleedsBottom) return 'bleed';
  
  const areaRatio = (w * h) / (width * height);
  if (areaRatio < 0.1 && options.detectInset) return 'inset';
  
  if (w > height * 0.4 && h < width * 0.3) return 'split';
  
  return 'standard';
}

// ============ Overlapping Panel Detection ============

function detectOverlappingPanels(panels: Panel[], options: DetectionOptions): Panel[] {
  if (!options.detectOverlapping || panels.length < 2) {
    return panels;
  }
  
  const result: Panel[] = [];
  const processed = new Set<number>();
  
  // Sort by area (largest first)
  const sorted = [...panels].sort((a, b) => 
    (b.width * b.height) - (a.width * a.height)
  );
  
  for (let i = 0; i < sorted.length; i++) {
    if (processed.has(i)) continue;
    
    const current = sorted[i];
    processed.add(i);
    
    // Check if this panel contains any smaller panels
    const containedPanels: Panel[] = [];
    
    for (let j = i + 1; j < sorted.length; j++) {
      if (processed.has(j)) continue;
      
      const other = sorted[j];
      const overlapInfo = analyzeOverlap(current, other);
      
      // If the smaller panel is mostly inside the larger one
      if (overlapInfo.type === 'contained' && overlapInfo.containmentRatio > 0.5) {
        // Mark the smaller panel as 'overlapping'
        containedPanels.push({
          ...other,
          type: 'overlapping',
          confidence: other.confidence * 0.95,
        });
        processed.add(j);
      }
    }
    
    // Add the current panel
    result.push(current);
    
    // Add any contained panels
    result.push(...containedPanels);
  }
  
  return result;
}

function mergeOverlappingPanels(panels: Panel[], threshold: number): Panel[] {
  if (panels.length === 0) return [];
  
  // Sort by area (largest first) to handle containment properly
  const sorted = [...panels].sort((a, b) => 
    (b.width * b.height) - (a.width * a.height)
  );
  
  const result: Panel[] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    
    const current = sorted[i];
    used.add(i);
    
    // Check if this panel contains or is contained by other panels
    let hasOverlap = false;
    
    for (let j = 0; j < sorted.length; j++) {
      if (i === j || used.has(j)) continue;
      
      const other = sorted[j];
      const overlapInfo = analyzeOverlap(current, other);
      
      // Case 1: One panel is mostly inside another (inset/overlay case)
      if (overlapInfo.type === 'contained') {
        // Keep both panels separate - mark the smaller one as 'inset' or 'overlapping'
        const smaller = overlapInfo.smallerArea ? other : current;
        const larger = overlapInfo.smallerArea ? current : other;
        
        // Mark the smaller panel appropriately
        if (smaller === other) {
          sorted[j] = {
            ...other,
            type: 'overlapping',
            confidence: other.confidence * 0.9,
          };
        } else {
          sorted[i] = {
            ...current,
            type: 'overlapping',
            confidence: current.confidence * 0.9,
          };
        }
        
        hasOverlap = true;
      }
      // Case 2: Panels are very similar (true duplicates) - merge them
      else if (overlapInfo.type === 'duplicate') {
        // Only merge if they're truly duplicates (similar size and position)
        const sizeRatio = Math.min(
          (current.width * current.height) / (other.width * other.height),
          (other.width * other.height) / (current.width * current.height)
        );
        
        if (sizeRatio > 0.7) {
          // Similar size - likely duplicates, merge them
          sorted[i] = mergeRects(current, other);
          used.add(j);
        }
        // Otherwise keep separate (different sizes = different panels)
      }
      // Case 3: Partial overlap - keep separate but adjust boundaries
      else if (overlapInfo.type === 'partial') {
        // Don't merge, but could adjust boundaries if needed
        hasOverlap = true;
      }
    }
    
    // Add to result if not merged
    if (!used.has(i)) {
      result.push(sorted[i]);
    }
  }
  
  return result;
}

interface OverlapInfo {
  type: 'contained' | 'duplicate' | 'partial' | 'none';
  iou: number;
  containmentRatio: number;
  smallerArea: boolean;
}

function analyzeOverlap(a: Rect, b: Rect): OverlapInfo {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  
  if (x2 <= x1 || y2 <= y1) {
    return { type: 'none', iou: 0, containmentRatio: 0, smallerArea: false };
  }
  
  const intersection = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;
  const iou = union > 0 ? intersection / union : 0;
  
  // Containment ratio: how much of the smaller panel is inside the larger one
  const smallerArea = areaA < areaB;
  const smallerPanelArea = smallerArea ? areaA : areaB;
  const containmentRatio = intersection / smallerPanelArea;
  
  // Case 1: One panel is mostly inside another (>70% containment)
  if (containmentRatio > 0.7) {
    return { type: 'contained', iou, containmentRatio, smallerArea };
  }
  
  // Case 2: Very similar panels (high IoU and similar size)
  const sizeRatio = Math.min(areaA / areaB, areaB / areaA);
  if (iou > 0.5 && sizeRatio > 0.7) {
    return { type: 'duplicate', iou, containmentRatio, smallerArea };
  }
  
  // Case 3: Partial overlap
  if (iou > 0.1) {
    return { type: 'partial', iou, containmentRatio, smallerArea };
  }
  
  return { type: 'none', iou, containmentRatio, smallerArea };
}

function computeIoU(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  
  if (x2 <= x1 || y2 <= y1) return 0;
  
  const intersection = (x2 - x1) * (y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  
  return union > 0 ? intersection / union : 0;
}

function mergeRects(a: Panel, b: Panel): Panel {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  
  return {
    id: a.id,
    x, y,
    width: x2 - x,
    height: y2 - y,
    confidence: Math.max(a.confidence, b.confidence),
    type: a.width * a.height > b.width * b.height ? a.type : b.type,
  };
}

function sortReadingOrder(panels: Panel[], webtoonType: string): Panel[] {
  if (webtoonType === 'webtoon' || webtoonType === 'manhwa') {
    return [...panels].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > a.height * 0.3) return yDiff;
      return a.x - b.x;
    });
  }
  
  return [...panels].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) < Math.min(a.height, b.height) * 0.5) {
      return a.x - b.x;
    }
    return yDiff;
  });
}

// ============ Edge Snapping ============

function snapToStrongEdges(panels: Panel[], imageData: ImageData, options: DetectionOptions): Panel[] {
  const { width, height } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdge(gray);
  
  return panels.map(panel => {
    let { x, y, width: w, height: h } = panel;
    const snapDistance = 8;
    const edgeThreshold = 60;
    
    // Snap left edge
    let bestLeftX = x;
    let bestLeftStrength = 0;
    for (let dx = -snapDistance; dx <= snapDistance; dx++) {
      const testX = x + dx;
      if (testX < 0 || testX >= width) continue;
      
      let strength = 0;
      for (let dy = 0; dy < h; dy += 3) {
        strength += edges.magnitude[(y + dy) * width + testX];
      }
      
      if (strength > bestLeftStrength && strength > edgeThreshold * (h / 3)) {
        bestLeftStrength = strength;
        bestLeftX = testX;
      }
    }
    
    // Snap right edge
    let bestRightX = x + w;
    let bestRightStrength = 0;
    for (let dx = -snapDistance; dx <= snapDistance; dx++) {
      const testX = x + w + dx;
      if (testX < 0 || testX >= width) continue;
      
      let strength = 0;
      for (let dy = 0; dy < h; dy += 3) {
        strength += edges.magnitude[(y + dy) * width + testX];
      }
      
      if (strength > bestRightStrength && strength > edgeThreshold * (h / 3)) {
        bestRightStrength = strength;
        bestRightX = testX;
      }
    }
    
    // Snap top edge
    let bestTopY = y;
    let bestTopStrength = 0;
    for (let dy = -snapDistance; dy <= snapDistance; dy++) {
      const testY = y + dy;
      if (testY < 0 || testY >= height) continue;
      
      let strength = 0;
      for (let dx = 0; dx < w; dx += 3) {
        strength += edges.magnitude[testY * width + (x + dx)];
      }
      
      if (strength > bestTopStrength && strength > edgeThreshold * (w / 3)) {
        bestTopStrength = strength;
        bestTopY = testY;
      }
    }
    
    // Snap bottom edge
    let bestBottomY = y + h;
    let bestBottomStrength = 0;
    for (let dy = -snapDistance; dy <= snapDistance; dy++) {
      const testY = y + h + dy;
      if (testY < 0 || testY >= height) continue;
      
      let strength = 0;
      for (let dx = 0; dx < w; dx += 3) {
        strength += edges.magnitude[testY * width + (x + dx)];
      }
      
      if (strength > bestBottomStrength && strength > edgeThreshold * (w / 3)) {
        bestBottomStrength = strength;
        bestBottomY = testY;
      }
    }
    
    // Apply snapping
    const newX = bestLeftX;
    const newY = bestTopY;
    const newW = bestRightX - bestLeftX;
    const newH = bestBottomY - bestTopY;
    
    // Only apply if it makes sense (doesn't shrink too much)
    if (newW > w * 0.8 && newH > h * 0.8 && newW >= options.minPanelWidth && newH >= options.minPanelHeight) {
      return { ...panel, x: newX, y: newY, width: newW, height: newH };
    }
    
    return panel;
  });
}
