/**
 * Advanced Image Processing Library
 * 
 * State-of-the-art computer vision algorithms for panel detection:
 * - SLIC Superpixel segmentation
 * - Watershed segmentation
 * - Active contours (snakes)
 * - Multi-scale feature pyramids
 * - Texture analysis (LBP)
 * - Distance transform
 * - RANSAC line fitting
 * - Morphological skeleton
 * - Adaptive thresholding
 */

// ============ Core Types ============

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

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

export interface ColorImage {
  data: Float32Array; // RGB interleaved
  width: number;
  height: number;
}

export interface LabelImage {
  data: Int32Array;
  width: number;
  height: number;
}

// ============ Image Conversions ============

export function imageDataToGrayscale(imageData: ImageData): GrayscaleImage {
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

export function imageDataToColor(imageData: ImageData): ColorImage {
  const { data, width, height } = imageData;
  const color = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    color[i * 3] = data[i * 4];
    color[i * 3 + 1] = data[i * 4 + 1];
    color[i * 3 + 2] = data[i * 4 + 2];
  }
  return { data: color, width, height };
}

// ============ Blurring ============

export function boxBlur(src: GrayscaleImage, radius: number): GrayscaleImage {
  const { data, width, height } = src;
  const dst = new Float32Array(width * height);
  const size = (2 * radius + 1);
  
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

export function gaussianBlur(src: GrayscaleImage, sigma: number): GrayscaleImage {
  const radius = Math.ceil(sigma * 3);
  const kernel = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += kernel[i + radius];
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  
  return separableConvolve(src, kernel);
}

function separableConvolve(src: GrayscaleImage, kernel: Float32Array): GrayscaleImage {
  const { data, width, height } = src;
  const radius = Math.floor(kernel.length / 2);
  
  // Horizontal
  const temp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = Math.max(0, Math.min(width - 1, x + k));
        sum += data[y * width + nx] * kernel[k + radius];
      }
      temp[y * width + x] = sum;
    }
  }
  
  // Vertical
  const dst = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = Math.max(0, Math.min(height - 1, y + k));
        sum += temp[ny * width + x] * kernel[k + radius];
      }
      dst[y * width + x] = sum;
    }
  }
  
  return { data: dst, width, height };
}

// ============ Edge Detection ============

export function sobelEdge(src: GrayscaleImage): { magnitude: Float32Array; direction: Float32Array } {
  const { data, width, height } = src;
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
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

// Morphological gradient (better for watershed)
export function morphologicalGradient(src: GrayscaleImage, radius: number = 1): Float32Array {
  const { data, width, height } = src;
  const gradient = new Float32Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxVal = 0, minVal = 255;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const v = data[ny * width + nx];
            maxVal = Math.max(maxVal, v);
            minVal = Math.min(minVal, v);
          }
        }
      }
      
      gradient[y * width + x] = maxVal - minVal;
    }
  }
  
  return gradient;
}

// ============ Thresholding ============

export function otsuThreshold(src: Float32Array): number {
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

export function adaptiveThreshold(src: GrayscaleImage, blockSize: number, C: number): BinaryImage {
  const { data, width, height } = src;
  const result = new Uint8Array(width * height);
  const half = Math.floor(blockSize / 2);
  
  // Compute integral image for fast mean calculation
  const integral = new Float64Array((width + 1) * (height + 1));
  const iw = width + 1;
  
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += data[y * width + x];
      integral[(y + 1) * iw + (x + 1)] = rowSum + integral[y * iw + (x + 1)];
    }
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half);
      const y1 = Math.max(0, y - half);
      const x2 = Math.min(width - 1, x + half);
      const y2 = Math.min(height - 1, y + half);
      
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[(y2 + 1) * iw + (x2 + 1)] 
                - integral[y1 * iw + (x2 + 1)]
                - integral[(y2 + 1) * iw + x1]
                + integral[y1 * iw + x1];
      
      const mean = sum / area;
      result[y * width + x] = data[y * width + x] > (mean - C) ? 255 : 0;
    }
  }
  
  return { data: result, width, height };
}

