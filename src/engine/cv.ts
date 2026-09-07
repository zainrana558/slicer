/**
 * Advanced Computer Vision pipeline for panel detection
 * Uses multi-scale analysis, morphological operations, and smart heuristics
 */

import { Rect, Panel, DetectionOptions, PanelType } from './types';

// ============ Core Image Processing ============

export interface GrayscaleImage {
  data: Float32Array;
  width: number;
  height: number;
}

export interface BinaryImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export function imageToGrayscale(imageData: ImageData): GrayscaleImage {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { data: gray, width, height };
}

export function boxBlur(src: GrayscaleImage, radius: number): GrayscaleImage {
  const { data, width, height } = src;
  const dst = new Float32Array(width * height);
  const size = (2 * radius + 1) ** 2;
  
  // Horizontal pass
  const temp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      sum += data[y * width + Math.max(0, Math.min(width - 1, x))];
    }
    for (let x = 0; x < width; x++) {
      temp[y * width + x] = sum / size;
      const addX = Math.min(width - 1, x + radius + 1);
      const subX = Math.max(0, x - radius);
      sum += data[y * width + addX] - data[y * width + subX];
    }
  }
  
  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += temp[Math.max(0, Math.min(height - 1, y)) * width + x];
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum / size;
      const addY = Math.min(height - 1, y + radius + 1);
      const subY = Math.max(0, y - radius);
      sum += temp[addY * width + x] - temp[subY * width + x];
    }
  }
  
  return { data: dst, width, height };
}

export function sobelEdge(src: GrayscaleImage): { magnitude: Float32Array; direction: Float32Array } {
  const { data, width, height } = src;
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel kernels
      const gx = 
        -data[(y-1)*width + (x-1)] + data[(y-1)*width + (x+1)] +
        -2*data[y*width + (x-1)] + 2*data[y*width + (x+1)] +
        -data[(y+1)*width + (x-1)] + data[(y+1)*width + (x+1)];
      
      const gy = 
        -data[(y-1)*width + (x-1)] - 2*data[(y-1)*width + x] - data[(y-1)*width + (x+1)] +
        data[(y+1)*width + (x-1)] + 2*data[(y+1)*width + x] + data[(y+1)*width + (x+1)];
      
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      direction[idx] = Math.atan2(gy, gx);
    }
  }
  
  return { magnitude, direction };
}

export function threshold(src: Float32Array, thresh: number): Uint8Array {
  const result = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    result[i] = src[i] > thresh ? 255 : 0;
  }
  return result;
}

export function otsuThreshold(src: Float32Array): number {
  // Compute histogram
  const hist = new Float64Array(256);
  for (let i = 0; i < src.length; i++) {
    hist[Math.min(255, Math.max(0, Math.round(src[i])))]++;
  }
  const total = src.length;
  
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  
  let sumB = 0, wB = 0, wF = 0;
  let maxVariance = 0;
  let bestThresh = 0;
  
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    
    if (variance > maxVariance) {
      maxVariance = variance;
      bestThresh = t;
    }
  }
  
  return bestThresh;
}

export function morphDilate(src: BinaryImage, radius: number): BinaryImage {
  const { data, width, height } = src;
  const dst = new Uint8Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            if (data[ny * width + nx] > 0) found = true;
          }
        }
      }
      dst[y * width + x] = found ? 255 : 0;
    }
  }
  
  return { data: dst, width, height };
}

export function morphErode(src: BinaryImage, radius: number): BinaryImage {
  const { data, width, height } = src;
  const dst = new Uint8Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allSet = true;
      for (let dy = -radius; dy <= radius && allSet; dy++) {
        for (let dx = -radius; dx <= radius && allSet; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            if (data[ny * width + nx] === 0) allSet = false;
          } else {
            allSet = false;
          }
        }
      }
      dst[y * width + x] = allSet ? 255 : 0;
    }
  }
  
  return { data: dst, width, height };
}

// ============ Connected Components ============

export interface Component {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  pixels: number;
}

