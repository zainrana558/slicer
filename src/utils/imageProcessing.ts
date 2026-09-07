/**
 * Core image processing utilities - lightweight CPU-based operations
 * Optimized for speed with typed arrays and minimal allocations
 */

export type GrayscaleImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type FloatImage = {
  data: Float32Array;
  width: number;
  height: number;
};

export type BinaryImage = {
  data: Uint8Array; // 0 or 255
  width: number;
  height: number;
};

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

// ============ CONVERSIONS ============

export function imageDataToGrayscale(imgData: ImageData): GrayscaleImage {
  const { data, width, height } = imgData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    // Luminance formula (ITU-R BT.601)
    gray[i] = (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114) | 0;
  }
  return { data: gray, width, height };
}

export function imageDataToRGB(imgData: ImageData): { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray; width: number; height: number } {
  const { data, width, height } = imgData;
  const len = width * height;
  const r = new Uint8ClampedArray(len);
  const g = new Uint8ClampedArray(len);
  const b = new Uint8ClampedArray(len);
  for (let i = 0; i < len; i++) {
    const j = i * 4;
    r[i] = data[j];
    g[i] = data[j + 1];
    b[i] = data[j + 2];
  }
  return { r, g, b, width, height };
}

// ============ BLUR / SMOOTHING ============

/** Fast box blur (separable, O(n) per pixel regardless of kernel size) */
export function boxBlur(gray: GrayscaleImage, radius: number): GrayscaleImage {
  const { data, width, height } = gray;
  const out = new Uint8ClampedArray(width * height);
  const temp = new Uint8ClampedArray(width * height);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const r = Math.min(radius, width - 1);
    // Initialize sum for first pixel
    for (let x = -r; x <= r; x++) {
      sum += data[y * width + Math.max(0, Math.min(width - 1, x))];
    }
    const count = 2 * r + 1;
    for (let x = 0; x < width; x++) {
      temp[y * width + x] = (sum / count) | 0;
      // Slide window
      const addX = Math.min(width - 1, x + r + 1);
      const subX = Math.max(0, x - r);
      sum += data[y * width + addX] - data[y * width + subX];
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0;
    const r = Math.min(radius, height - 1);
    for (let y = -r; y <= r; y++) {
      sum += temp[Math.max(0, Math.min(height - 1, y)) * width + x];
    }
    const count = 2 * r + 1;
    for (let y = 0; y < height; y++) {
      out[y * width + x] = (sum / count) | 0;
      const addY = Math.min(height - 1, y + r + 1);
      const subY = Math.max(0, y - r);
      sum += temp[addY * width + x] - temp[subY * width + x];
    }
  }

  return { data: out, width, height };
}

/** Gaussian blur approximation using 3 box blurs */
export function gaussianBlur(gray: GrayscaleImage, sigma: number): GrayscaleImage {
  // Approximate sigma with box blur radius
  const r = Math.max(1, Math.round(sigma * 0.84));
  let result = boxBlur(gray, r);
  result = boxBlur(result, r);
  result = boxBlur(result, r);
  return result;
}

// ============ EDGE DETECTION ============

/** Sobel edge detection - returns gradient magnitude */
export function sobelEdge(gray: GrayscaleImage): FloatImage {
  const { data, width, height } = gray;
  const mag = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      // Sobel kernels
      const gx =
        -data[(y - 1) * width + (x - 1)] + data[(y - 1) * width + (x + 1)] +
        -2 * data[y * width + (x - 1)] + 2 * data[y * width + (x + 1)] +
        -data[(y + 1) * width + (x - 1)] + data[(y + 1) * width + (x + 1)];

      const gy =
        -data[(y - 1) * width + (x - 1)] - 2 * data[(y - 1) * width + x] - data[(y - 1) * width + (x + 1)] +
        data[(y + 1) * width + (x - 1)] + 2 * data[(y + 1) * width + x] + data[(y + 1) * width + (x + 1)];

      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return { data: mag, width, height };
}

/** Adaptive threshold for edge map */
export function thresholdEdge(edges: FloatImage, percentile: number = 85): BinaryImage {
  const { data, width, height } = edges;
  // Find threshold using percentile of non-zero values
  const nonZero: number[] = [];
  const sampleStep = Math.max(1, (data.length / 10000) | 0);
  for (let i = 0; i < data.length; i += sampleStep) {
    if (data[i] > 0) nonZero.push(data[i]);
  }
  nonZero.sort((a, b) => a - b);
  const idx = Math.min(nonZero.length - 1, (nonZero.length * percentile / 100) | 0);
  const thresh = nonZero[idx] || 30;

  const binary = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    binary[i] = data[i] > thresh ? 255 : 0;
  }
  return { data: binary, width, height };
}

// ============ MORPHOLOGICAL OPERATIONS ============