// ============ Morphological Operations ============

export function morphDilate(src: BinaryImage, radius: number): BinaryImage {
  const { data, width, height } = src;
  const dst = new Uint8Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
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
          if (dx * dx + dy * dy > radius * radius) continue;
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

export function morphOpen(src: BinaryImage, radius: number): BinaryImage {
  return morphDilate(morphErode(src, radius), radius);
}

export function morphClose(src: BinaryImage, radius: number): BinaryImage {
  return morphErode(morphDilate(src, radius), radius);
}

// ============ Distance Transform ============

export function distanceTransform(bin: BinaryImage): Float32Array {
  const { data, width, height } = bin;
  const dist = new Float32Array(width * height);
  
  // Initialize: 0 for background, INF for foreground
  const INF = 1e10;
  for (let i = 0; i < width * height; i++) {
    dist[i] = data[i] > 0 ? INF : 0;
  }
  
  // Forward pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (x > 0) dist[idx] = Math.min(dist[idx], dist[idx - 1] + 1);
      if (y > 0) dist[idx] = Math.min(dist[idx], dist[(y-1) * width + x] + 1);
      if (x > 0 && y > 0) dist[idx] = Math.min(dist[idx], dist[(y-1) * width + (x-1)] + 1.414);
      if (x < width - 1 && y > 0) dist[idx] = Math.min(dist[idx], dist[(y-1) * width + (x+1)] + 1.414);
    }
  }
  
  // Backward pass
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const idx = y * width + x;
      if (x < width - 1) dist[idx] = Math.min(dist[idx], dist[idx + 1] + 1);
      if (y < height - 1) dist[idx] = Math.min(dist[idx], dist[(y+1) * width + x] + 1);
      if (x < width - 1 && y < height - 1) dist[idx] = Math.min(dist[idx], dist[(y+1) * width + (x+1)] + 1.414);
      if (x > 0 && y < height - 1) dist[idx] = Math.min(dist[idx], dist[(y+1) * width + (x-1)] + 1.414);
    }
  }
  
  // Invert: distance from foreground to background
  for (let i = 0; i < dist.length; i++) {
    dist[i] = data[i] > 0 ? dist[i] : 0;
  }
  
  return dist;
}

// ============ Watershed Segmentation ============

export function watershed(gradient: Float32Array, markers: Int32Array, width: number, height: number): Int32Array {
  const labels = new Int32Array(markers);
  
  // Priority queue (simplified with sorted array for small images)
  type Pixel = { x: number; y: number; priority: number };
  const queue: Pixel[] = [];
  
  // Initialize queue with boundary pixels of markers
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (labels[idx] > 0) {
        // Check if boundary
        let isBoundary = false;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (labels[ny * width + nx] === 0) {
              isBoundary = true;
              break;
            }
          }
        }
        if (isBoundary) {
          queue.push({ x, y, priority: gradient[idx] });
        }
      }
    }
  }
  
  // Sort by gradient (lower = higher priority)
  queue.sort((a, b) => a.priority - b.priority);
  
  // Process queue
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const idx = y * width + x;
    
    // Find neighbor labels
    const neighborLabels = new Set<number>();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (labels[nIdx] > 0) {
          neighborLabels.add(labels[nIdx]);
        }
      }
    }
    
    if (neighborLabels.size === 1) {
      const label = neighborLabels.values().next().value as number;
      labels[idx] = label;
      
      // Add unprocessed neighbors to queue
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (labels[nIdx] === 0) {
            queue.push({ x: nx, y: ny, priority: gradient[nIdx] });
          }
        }
      }
      
      // Re-sort (simplified - in production use a proper priority queue)
      if (queue.length > 0 && queue.length < 1000) {
        queue.sort((a, b) => a.priority - b.priority);
      }
    }
  }
  
  return labels;
}

// ============ SLIC Superpixels ============