export function connectedComponents(bin: BinaryImage): Component[] {
  const { data, width, height } = bin;
  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  
  // Union-Find
  const parent = new Int32Array(width * height + 1);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  
  // First pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] === 0) continue;
      
      const neighbors: number[] = [];
      if (x > 0 && labels[y * width + (x-1)] > 0) neighbors.push(labels[y * width + (x-1)]);
      if (y > 0 && labels[(y-1) * width + x] > 0) neighbors.push(labels[(y-1) * width + x]);
      
      if (neighbors.length === 0) {
        labels[y * width + x] = nextLabel++;
      } else {
        const minLabel = Math.min(...neighbors);
        labels[y * width + x] = minLabel;
        for (const n of neighbors) union(n, minLabel);
      }
    }
  }
  
  // Second pass - flatten labels
  const labelMap = new Map<number, number>();
  let labelCount = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] > 0) {
      const root = find(labels[i]);
      if (!labelMap.has(root)) {
        labelMap.set(root, ++labelCount);
      }
      labels[i] = labelMap.get(root)!;
    }
  }
  
  // Compute component bounds
  const compMap = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; pixels: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (label === 0) continue;
      
      let comp = compMap.get(label);
      if (!comp) {
        comp = { minX: x, minY: y, maxX: x, maxY: y, pixels: 0 };
        compMap.set(label, comp);
      }
      comp.minX = Math.min(comp.minX, x);
      comp.minY = Math.min(comp.minY, y);
      comp.maxX = Math.max(comp.maxX, x);
      comp.maxY = Math.max(comp.maxY, y);
      comp.pixels++;
    }
  }
  
  return Array.from(compMap.entries()).map(([id, comp]) => ({
    id,
    x: comp.minX,
    y: comp.minY,
    width: comp.maxX - comp.minX + 1,
    height: comp.maxY - comp.minY + 1,
    area: (comp.maxX - comp.minX + 1) * (comp.maxY - comp.minY + 1),
    pixels: comp.pixels,
  }));
}

// ============ Projection Analysis ============

export function rowProjection(bin: BinaryImage): Float32Array {
  const { data, width, height } = bin;
  const proj = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] > 0) count++;
    }
    proj[y] = count / width;
  }
  return proj;
}

export function colProjection(bin: BinaryImage): Float32Array {
  const { data, width, height } = bin;
  const proj = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      if (data[y * width + x] > 0) count++;
    }
    proj[x] = count / height;
  }
  return proj;
}

// ============ Gutter Detection ============

function findGutters(
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
  
  // Find valleys (low projection = gutter)
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

// ============ Content Protection ============

export interface ProtectionMask {
  data: Uint8Array;
  width: number;
  height: number;
}

export function buildProtectionMask(
  imageData: ImageData,
  options: DetectionOptions
): ProtectionMask {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  
  // Detect skin tones (faces)
  if (options.protectFaces) {
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      
      // YCbCr skin detection
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
      
      if (y > 60 && cb > 85 && cb < 135 && cr > 135 && cr < 180) {
        mask[i] = 255;
      }
    }
  }
  
  // Detect high-contrast text
  if (options.protectText) {
    const gray = imageToGrayscale(imageData);
    const edges = sobelEdge(gray);
    for (let i = 0; i < width * height; i++) {
      if (edges.magnitude[i] > 80) {
        mask[i] = 255;
      }
    }
  }
  
  // Detect speech bubbles (white ellipses with dark borders)
  if (options.protectBubbles) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const r = data[idx * 4];
        const g = data[idx * 4 + 1];
        const b = data[idx * 4 + 2];
        const brightness = (r + g + b) / 3;
        
        // Very bright regions that could be speech bubbles
        if (brightness > 240) {
          // Check if surrounded by darker pixels (border)
          let hasDarkNeighbor = false;
          for (let dy = -5; dy <= 5; dy += 5) {
            for (let dx = -5; dx <= 5; dx += 5) {
              const ny = y + dy, nx = x + dx;
              if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                const nIdx = ny * width + nx;
                const nr = data[nIdx * 4];
                const ng = data[nIdx * 4 + 1];
                const nb = data[nIdx * 4 + 2];
                if ((nr + ng + nb) / 3 < brightness - 80) {
                  hasDarkNeighbor = true;
                  break;
                }
              }
            }
            if (hasDarkNeighbor) break;
          }
          if (hasDarkNeighbor) mask[idx] = 255;
        }
      }
    }
  }
  
  // Dilate the mask to create protection zones
  const strength = options.protectionStrength / 100;
  const dilateRadius = Math.max(1, Math.round(strength * 15));
  const binMask: BinaryImage = { data: mask, width, height };
  const dilated = morphDilate(binMask, dilateRadius);
  
  return { data: dilated.data, width, height };
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
  
  return (intersections / total) > 0.15;
}