export function dilate(bin: BinaryImage, kernelSize: number): BinaryImage {
  const { data, width, height } = bin;
  const out = new Uint8Array(width * height);
  const r = (kernelSize / 2) | 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false;
      for (let ky = -r; ky <= r && !found; ky++) {
        for (let kx = -r; kx <= r && !found; kx++) {
          const ny = y + ky, nx = x + kx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            if (data[ny * width + nx] === 255) found = true;
          }
        }
      }
      out[y * width + x] = found ? 255 : 0;
    }
  }
  return { data: out, width, height };
}

export function erode(bin: BinaryImage, kernelSize: number): BinaryImage {
  const { data, width, height } = bin;
  const out = new Uint8Array(width * height);
  const r = (kernelSize / 2) | 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allSet = true;
      for (let ky = -r; ky <= r && allSet; ky++) {
        for (let kx = -r; kx <= r && allSet; kx++) {
          const ny = y + ky, nx = x + kx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            if (data[ny * width + nx] !== 255) allSet = false;
          } else {
            allSet = false;
          }
        }
      }
      out[y * width + x] = allSet ? 255 : 0;
    }
  }
  return { data: out, width, height };
}

/** Morphological close = dilate then erode */
export function morphClose(bin: BinaryImage, kernelSize: number): BinaryImage {
  return erode(dilate(bin, kernelSize), kernelSize);
}

/** Morphological open = erode then dilate */
export function morphOpen(bin: BinaryImage, kernelSize: number): BinaryImage {
  return dilate(erode(bin, kernelSize), kernelSize);
}

// ============ PROJECTION PROFILES ============

/** Horizontal projection: sum of dark pixels per row */
export function horizontalProjection(gray: GrayscaleImage, threshold: number = 240): Uint32Array {
  const { data, width, height } = gray;
  const proj = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      if (data[rowStart + x] < threshold) count++;
    }
    proj[y] = count;
  }
  return proj;
}

/** Vertical projection: sum of dark pixels per column */
export function verticalProjection(gray: GrayscaleImage, threshold: number = 240): Uint32Array {
  const { data, width, height } = gray;
  const proj = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      if (data[rowStart + x] < threshold) proj[x]++;
    }
  }
  return proj;
}

/** White-space projection: count of near-white pixels per row */
export function whiteRowProjection(gray: GrayscaleImage, threshold: number = 230): Uint32Array {
  const { data, width, height } = gray;
  const proj = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      if (data[rowStart + x] > threshold) count++;
    }
    proj[y] = count;
  }
  return proj;
}

/** White-space projection per column */
export function whiteColProjection(gray: GrayscaleImage, threshold: number = 230): Uint32Array {
  const { data, width, height } = gray;
  const proj = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      if (data[rowStart + x] > threshold) proj[x]++;
    }
  }
  return proj;
}

// ============ CONNECTED COMPONENTS ============

export type Component = {
  id: number;
  x: number; y: number;
  w: number; h: number;
  area: number;
  pixels: number;
};

/** Label connected components (8-connectivity) */
export function connectedComponents(bin: BinaryImage, minArea: number = 100): Component[] {
  const { data, width, height } = bin;
  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  const components: { minX: number; minY: number; maxX: number; maxY: number; pixels: number }[] = [
    { minX: 0, minY: 0, maxX: 0, maxY: 0, pixels: 0 } // placeholder for label 0
  ];

  // Union-Find
  const parent = new Int32Array(width * height / 4 + 1);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  // First pass - assign labels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (data[i] !== 255) continue;

      const neighbors: number[] = [];
      // Check 4-connected neighbors (up, left, up-left, up-right)
      if (y > 0 && data[i - width] === 255) neighbors.push(labels[i - width]);
      if (x > 0 && data[i - 1] === 255) neighbors.push(labels[i - 1]);
      if (y > 0 && x > 0 && data[i - width - 1] === 255) neighbors.push(labels[i - width - 1]);
      if (y > 0 && x < width - 1 && data[i - width + 1] === 255) neighbors.push(labels[i - width + 1]);

      if (neighbors.length === 0) {
        labels[i] = nextLabel++;
      } else {
        const minLabel = Math.min(...neighbors.filter(n => n > 0));
        labels[i] = minLabel;
        for (const n of neighbors) {
          if (n > 0 && n !== minLabel) union(n, minLabel);
        }
      }
    }
  }

  // Second pass - resolve labels and compute bounding boxes
  const labelMap = new Map<number, number>();
  let compId = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (labels[i] === 0) continue;
      const root = find(labels[i]);
      if (!labelMap.has(root)) {
        labelMap.set(root, ++compId);
        components.push({ minX: x, minY: y, maxX: x, maxY: y, pixels: 0 });
      }
      const cid = labelMap.get(root)!;
      const comp = components[cid];
      comp.minX = Math.min(comp.minX, x);
      comp.minY = Math.min(comp.minY, y);
      comp.maxX = Math.max(comp.maxX, x);
      comp.maxY = Math.max(comp.maxY, y);
      comp.pixels++;
    }
  }

  // Filter by min area and convert to Component
  const result: Component[] = [];
  for (let i = 1; i < components.length; i++) {
    const c = components[i];
    const w = c.maxX - c.minX + 1;
    const h = c.maxY - c.minY + 1;
    const area = w * h;
    if (area >= minArea && c.pixels >= minArea * 0.1) {
      result.push({
        id: i,
        x: c.minX, y: c.minY,
        w, h,
        area,
        pixels: c.pixels,
      });
    }
  }

  return result;
}