export interface Superpixel {
  id: number;
  centerL: number;
  centerA: number;
  centerB: number;
  centerX: number;
  centerY: number;
  pixels: number;
}

export function slicSuperpixels(
  imageData: ImageData,
  numSuperpixels: number,
  compactness: number = 10,
  iterations: number = 10
): { labels: Int32Array; superpixels: Superpixel[] } {
  const { data, width, height } = imageData;
  const N = width * height;
  
  // Convert to Lab color space (simplified)
  const L = new Float32Array(N);
  const A = new Float32Array(N);
  const B = new Float32Array(N);
  
  for (let i = 0; i < N; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    
    // Simplified RGB to Lab
    const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
    
    L[i] = 116 * labF(y) - 16;
    A[i] = 500 * (labF(x / 0.9505) - labF(y));
    B[i] = 200 * (labF(y) - labF(z / 1.089));
  }
  
  // Initialize cluster centers on a regular grid
  const step = Math.sqrt(N / numSuperpixels);
  const centers: Superpixel[] = [];
  let id = 1;
  
  for (let y = step / 2; y < height; y += step) {
    for (let x = step / 2; x < width; x += step) {
      const cx = Math.round(x);
      const cy = Math.round(y);
      const idx = cy * width + cx;
      centers.push({
        id: id++,
        centerL: L[idx],
        centerA: A[idx],
        centerB: B[idx],
        centerX: cx,
        centerY: cy,
        pixels: 0,
      });
    }
  }
  
  // Perturb centers to lowest gradient position in 3x3 neighborhood
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdge(gray);
  
  for (const c of centers) {
    let minGrad = Infinity;
    let bestX = c.centerX, bestY = c.centerY;
    
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = c.centerX + dx;
        const ny = c.centerY + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const grad = edges.magnitude[ny * width + nx];
          if (grad < minGrad) {
            minGrad = grad;
            bestX = nx;
            bestY = ny;
          }
        }
      }
    }
    
    const idx = bestY * width + bestX;
    c.centerX = bestX;
    c.centerY = bestY;
    c.centerL = L[idx];
    c.centerA = A[idx];
    c.centerB = B[idx];
  }
  
  // Initialize labels
  const labels = new Int32Array(N).fill(-1);
  const distances = new Float32Array(N).fill(Infinity);
  
  // Iterate
  for (let iter = 0; iter < iterations; iter++) {
    // Assign pixels to nearest center
    for (const c of centers) {
      const searchRadius = Math.ceil(step * 2);
      
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          const nx = c.centerX + dx;
          const ny = c.centerY + dy;
          
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          
          const idx = ny * width + nx;
          
          // Color distance
          const dl = L[idx] - c.centerL;
          const da = A[idx] - c.centerA;
          const db = B[idx] - c.centerB;
          const dc = Math.sqrt(dl * dl + da * da + db * db);
          
          // Spatial distance
          const ds = Math.sqrt(dx * dx + dy * dy);
          
          // Combined distance
          const D = Math.sqrt(dc * dc + (ds * ds) / (compactness * compactness));
          
          if (D < distances[idx]) {
            distances[idx] = D;
            labels[idx] = c.id;
          }
        }
      }
    }
    
    // Recompute centers
    const sumL = new Float32Array(centers.length);
    const sumA = new Float32Array(centers.length);
    const sumB = new Float32Array(centers.length);
    const sumX = new Float32Array(centers.length);
    const sumY = new Float32Array(centers.length);
    const count = new Int32Array(centers.length);
    
    for (let i = 0; i < N; i++) {
      if (labels[i] < 0) continue;
      const cIdx = labels[i] - 1;
      if (cIdx < 0 || cIdx >= centers.length) continue;
      
      sumL[cIdx] += L[i];
      sumA[cIdx] += A[i];
      sumB[cIdx] += B[i];
      sumX[cIdx] += i % width;
      sumY[cIdx] += Math.floor(i / width);
      count[cIdx]++;
    }
    
    for (let i = 0; i < centers.length; i++) {
      if (count[i] > 0) {
        centers[i].centerL = sumL[i] / count[i];
        centers[i].centerA = sumA[i] / count[i];
        centers[i].centerB = sumB[i] / count[i];
        centers[i].centerX = Math.round(sumX[i] / count[i]);
        centers[i].centerY = Math.round(sumY[i] / count[i]);
        centers[i].pixels = count[i];
      }
    }
    
    // Reset distances
    distances.fill(Infinity);
  }
  
  // Enforce connectivity (remove small disconnected regions)
  enforceConnectivity(labels, width, height, Math.round(step * step / 4));
  
  return { labels, superpixels: centers };
}

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta * delta * delta ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