// ============ Line Detection (for diagonal panels) ============

interface Line {
  angle: number;
  rho: number;
  strength: number;
}

function detectLines(edgeMag: Float32Array, edgeDir: Float32Array, width: number, height: number): Line[] {
  const lines: Line[] = [];
  const numAngles = 180;
  const numRhos = Math.ceil(Math.sqrt(width * width + height * height));
  const accumulator = new Float32Array(numAngles * numRhos * 2);
  const centerRho = numRhos;
  
  // Hough transform
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (edgeMag[idx] < 50) continue;
      
      for (let a = 0; a < numAngles; a++) {
        const angle = (a * Math.PI) / numAngles;
        const rho = x * Math.cos(angle) + y * Math.sin(angle);
        const rhoIdx = Math.round(rho) + centerRho;
        if (rhoIdx >= 0 && rhoIdx < numRhos * 2) {
          accumulator[a * numRhos * 2 + rhoIdx] += edgeMag[idx];
        }
      }
    }
  }
  
  // Find peaks
  const threshold = 100;
  for (let a = 0; a < numAngles; a++) {
    for (let r = 0; r < numRhos * 2; r++) {
      if (accumulator[a * numRhos * 2 + r] > threshold) {
        const angle = (a * 180) / numAngles;
        const rho = r - centerRho;
        lines.push({ angle, rho, strength: accumulator[a * numRhos * 2 + r] });
      }
    }
  }
  
  // Sort by strength
  lines.sort((a, b) => b.strength - a.strength);
  return lines.slice(0, 20);
}

// ============ Main Detection Pipeline ============

export function detectPanelsCV(imageData: ImageData, options: DetectionOptions): Panel[] {
  const { width, height } = imageData;
  const panels: Panel[] = [];
  
  // Step 1: Convert to grayscale and blur
  const gray = imageToGrayscale(imageData);
  const blurred = boxBlur(gray, 2);
  
  // Step 2: Edge detection
  const edges = sobelEdge(blurred);
  const edgeThresh = 255 - (options.edgeSensitivity / 100) * 150;
  const edgeBin: BinaryImage = {
    data: threshold(edges.magnitude, edgeThresh),
    width, height
  };
  
  // Step 3: Detect gutters (white/black spaces between panels)
  // Create a "gutter mask" - regions that are very uniform (low variance)
  const gutterMask = detectGutterMask(blurred, width, height, options);
  
  // Step 4: Build protection mask
  const protectionMask = buildProtectionMask(imageData, options);
  
  // Step 5: Find panel candidates using row/col projections on gutter mask
  const rowProj = rowProjection(gutterMask);
  const colProj = colProjection(gutterMask);
  
  const minGap = Math.max(3, Math.round(options.minPanelHeight * 0.02));
  const maxGap = Math.round(Math.min(width, height) * 0.15);
  
  const rowGutters = findGutters(rowProj, height, options.gutterSensitivity, minGap, maxGap);
  const colGutters = findGutters(colProj, width, options.gutterSensitivity, minGap, maxGap);
  
  // Step 6: Create panel rectangles from gutter intersections
  const yBands = [0, ...rowGutters, height];
  const xBands = [0, ...colGutters, width];
  
  for (let i = 0; i < yBands.length - 1; i++) {
    for (let j = 0; j < xBands.length - 1; j++) {
      const y = yBands[i];
      const h = yBands[i + 1] - y;
      const x = xBands[j];
      const w = xBands[j + 1] - x;
      
      if (w >= options.minPanelWidth && h >= options.minPanelHeight) {
        // Check if this region actually contains content
        const contentRatio = computeContentRatio(edgeBin, x, y, w, h);
        if (contentRatio > 0.05) {
          // Check if cut intersects protected content
          const cutSafe = !doesCutIntersectContent(
            protectionMask, true, y, x, x + w
          ) && !doesCutIntersectContent(
            protectionMask, false, x, y, y + h
          );
          
          if (cutSafe || options.protectionStrength < 30) {
            panels.push({
              id: `panel-${panels.length}`,
              x, y, width: w, height: h,
              confidence: contentRatio * 0.8,
              type: classifyPanel(imageData, x, y, w, h, options),
            });
          }
        }
      }
    }
  }
  
  // Step 7: Detect diagonal panels
  if (options.detectDiagonal) {
    const diagonalPanels = detectDiagonalPanels(edges, width, height, options);
    panels.push(...diagonalPanels);
  }
  
  // Step 8: Detect borderless/bleed panels
  if (options.detectBleed || options.detectBorderless) {
    const bleedPanels = detectBleedPanels(imageData, width, height, options);
    panels.push(...bleedPanels);
  }
  
  // Step 9: Merge overlapping panels
  const merged = mergeOverlappingPanels(panels, options.mergeThreshold);
  
  // Step 10: Sort in reading order
  const sorted = sortReadingOrder(merged, options.webtoonType);
  
  // Limit panel count
  return sorted.slice(0, options.maxPanelCount);
}

