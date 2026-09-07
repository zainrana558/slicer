// Advanced Panel Detection Engine with Vision Capabilities
// Uses multiple algorithms: edge detection, color analysis, whitespace detection

export interface Panel {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface DetectionSettings {
  sensitivity: number; // 0-100, how sensitive to detect borders
  minPanelHeight: number; // minimum panel height in pixels
  borderType: 'auto' | 'white' | 'black' | 'any';
  mergeThreshold: number; // merge panels closer than this
  edgeStrength: number; // edge detection threshold
  useEdgeDetection: boolean;
  useColorAnalysis: boolean;
  useVarianceDetection: boolean;
}

export const DEFAULT_SETTINGS: DetectionSettings = {
  sensitivity: 60,
  minPanelHeight: 80,
  borderType: 'auto',
  mergeThreshold: 10,
  edgeStrength: 50,
  useEdgeDetection: true,
  useColorAnalysis: true,
  useVarianceDetection: true,
};

// Get pixel data from image
function getImageData(image: HTMLImageElement | HTMLCanvasElement): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const canvas = document.createElement('canvas');
  canvas.width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  canvas.height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

// Calculate row variance (how much color varies in a row)
function calculateRowVariance(data: Uint8ClampedArray, width: number, y: number): number {
  let sumR = 0, sumG = 0, sumB = 0;
  let sumR2 = 0, sumG2 = 0, sumB2 = 0;
  const n = width;

  // Sample every 4th pixel for performance
  const step = 4;
  let count = 0;

  for (let x = 0; x < width; x += step) {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    sumR += r;
    sumG += g;
    sumB += b;
    sumR2 += r * r;
    sumG2 += g * g;
    sumB2 += b * b;
    count++;
  }

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;

  const varR = sumR2 / count - meanR * meanR;
  const varG = sumG2 / count - meanG * meanG;
  const varB = sumB2 / count - meanB * meanB;

  return (varR + varG + varB) / 3;
}

// Check if a row is mostly uniform (border-like)
function isRowUniform(data: Uint8ClampedArray, width: number, y: number, threshold: number): boolean {
  const variance = calculateRowVariance(data, width, y);
  return variance < threshold;
}

// Sobel edge detection for horizontal edges
function sobelHorizontalEdge(data: Uint8ClampedArray, width: number, height: number, y: number): number {
  if (y < 1 || y >= height - 1) return 0;

  const getGray = (x: number, row: number) => {
    const clampedX = Math.max(0, Math.min(width - 1, x));
    const clampedY = Math.max(0, Math.min(height - 1, row));
    const idx = (clampedY * width + clampedX) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  // Sobel horizontal kernel
  let sum = 0;
  const step = Math.max(1, Math.floor(width / 200)); // Sample for performance
  let count = 0;

  for (let x = 1; x < width - 1; x += step) {
    const gx =
      -getGray(x - 1, y - 1) + getGray(x + 1, y - 1) +
      -2 * getGray(x - 1, y) + 2 * getGray(x + 1, y) +
      -getGray(x - 1, y + 1) + getGray(x + 1, y + 1);
    sum += Math.abs(gx);
    count++;
  }

  return sum / count;
}

// Detect if row is white/light border
function isRowWhite(data: Uint8ClampedArray, width: number, y: number, threshold: number): boolean {
  let totalBrightness = 0;
  let uniformCount = 0;
  const step = Math.max(1, Math.floor(width / 100));
  let count = 0;

  for (let x = 0; x < width; x += step) {
    const idx = (y * width + x) * 4;
    const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    totalBrightness += brightness;
    if (brightness > threshold) uniformCount++;
    count++;
  }

  return (totalBrightness / count) > threshold && (uniformCount / count) > 0.8;
}

// Detect if row is black/dark border
function isRowBlack(data: Uint8ClampedArray, width: number, y: number, threshold: number): boolean {
  let totalBrightness = 0;
  let uniformCount = 0;
  const step = Math.max(1, Math.floor(width / 100));
  let count = 0;

  for (let x = 0; x < width; x += step) {
    const idx = (y * width + x) * 4;
    const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    totalBrightness += brightness;
    if (brightness < threshold) uniformCount++;
    count++;
  }

  return (totalBrightness / count) < threshold && (uniformCount / count) > 0.8;
}

// Find border regions using variance analysis
function findBorderRegions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  settings: DetectionSettings
): { start: number; end: number; confidence: number }[] {
  const varianceThreshold = 500 + (100 - settings.sensitivity) * 20;
  const whiteThreshold = 200 + (100 - settings.sensitivity) * 0.5;
  const blackThreshold = 55 - (100 - settings.sensitivity) * 0.3;

  const borderScores: number[] = new Array(height).fill(0);

  // Calculate border score for each row
  for (let y = 0; y < height; y++) {
    let score = 0;

    if (settings.useVarianceDetection) {
      const variance = calculateRowVariance(data, width, y);
      if (variance < varianceThreshold) {
        score += 0.4 * (1 - variance / varianceThreshold);
      }
    }

    if (settings.useColorAnalysis) {
      if (settings.borderType === 'auto' || settings.borderType === 'white') {
        if (isRowWhite(data, width, y, whiteThreshold)) {
          score += 0.3;
        }
      }
      if (settings.borderType === 'auto' || settings.borderType === 'black') {
        if (isRowBlack(data, width, y, blackThreshold)) {
          score += 0.3;
        }
      }
    }

    if (settings.useEdgeDetection) {
      const edge = sobelHorizontalEdge(data, width, height, y);
      if (edge > settings.edgeStrength) {
        score += 0.3 * Math.min(1, edge / 100);
      }
    }

    borderScores[y] = score;
  }

  // Smooth scores
  const smoothed = smoothScores(borderScores, 3);

  // Find contiguous border regions
  const threshold = 0.3 + (100 - settings.sensitivity) * 0.005;
  const regions: { start: number; end: number; confidence: number }[] = [];
  let inBorder = false;
  let regionStart = 0;
  let regionScore = 0;
  let regionCount = 0;

  for (let y = 0; y < height; y++) {
    if (smoothed[y] > threshold) {
      if (!inBorder) {
        inBorder = true;
        regionStart = y;
        regionScore = 0;
        regionCount = 0;
      }
      regionScore += smoothed[y];
      regionCount++;
    } else {
      if (inBorder) {
        regions.push({
          start: regionStart,
          end: y,
          confidence: regionScore / regionCount,
        });
        inBorder = false;
      }
    }
  }

  if (inBorder) {
    regions.push({
      start: regionStart,
      end: height,
      confidence: regionScore / regionCount,
    });
  }

  return regions;
}

// Smooth scores with moving average
function smoothScores(scores: number[], windowSize: number): number[] {
  const smoothed: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(scores.length - 1, i + windowSize); j++) {
      sum += scores[j];
      count++;
    }
    smoothed.push(sum / count);
  }
  return smoothed;
}