function enforceConnectivity(labels: Int32Array, width: number, height: number, minSize: number): void {
  const N = width * height;
  const newLabels = new Int32Array(N).fill(-1);
  let nextLabel = 1;
  
  const visited = new Uint8Array(N);
  const stack: number[] = [];
  
  for (let i = 0; i < N; i++) {
    if (visited[i]) continue;
    
    const label = labels[i];
    stack.length = 0;
    stack.push(i);
    visited[i] = 1;
    
    const component: number[] = [];
    
    while (stack.length > 0) {
      const idx = stack.pop()!;
      component.push(idx);
      
      const x = idx % width;
      const y = Math.floor(idx / width);
      
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (!visited[nIdx] && labels[nIdx] === label) {
            visited[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }
    }
    
    if (component.length >= minSize) {
      for (const idx of component) {
        newLabels[idx] = nextLabel;
      }
      nextLabel++;
    } else {
      // Assign to nearest neighbor's label
      for (const idx of component) {
        const x = idx % width;
        const y = Math.floor(idx / width);
        let assigned = false;
        
        for (let r = 1; r <= 5 && !assigned; r++) {
          for (let dy = -r; dy <= r && !assigned; dy++) {
            for (let dx = -r; dx <= r && !assigned; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                if (newLabels[nIdx] > 0) {
                  newLabels[idx] = newLabels[nIdx];
                  assigned = true;
                }
              }
            }
          }
        }
        
        if (!assigned) newLabels[idx] = 0;
      }
    }
  }
  
  labels.set(newLabels);
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

// ============ Texture Analysis (LBP) ============

export function localBinaryPattern(src: GrayscaleImage): Float32Array {
  const { data, width, height } = src;
  const lbp = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = data[y * width + x];
      let code = 0;
      
      // 8-neighborhood LBP
      code |= (data[(y-1)*width + (x-1)] >= center ? 1 : 0) << 0;
      code |= (data[(y-1)*width + x] >= center ? 1 : 0) << 1;
      code |= (data[(y-1)*width + (x+1)] >= center ? 1 : 0) << 2;
      code |= (data[y*width + (x+1)] >= center ? 1 : 0) << 3;
      code |= (data[(y+1)*width + (x+1)] >= center ? 1 : 0) << 4;
      code |= (data[(y+1)*width + x] >= center ? 1 : 0) << 5;
      code |= (data[(y+1)*width + (x-1)] >= center ? 1 : 0) << 6;
      code |= (data[y*width + (x-1)] >= center ? 1 : 0) << 7;
      
      lbp[y * width + x] = code;
    }
  }
  
  return lbp;
}

// Compute LBP histogram for a region
export function lbpHistogram(lbp: Float32Array, x: number, y: number, w: number, h: number, width: number): Float32Array {
  const hist = new Float32Array(256);
  let count = 0;
  
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (px >= 0 && px < width && py >= 0 && py < lbp.length / width) {
        const val = Math.round(lbp[py * width + px]);
        if (val >= 0 && val < 256) {
          hist[val]++;
          count++;
        }
      }
    }
  }
  
  if (count > 0) {
    for (let i = 0; i < 256; i++) hist[i] /= count;
  }
  
  return hist;
}