function detectGutterMask(gray: GrayscaleImage, width: number, height: number, options: DetectionOptions): BinaryImage {
  const { data } = gray;
  const mask = new Uint8Array(width * height);
  
  // Compute local variance in blocks
  const blockSize = 8;
  const varianceThreshold = 400 - options.gutterSensitivity * 3;
  
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
      const variance = (sumSq / count) - (mean * mean);
      
      // Low variance = gutter (uniform color)
      const isGutter = variance < varianceThreshold;
      
      // Fill block
      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          mask[y * width + x] = isGutter ? 255 : 0;
        }
      }
    }
  }
  
  // Invert: we want "content" mask (1 = content, 0 = gutter)
  for (let i = 0; i < mask.length; i++) {
    mask[i] = mask[i] > 0 ? 0 : 255;
  }
  
  // Morphological operations to clean up
  let bin: BinaryImage = { data: mask, width, height };
  bin = morphErode(bin, 2);
  bin = morphDilate(bin, 3);
  
  return bin;
}

function computeContentRatio(edgeBin: BinaryImage, x: number, y: number, w: number, h: number): number {
  const { data, width } = edgeBin;
  let count = 0, total = 0;
  
  for (let py = y; py < y + h; py += 2) {
    for (let px = x; px < x + w; px += 2) {
      if (data[py * width + px] > 0) count++;
      total++;
    }
  }
  
  return total > 0 ? count / total : 0;
}

function classifyPanel(
  imageData: ImageData,
  x: number, y: number, w: number, h: number,
  options: DetectionOptions
): PanelType {
  const { width, height } = imageData;
  
  // Check if panel bleeds to edge
  const bleedsLeft = x < 5;
  const bleedsRight = x + w > width - 5;
  const bleedsTop = y < 5;
  const bleedsBottom = y + h > height - 5;
  
  if (bleedsLeft && bleedsRight && !bleedsTop && !bleedsBottom) return 'full-width';
  if (bleedsLeft || bleedsRight || bleedsTop || bleedsBottom) return 'bleed';
  
  // Check if panel is very small (inset)
  const areaRatio = (w * h) / (width * height);
  if (areaRatio < 0.1 && options.detectInset) return 'inset';
  
  // Check for borderless (very low edge density at borders)
  if (options.detectBorderless) {
    const edgeDensity = computeBorderEdgeDensity(imageData, x, y, w, h);
    if (edgeDensity < 0.1) return 'borderless';
  }
  
  // Check for split panels (common in manhwa)
  if (w > height * 0.4 && h < width * 0.3) return 'split';
  
  return 'standard';
}

function computeBorderEdgeDensity(imageData: ImageData, x: number, y: number, w: number, h: number): number {
  const { data, width } = imageData;
  const gray = new Float32Array(w * h);
  
  // Quick grayscale
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = ((y + py) * width + (x + px)) * 4;
      gray[py * w + px] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }
  
  // Check border edges
  let edgeCount = 0, totalBorder = 0;
  const border = 3;
  
  // Top and bottom borders
  for (let px = border; px < w - border; px++) {
    for (let dy = 0; dy < border - 1; dy++) {
      const diff1 = Math.abs(gray[dy * w + px] - gray[(dy + 1) * w + px]);
      const diff2 = Math.abs(gray[(h - 1 - dy) * w + px] - gray[(h - 2 - dy) * w + px]);
      if (diff1 > 30) edgeCount++;
      if (diff2 > 30) edgeCount++;
      totalBorder += 2;
    }
  }
  
  return totalBorder > 0 ? edgeCount / totalBorder : 0;
}