// Main panel detection function
export function detectPanels(
  image: HTMLImageElement,
  settings: DetectionSettings = DEFAULT_SETTINGS
): Panel[] {
  const { data, width, height } = getImageData(image);

  // Find border regions
  const borders = findBorderRegions(data, width, height, settings);

  // Convert borders to panels (panels are the spaces between borders)
  const panels: Panel[] = [];
  let currentY = 0;
  let panelIndex = 0;

  // Filter out very thin border regions (noise)
  const filteredBorders = borders.filter(b => (b.end - b.start) > 2);

  // Merge close borders
  const mergedBorders = mergeCloseBorders(filteredBorders, settings.mergeThreshold);

  for (const border of mergedBorders) {
    const panelHeight = border.start - currentY;
    if (panelHeight >= settings.minPanelHeight) {
      panels.push({
        id: `panel-${panelIndex}`,
        x: 0,
        y: currentY,
        width: width,
        height: panelHeight,
        confidence: border.confidence,
      });
      panelIndex++;
    }
    currentY = border.end;
  }

  // Add last panel
  const lastPanelHeight = height - currentY;
  if (lastPanelHeight >= settings.minPanelHeight) {
    panels.push({
      id: `panel-${panelIndex}`,
      x: 0,
      y: currentY,
      width: width,
      height: lastPanelHeight,
      confidence: 0.8,
    });
  }

  // If no panels detected, return the whole image as one panel
  if (panels.length === 0) {
    panels.push({
      id: 'panel-0',
      x: 0,
      y: 0,
      width: width,
      height: height,
      confidence: 0.5,
    });
  }

  return panels;
}