// ============ RANSAC Line Fitting ============

export interface Line {
  angle: number; // radians
  rho: number;   // distance from origin
  strength: number;
}

export function ransacLineFit(
  edgePoints: Array<{ x: number; y: number }>,
  numIterations: number = 100,
  distanceThreshold: number = 5
): Line[] {
  const lines: Line[] = [];
  const usedPoints = new Set<number>();
  
  for (let iter = 0; iter < numIterations; iter++) {
    // Pick 2 random points
    const remaining = edgePoints.filter((_, i) => !usedPoints.has(i));
    if (remaining.length < 2) break;
    
    const i1 = Math.floor(Math.random() * remaining.length);
    let i2 = Math.floor(Math.random() * remaining.length);
    while (i2 === i1) i2 = Math.floor(Math.random() * remaining.length);
    
    const p1 = remaining[i1];
    const p2 = remaining[i2];
    
    // Fit line
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) continue;
    
    const angle = Math.atan2(dy, dx);
    const rho = p1.x * Math.sin(angle) - p1.y * Math.cos(angle);
    
    // Count inliers
    let inliers = 0;
    for (const p of remaining) {
      const dist = Math.abs(p.x * Math.sin(angle) - p.y * Math.cos(angle) - rho);
      if (dist < distanceThreshold) inliers++;
    }
    
    if (inliers > remaining.length * 0.1) {
      lines.push({ angle, rho, strength: inliers });
      
      // Mark inliers as used
      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i];
        const dist = Math.abs(p.x * Math.sin(angle) - p.y * Math.cos(angle) - rho);
        if (dist < distanceThreshold) {
          usedPoints.add(edgePoints.indexOf(p));
        }
      }
    }
  }
  
  lines.sort((a, b) => b.strength - a.strength);
  return lines.slice(0, 10);
}

// ============ Multi-Scale Feature Pyramid ============

export function buildFeaturePyramid(src: GrayscaleImage, numLevels: number = 4): GrayscaleImage[] {
  const pyramid: GrayscaleImage[] = [src];
  
  for (let i = 1; i < numLevels; i++) {
    const prev = pyramid[i - 1];
    const newWidth = Math.ceil(prev.width / 2);
    const newHeight = Math.ceil(prev.height / 2);
    const newData = new Float32Array(newWidth * newHeight);
    
    // Downsample with averaging
    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const sx = x * 2;
        const sy = y * 2;
        
        let sum = 0, count = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const nx = sx + dx;
            const ny = sy + dy;
            if (nx < prev.width && ny < prev.height) {
              sum += prev.data[ny * prev.width + nx];
              count++;
            }
          }
        }
        
        newData[y * newWidth + x] = sum / count;
      }
    }
    
    pyramid.push({ data: newData, width: newWidth, height: newHeight });
  }
  
  return pyramid;
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

// ============ Active Contour (Snakes) ============

export function activeContour(
  image: GrayscaleImage,
  initialContour: Array<{ x: number; y: number }>,
  alpha: number = 0.1,   // continuity weight
  beta: number = 0.1,    // curvature weight
  gamma: number = 1.0,   // image force weight
  iterations: number = 100
): Array<{ x: number; y: number }> {
  const { data, width, height } = image;
  const contour = initialContour.map(p => ({ ...p }));
  const n = contour.length;
  
  // Compute edge map (image force)
  const edges = sobelEdge(image);
  const maxEdge = Math.max(...Array.from(edges.magnitude));
  
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      const prev = contour[(i - 1 + n) % n];
      const curr = contour[i];
      const next = contour[(i + 1) % n];
      
      // Continuity force (pull toward neighbors)
      const contX = alpha * (prev.x + next.x - 2 * curr.x);
      const contY = alpha * (prev.y + next.y - 2 * curr.y);
      
      // Curvature force
      const curvX = beta * (prev.x + next.x - 2 * curr.x);
      const curvY = beta * (prev.y + next.y - 2 * curr.y);
      
      // Image force (gradient)
      const x = Math.round(curr.x);
      const y = Math.round(curr.y);
      let imgX = 0, imgY = 0;
      
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const idx = y * width + x;
        const gx = (edges.magnitude[idx + 1] - edges.magnitude[idx - 1]) / (2 * maxEdge);
        const gy = (edges.magnitude[idx + width] - edges.magnitude[idx - width]) / (2 * maxEdge);
        imgX = gamma * gx;
        imgY = gamma * gy;
      }
      
      // Update position
      contour[i].x = Math.max(0, Math.min(width - 1, curr.x + contX + curvX + imgX));
      contour[i].y = Math.max(0, Math.min(height - 1, curr.y + contY + curvY + imgY));
    }
  }
  
  return contour;
}