// ============ ADAPTIVE THRESHOLDING ============

/** Otsu's method for automatic threshold */
export function otsuThreshold(gray: GrayscaleImage): number {
  const { data } = gray;
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;

  const total = data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0, wB = 0, wF = 0;
  let maxVariance = 0;
  let threshold = 128;

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
      threshold = t;
    }
  }
  return threshold;
}

/** Apply threshold to create binary image */
export function applyThreshold(gray: GrayscaleImage, threshold: number): BinaryImage {
  const { data, width, height } = gray;
  const bin = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    bin[i] = data[i] < threshold ? 255 : 0;
  }
  return { data: bin, width, height };
}

// ============ LINE DETECTION (simplified Hough) ============

export type Line = { angle: number; distance: number; strength: number };

/** Detect dominant lines using simplified Hough transform */
export function detectLines(edges: FloatImage, threshold: number = 50): Line[] {
  const { data, width, height } = edges;
  const maxDist = Math.ceil(Math.sqrt(width * width + height * height));
  const numAngles = 180;
  const accumulator = new Int32Array(numAngles * maxDist * 2);

  // Precompute sin/cos
  const cosTable = new Float32Array(numAngles);
  const sinTable = new Float32Array(numAngles);
  for (let a = 0; a < numAngles; a++) {
    const theta = (a * Math.PI) / numAngles;
    cosTable[a] = Math.cos(theta);
    sinTable[a] = Math.sin(theta);
  }

  // Sample edge points (skip for performance)
  const step = Math.max(1, ((width * height) / 50000) | 0);
  for (let i = 0; i < data.length; i += step) {
    if (data[i] < threshold) continue;
    const x = i % width;
    const y = (i / width) | 0;
    for (let a = 0; a < numAngles; a++) {
      const r = (x * cosTable[a] + y * sinTable[a] + maxDist) | 0;
      if (r >= 0 && r < maxDist * 2) {
        accumulator[a * maxDist * 2 + r]++;
      }
    }
  }

  // Find peaks
  const lines: Line[] = [];
  const peakThreshold = Math.max(20, (width + height) / 10);
  for (let a = 0; a < numAngles; a++) {
    for (let r = 0; r < maxDist * 2; r++) {
      if (accumulator[a * maxDist * 2 + r] > peakThreshold) {
        lines.push({
          angle: a,
          distance: r - maxDist,
          strength: accumulator[a * maxDist * 2 + r],
        });
      }
    }
  }

  // Sort by strength and return top lines
  lines.sort((a, b) => b.strength - a.strength);
  return lines.slice(0, 50);
}

// ============ REGION ANALYSIS ============

/** Compute local variance in a region */
export function regionVariance(gray: GrayscaleImage, x: number, y: number, w: number, h: number): number {
  const { data, width } = gray;
  let sum = 0, sumSq = 0, count = 0;
  const yEnd = Math.min(y + h, gray.height);
  const xEnd = Math.min(x + w, gray.width);
  for (let py = Math.max(0, y); py < yEnd; py++) {
    for (let px = Math.max(0, x); px < xEnd; px++) {
      const v = data[py * width + px];
      sum += v;
      sumSq += v * v;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/** Check if a row region is mostly uniform (gutter candidate) */
export function isRowUniform(gray: GrayscaleImage, y: number, tolerance: number = 15): boolean {
  const { data, width } = gray;
  const rowStart = y * width;
  let sum = 0;
  for (let x = 0; x < width; x++) sum += data[rowStart + x];
  const mean = sum / width;
  let variance = 0;
  for (let x = 0; x < width; x++) {
    const diff = data[rowStart + x] - mean;
    variance += diff * diff;
  }
  variance /= width;
  return Math.sqrt(variance) < tolerance;
}

/** Downsample image for faster processing */
export function downsample(gray: GrayscaleImage, factor: number): GrayscaleImage {
  const { data, width, height } = gray;
  const nw = Math.ceil(width / factor);
  const nh = Math.ceil(height / factor);
  const out = new Uint8ClampedArray(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = x * factor;
      const sy = y * factor;
      let sum = 0, count = 0;
      for (let dy = 0; dy < factor && sy + dy < height; dy++) {
        for (let dx = 0; dx < factor && sx + dx < width; dx++) {
          sum += data[(sy + dy) * width + sx + dx];
          count++;
        }
      }
      out[y * nw + x] = (sum / count) | 0;
    }
  }
  return { data: out, width: nw, height: nh };
}