// Merge borders that are close together
function mergeCloseBorders(
  borders: { start: number; end: number; confidence: number }[],
  threshold: number
): { start: number; end: number; confidence: number }[] {
  if (borders.length === 0) return [];

  const merged: { start: number; end: number; confidence: number }[] = [borders[0]];

  for (let i = 1; i < borders.length; i++) {
    const last = merged[merged.length - 1];
    const current = borders[i];

    if (current.start - last.end < threshold) {
      // Merge
      last.end = current.end;
      last.confidence = (last.confidence + current.confidence) / 2;
    } else {
      merged.push(current);
    }
  }

  return merged;
}

// Export a panel as a data URL
export function exportPanel(
  image: HTMLImageElement,
  panel: Panel,
  quality: number = 0.95
): string {
  const canvas = document.createElement('canvas');
  canvas.width = panel.width;
  canvas.height = panel.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    image,
    panel.x, panel.y, panel.width, panel.height,
    0, 0, panel.width, panel.height
  );
  return canvas.toDataURL('image/png', quality);
}

// Export panel as blob
export function exportPanelAsBlob(
  image: HTMLImageElement,
  panel: Panel,
  format: 'png' | 'jpeg' | 'webp' = 'png',
  quality: number = 0.95
): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = panel.width;
    canvas.height = panel.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      image,
      panel.x, panel.y, panel.width, panel.height,
      0, 0, panel.width, panel.height
    );
    canvas.toBlob(
      (blob) => resolve(blob!),
      `image/${format}`,
      quality
    );
  });
}

// Get border visualization data
export function getBorderVisualization(
  image: HTMLImageElement,
  settings: DetectionSettings
): { y: number; score: number }[] {
  const { data, width, height } = getImageData(image);
  const varianceThreshold = 500 + (100 - settings.sensitivity) * 20;
  const whiteThreshold = 200 + (100 - settings.sensitivity) * 0.5;
  const blackThreshold = 55 - (100 - settings.sensitivity) * 0.3;

  const scores: { y: number; score: number }[] = [];
  const step = Math.max(1, Math.floor(height / 500)); // Sample for visualization

  for (let y = 0; y < height; y += step) {
    let score = 0;

    if (settings.useVarianceDetection) {
      const variance = calculateRowVariance(data, width, y);
      if (variance < varianceThreshold) {
        score += 0.4 * (1 - variance / varianceThreshold);
      }
    }

    if (settings.useColorAnalysis) {
      if (settings.borderType === 'auto' || settings.borderType === 'white') {
        if (isRowWhite(data, width, y, whiteThreshold)) {
          score += 0.3;
        }
      }
      if (settings.borderType === 'auto' || settings.borderType === 'black') {
        if (isRowBlack(data, width, y, blackThreshold)) {
          score += 0.3;
        }
      }
    }

    if (settings.useEdgeDetection) {
      const edge = sobelHorizontalEdge(data, width, height, y);
      if (edge > settings.edgeStrength) {
        score += 0.3 * Math.min(1, edge / 100);
      }
    }

    scores.push({ y, score });
  }

  return scores;
}