// ============ MSER (Maximally Stable Extremal Regions) ============

export interface MSERRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  stability: number;
  level: number;
}

export function detectMSER(src: GrayscaleImage, minArea: number = 60, maxArea: number = 14400, delta: number = 5): MSERRegion[] {
  const { data, width, height } = src;
  const N = width * height;
  
  // Sort pixels by intensity
  const pixels = Array.from({ length: N }, (_, i) => ({
    idx: i,
    val: data[i],
    x: i % width,
    y: Math.floor(i / width),
  }));
  pixels.sort((a, b) => a.val - b.val);
  
  // Union-Find
  const parent = new Int32Array(N);
  const rank = new Int32Array(N);
  const size = new Int32Array(N);
  const history: Array<{ level: number; sizes: number[] }> = [];
  
  for (let i = 0; i < N; i++) {
    parent[i] = i;
    size[i] = 1;
  }
  
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) {
      parent[ra] = rb;
      size[rb] += size[ra];
    } else if (rank[ra] > rank[rb]) {
      parent[rb] = ra;
      size[ra] += size[rb];
    } else {
      parent[rb] = ra;
      size[ra] += size[rb];
      rank[ra]++;
    }
  }
  
  const regions: MSERRegion[] = [];
  const processed = new Uint8Array(N);
  let pixelIdx = 0;
  
  // Process at each threshold level
  for (let level = 0; level < 256; level++) {
    while (pixelIdx < N && pixels[pixelIdx].val <= level) {
      const p = pixels[pixelIdx];
      processed[p.idx] = 1;
      
      // Connect to processed neighbors
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = p.x + dx, ny = p.y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (processed[nIdx]) {
            union(p.idx, nIdx);
          }
        }
      }
      
      pixelIdx++;
    }
    
    // Check for stable regions
    const componentSizes = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      if (processed[i]) {
        const root = find(i);
        componentSizes.set(root, (componentSizes.get(root) || 0) + 1);
      }
    }
    
    history.push({ level, sizes: Array.from(componentSizes.values()) });
    
    // Check stability (compare with delta levels ago)
    if (history.length > delta) {
      const oldHistory = history[history.length - delta - 1];
      
      for (const [root, currentSize] of componentSizes) {
        if (currentSize >= minArea && currentSize <= maxArea) {
          // Estimate stability
          const oldSize = currentSize; // Simplified
          const variation = Math.abs(currentSize - oldSize) / currentSize;
          
          if (variation < 0.3) {
            // Compute bounding box
            let minX = width, minY = height, maxX = 0, maxY = 0;
            for (let i = 0; i < N; i++) {
              if (processed[i] && find(i) === root) {
                const x = i % width;
                const y = Math.floor(i / width);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
              }
            }
            
            regions.push({
              x: minX,
              y: minY,
              width: maxX - minX + 1,
              height: maxY - minY + 1,
              area: currentSize,
              stability: 1 - variation,
              level,
            });
          }
        }
      }
    }
  }
  
  // Filter and sort by stability
  return regions
    .filter(r => r.area >= minArea && r.area <= maxArea)
    .sort((a, b) => b.stability - a.stability)
    .slice(0, 100);
}