function detectDiagonalPanels(
  edges: { magnitude: Float32Array; direction: Float32Array },
  width: number, height: number,
  options: DetectionOptions
): Panel[] {
  const lines = detectLines(edges.magnitude, edges.direction, width, height);
  const panels: Panel[] = [];
  
  // Look for pairs of parallel lines that could form diagonal panels
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const angleDiff = Math.abs(lines[i].angle - lines[j].angle);
      if (angleDiff < 10 || Math.abs(angleDiff - 180) < 10) {
        // Parallel lines found - could be diagonal panel borders
        const angle = (lines[i].angle + lines[j].angle) / 2;
        
        // Only consider significant diagonal angles (not near-horizontal/vertical)
        if (angle > 20 && angle < 160 && angle !== 90) {
          // Estimate panel bounds from the lines
          const panel = estimateDiagonalPanel(lines[i], lines[j], width, height);
          if (panel && panel.width >= options.minPanelWidth && panel.height >= options.minPanelHeight) {
            panels.push({
              ...panel,
              id: `diagonal-${panels.length}`,
              confidence: 0.6,
              type: 'diagonal',
              angle: angle,
            });
          }
        }
      }
    }
  }
  
  return panels;
}

function estimateDiagonalPanel(line1: Line, line2: Line, width: number, height: number): Rect | null {
  // Convert Hough lines to endpoints and compute bounding box
  const angle1 = (line1.angle * Math.PI) / 180;
  const angle2 = (line2.angle * Math.PI) / 180;
  
  // Find intersection points with image boundaries
  const points: [number, number][] = [];
  
  for (const [angle, rho] of [[angle1, line1.rho], [angle2, line2.rho]] as [number, number][]) {
    // Line: x*cos(a) + y*sin(a) = rho
    // Intersect with image boundaries
    if (Math.abs(Math.sin(angle)) > 0.01) {
      const y0 = (rho - 0 * Math.cos(angle)) / Math.sin(angle);
      const y1 = (rho - width * Math.cos(angle)) / Math.sin(angle);
      if (y0 >= 0 && y0 < height) points.push([0, y0]);
      if (y1 >= 0 && y1 < height) points.push([width, y1]);
    }
    if (Math.abs(Math.cos(angle)) > 0.01) {
      const x0 = (rho - 0 * Math.sin(angle)) / Math.cos(angle);
      const x1 = (rho - height * Math.sin(angle)) / Math.cos(angle);
      if (x0 >= 0 && x0 < width) points.push([x0, 0]);
      if (x1 >= 0 && x1 < width) points.push([x1, height]);
    }
  }
  
  if (points.length < 3) return null;
  
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const minX = Math.max(0, Math.min(...xs));
  const maxX = Math.min(width, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxY = Math.min(height, Math.max(...ys));
  
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
}

function detectBleedPanels(
  imageData: ImageData,
  width: number, height: number,
  options: DetectionOptions
): Panel[] {
  const panels: Panel[] = [];
  const { data } = imageData;
  
  // Check if top/bottom strips are content (not gutter)
  const stripHeight = Math.round(height * 0.05);
  
  // Top strip
  let topContent = 0;
  for (let y = 0; y < stripHeight; y++) {
    for (let x = 0; x < width; x += 4) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const brightness = (r + g + b) / 3;
      if (brightness < 240 || brightness > 15) topContent++;
    }
  }
  
  // If top has content, it might be a bleed panel
  if (topContent > stripHeight * width * 0.01) {
    // Already handled by regular detection
  }
  
  return panels;
}

function mergeOverlappingPanels(panels: Panel[], threshold: number): Panel[] {
  if (panels.length === 0) return [];
  
  const merged: Panel[] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < panels.length; i++) {
    if (used.has(i)) continue;
    
    let current = { ...panels[i] };
    used.add(i);
    
    // Try to merge with other panels
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < panels.length; j++) {
        if (used.has(j)) continue;
        
        const overlap = computeOverlap(current, panels[j]);
        if (overlap > threshold / 100) {
          // Merge
          current = mergeRects(current, panels[j]);
          used.add(j);
          changed = true;
        }
      }
    }
    
    merged.push(current);
  }
  
  return merged;
}

function computeOverlap(a: Rect, b: Rect): number {
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
  if (webtoonType === 'vertical' || webtoonType === 'manhwa') {
    // Vertical scroll: sort top to bottom, left to right
    return [...panels].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > a.height * 0.3) return yDiff;
      return a.x - b.x;
    });
  }
  
  // Traditional: sort by rows, left to right, top to bottom
  return [...panels].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) < Math.min(a.height, b.height) * 0.5) {
      return a.x - b.x;
    }
    return yDiff;
  });
}
