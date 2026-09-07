/**
 * Advanced Webtoon Panel Detector
 * Multi-pass detection pipeline with content-aware refinement
 *
 * Pipeline:
 * 1. Preprocessing (downsample, blur, normalize)
 * 2. Gutter detection (projection profiles)
 * 3. Edge-based panel detection (contour finding)
 * 4. Content protection analysis
 * 5. Diagonal/borderless panel detection
 * 6. Recursive subdivision for complex layouts
 * 7. Panel validation and merging
 * 8. Content-aware refinement
 */

import {
  GrayscaleImage,
  BinaryImage,
  Rect,
  boxBlur,
  sobelEdge,
  thresholdEdge,
  morphClose,
  morphOpen,
  connectedComponents,
  otsuThreshold,
  whiteRowProjection,
  whiteColProjection,
  detectLines,
  regionVariance,
  imageDataToGrayscale,
} from './imageProcessing';

import {
  buildProtectionMask,
  doesCutIntersectContent,
  ProtectionMask,
} from './contentProtection';

export type Panel = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  type: 'standard' | 'diagonal' | 'borderless' | 'inset' | 'bleed';
  angle?: number; // For diagonal panels
};

export type DetectionSettings = {
  // Sensitivity
  gutterSensitivity: number;      // 0-100: how aggressively to find gutters
  edgeSensitivity: number;        // 0-100: edge detection threshold
  minPanelSize: number;           // minimum panel dimension in pixels
  maxPanelCount: number;          // maximum panels to detect

  // Content protection
  protectFaces: boolean;
  protectBubbles: boolean;
  protectText: boolean;
  contentProtectionStrength: number; // 0-100

  // Panel types
  detectDiagonal: boolean;
  detectBorderless: boolean;
  detectInset: boolean;

  // Layout
  assumeVerticalScroll: boolean;  // webtoon vertical scroll format
  allowSplitLargePanels: boolean;
  mergeSmallPanels: boolean;
  minGapBetweenPanels: number;    // minimum gap to consider as gutter

  // Advanced
  useAdaptiveThreshold: boolean;
  morphKernelSize: number;
  projectionSmoothing: number;
};

export const DEFAULT_SETTINGS: DetectionSettings = {
  gutterSensitivity: 60,
  edgeSensitivity: 50,
  minPanelSize: 80,
  maxPanelCount: 50,
  protectFaces: true,
  protectBubbles: true,
  protectText: true,
  contentProtectionStrength: 70,
  detectDiagonal: true,
  detectBorderless: true,
  detectInset: true,
  assumeVerticalScroll: true,
  allowSplitLargePanels: true,
  mergeSmallPanels: true,
  minGapBetweenPanels: 5,
  useAdaptiveThreshold: true,
  morphKernelSize: 7,
  projectionSmoothing: 5,
};

// ============ MAIN DETECTION PIPELINE ============

export function detectPanels(
  imgData: ImageData,
  settings: DetectionSettings = DEFAULT_SETTINGS
): Panel[] {
  const { width, height } = imgData;

  // Step 1: Build protection mask
  const protectionMask = buildProtectionMask(
    imgData,
    settings.protectFaces,
    settings.protectBubbles,
    settings.protectText
  );

  // Step 2: Create grayscale and process
  const gray = imageDataToGrayscale(imgData);
  const smoothed = boxBlur(gray, 2);

  // Step 3: Multi-strategy detection
  let panels: Panel[] = [];

  // Strategy A: Gutter-based detection (projection profiles)
  const gutterPanels = detectByGutters(smoothed, settings, protectionMask);
  panels.push(...gutterPanels);

  // Strategy B: Edge-based detection (contour finding)
  const edgePanels = detectByEdges(smoothed, settings, protectionMask);
  panels.push(...edgePanels);

  // Strategy C: Content-based detection (for borderless panels)
  if (settings.detectBorderless) {
    const contentPanels = detectByContent(smoothed, settings, protectionMask);
    panels.push(...contentPanels);
  }

  // Strategy D: Diagonal panel detection
  if (settings.detectDiagonal) {
    const diagPanels = detectDiagonalPanels(smoothed, settings);
    panels.push(...diagPanels);
  }

  // Step 4: Merge overlapping detections
  panels = mergeOverlappingPanels(panels, width, height);

  // Step 5: Validate and filter panels
  panels = validatePanels(panels, settings, protectionMask, width, height);

  // Step 6: Sort panels in reading order
  panels = sortPanels(panels, settings.assumeVerticalScroll);

  // Step 7: Assign IDs
  panels = panels.map((p, i) => ({ ...p, id: `panel_${i}` }));

  // Step 8: Limit to max count
  if (panels.length > settings.maxPanelCount) {
    panels = panels.slice(0, settings.maxPanelCount);
  }

  return panels;
}

// ============ STRATEGY A: GUTTER DETECTION ============

function detectByGutters(
  gray: GrayscaleImage,
  settings: DetectionSettings,
  mask: ProtectionMask
): Panel[] {
  const { width, height } = gray;
  const panels: Panel[] = [];

  // Compute white-space projections
  const rowProj = whiteRowProjection(gray, 225);
  const colProj = whiteColProjection(gray, 225);

  // Smooth projections
  const smoothRow = smoothProjection(rowProj, settings.projectionSmoothing);
  const smoothCol = smoothProjection(colProj, settings.projectionSmoothing);

  // Find gutter positions (rows/columns that are mostly white)
  const rowGutters = findGutters(smoothRow, height, width, settings);
  const colGutters = findGutters(smoothCol, width, height, settings);

  // For vertical scroll webtoons, focus on horizontal gutters
  if (settings.assumeVerticalScroll) {
    // Split image by horizontal gutters
    const rowBands = splitByGutters(rowGutters, height, settings.minGapBetweenPanels);

    for (const band of rowBands) {
      if (band.size < settings.minPanelSize) continue;

      // Check if this band contains protected content
      const bandRect: Rect = { x: 0, y: band.start, w: width, h: band.size };

      // Try to split horizontally within this band using column projection
      const colGuttersInBand = findGuttersInRange(smoothCol, band.start, band.start + band.size, width, height, settings);
      const colBands = splitByGutters(colGuttersInBand, width, settings.minGapBetweenPanels);

      if (colBands.length === 1) {
        // Single panel spanning full width
        panels.push({
          id: '', x: 0, y: band.start, width, height: band.size,
          confidence: band.confidence, type: 'standard',
        });
      } else {
        for (const colBand of colBands) {
          if (colBand.size < settings.minPanelSize * 0.6) continue;
          panels.push({
            id: '', x: colBand.start, y: band.start, width: colBand.size, height: band.size,
            confidence: Math.min(band.confidence, colBand.confidence), type: 'standard',
          });
        }
      }
    }
  } else {
    // Grid-based splitting
    const rowBands = splitByGutters(rowGutters, height, settings.minGapBetweenPanels);
    for (const rowBand of rowBands) {
      const colBands = splitByGutters(colGutters, width, settings.minGapBetweenPanels);
      for (const colBand of colBands) {
        if (rowBand.size < settings.minPanelSize || colBand.size < settings.minPanelSize) continue;
        panels.push({
          id: '', x: colBand.start, y: rowBand.start, width: colBand.size, height: rowBand.size,
          confidence: Math.min(rowBand.confidence, colBand.confidence), type: 'standard',
        });
      }
    }
  }

  return panels;
}

type GutterInfo = { position: number; strength: number };
type BandInfo = { start: number; size: number; confidence: number };

function smoothProjection(proj: Uint32Array, radius: number): Float32Array {
  const result = new Float32Array(proj.length);
  const r = Math.max(1, radius);
  for (let i = 0; i < proj.length; i++) {
    let sum = 0, count = 0;
    for (let j = -r; j <= r; j++) {
      const idx = Math.max(0, Math.min(proj.length - 1, i + j));
      sum += proj[idx];
      count++;
    }
    result[i] = sum / count;
  }
  return result;
}

function findGutters(
  proj: Float32Array,
  projLength: number,
  crossLength: number,
  settings: DetectionSettings
): GutterInfo[] {
  const gutters: GutterInfo[] = [];
  const threshold = crossLength * (0.7 - settings.gutterSensitivity * 0.004);
  const minGap = settings.minGapBetweenPanels;

  let inGutter = false;
  let gutterStart = 0;
  let gutterStrength = 0;

  for (let i = 0; i < projLength; i++) {
    const isGutter = proj[i] > threshold;

    if (isGutter && !inGutter) {
      inGutter = true;
      gutterStart = i;
      gutterStrength = proj[i];
    } else if (!isGutter && inGutter) {
      inGutter = false;
      const gutterWidth = i - gutterStart;
      if (gutterWidth >= minGap) {
        gutters.push({
          position: (gutterStart + i) / 2,
          strength: gutterStrength / crossLength,
        });
      }
    }

    if (inGutter) {
      gutterStrength = Math.max(gutterStrength, proj[i]);
    }
  }

  return gutters;
}

function findGuttersInRange(
  colProj: Float32Array,
  yStart: number,
  yEnd: number,
  projLength: number,
  totalHeight: number,
  settings: DetectionSettings
): GutterInfo[] {
  // For column gutters within a row band, we use the global column projection
  // but adjust the threshold based on the band height
  const bandHeight = yEnd - yStart;
  // Scale threshold proportionally - a shorter band needs fewer white pixels
  const adjustedProj = new Float32Array(colProj.length);
  const scale = bandHeight / totalHeight;
  for (let i = 0; i < colProj.length; i++) {
    adjustedProj[i] = colProj[i] * scale;
  }
  return findGutters(adjustedProj, projLength, bandHeight, settings);
}

function splitByGutters(
  gutters: GutterInfo[],
  totalLength: number,
  minGap: number
): BandInfo[] {
  if (gutters.length === 0) {
    return [{ start: 0, size: totalLength, confidence: 0.8 }];
  }

  const bands: BandInfo[] = [];
  let lastEnd = 0;

  // Sort gutters by position
  const sorted = [...gutters].sort((a, b) => a.position - b.position);

  for (const gutter of sorted) {
    const gutterStart = Math.max(lastEnd, Math.floor(gutter.position - minGap));
    if (gutterStart > lastEnd + 10) {
      bands.push({
        start: lastEnd,
        size: gutterStart - lastEnd,
        confidence: gutter.strength,
      });
    }
    lastEnd = Math.min(totalLength, Math.ceil(gutter.position + minGap));
  }

  // Last band
  if (lastEnd < totalLength - 10) {
    bands.push({
      start: lastEnd,
      size: totalLength - lastEnd,
      confidence: 0.7,
    });
  }

  return bands;
}

// ============ STRATEGY B: EDGE-BASED DETECTION ============

function detectByEdges(
  gray: GrayscaleImage,
  settings: DetectionSettings,
  mask: ProtectionMask
): Panel[] {
  const { width, height } = gray;
  const panels: Panel[] = [];

  // Edge detection
  const edges = sobelEdge(gray);
  const edgeThreshold = 30 + (100 - settings.edgeSensitivity) * 1.5;
  const binaryEdges = thresholdEdge(edges, 70 + (100 - settings.edgeSensitivity) * 0.2);

  // Morphological operations to connect edge segments into panel borders
  let processed = morphClose(binaryEdges, settings.morphKernelSize);
  processed = morphOpen(processed, 3);

  // Find connected components (panel candidates)
  const components = connectedComponents(processed, settings.minPanelSize * settings.minPanelSize / 4);

  // Filter and convert to panels
  for (const comp of components) {
    const aspect = comp.w / comp.h;
    const fillRatio = comp.pixels / comp.area;

    // Panel-like characteristics
    if (
      comp.w >= settings.minPanelSize &&
      comp.h >= settings.minPanelSize &&
      aspect >= 0.2 && aspect <= 5.0 &&
      fillRatio > 0.05 && fillRatio < 0.95
    ) {
      // Check if this component represents a panel border (not content)
      const isBorder = fillRatio < 0.4; // Borders are sparse

      if (isBorder) {
        panels.push({
          id: '',
          x: comp.x,
          y: comp.y,
          width: comp.w,
          height: comp.h,
          confidence: 0.6 + fillRatio,
          type: 'standard',
        });
      }
    }
  }

  // Also try: find dark border rectangles directly
  const darkThreshold = otsuThreshold(gray) * 0.4;
  const darkMask = new Uint8Array(width * height);
  for (let i = 0; i < gray.data.length; i++) {
    darkMask[i] = gray.data[i] < darkThreshold ? 255 : 0;
  }

  let darkBin: BinaryImage = { data: darkMask, width, height };
  darkBin = morphClose(darkBin, 5);

  const darkComponents = connectedComponents(darkBin, 200);
  for (const comp of darkComponents) {
    // Look for rectangular dark regions that form panel borders
    const fillRatio = comp.pixels / comp.area;
    if (fillRatio > 0.02 && fillRatio < 0.3 && comp.w >= settings.minPanelSize && comp.h >= settings.minPanelSize) {
      // This might be a panel border - the panel is the area enclosed
      panels.push({
        id: '',
        x: comp.x,
        y: comp.y,
        width: comp.w,
        height: comp.h,
        confidence: 0.5,
        type: 'standard',
      });
    }
  }

  return panels;
}

// ============ STRATEGY C: CONTENT-BASED DETECTION ============

function detectByContent(
  gray: GrayscaleImage,
  settings: DetectionSettings,
  mask: ProtectionMask
): Panel[] {
  const { width, height } = gray;
  const panels: Panel[] = [];

  // Find content-dense regions (panels without clear borders)
  const blockSize = 12;
  const bw = Math.ceil(width / blockSize);
  const bh = Math.ceil(height / blockSize);

  const contentDensity = new Float32Array(bw * bh);
  let maxDensity = 0;

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const x = bx * blockSize;
      const y = by * blockSize;
      const v = regionVariance(gray, x, y, blockSize, blockSize);
      contentDensity[by * bw + bx] = v;
      maxDensity = Math.max(maxDensity, v);
    }
  }

  // Threshold to find content regions
  const threshold = maxDensity * 0.1;
  const contentMask = new Uint8Array(width * height);

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      if (contentDensity[by * bw + bx] > threshold) {
        for (let dy = 0; dy < blockSize; dy++) {
          for (let dx = 0; dx < blockSize; dx++) {
            const px = bx * blockSize + dx;
            const py = by * blockSize + dy;
            if (px < width && py < height) {
              contentMask[py * width + px] = 255;
            }
          }
        }
      }
    }
  }

  let contentBin: BinaryImage = { data: contentMask, width, height };
  contentBin = morphClose(contentBin, 15);
  contentBin = morphOpen(contentBin, 5);

  const components = connectedComponents(contentBin, settings.minPanelSize * settings.minPanelSize / 2);

  for (const comp of components) {
    if (comp.w >= settings.minPanelSize && comp.h >= settings.minPanelSize) {
      const aspect = comp.w / comp.h;
      if (aspect >= 0.15 && aspect <= 6.0) {
        panels.push({
          id: '',
          x: comp.x,
          y: comp.y,
          width: comp.w,
          height: comp.h,
          confidence: 0.4,
          type: 'borderless',
        });
      }
    }
  }

  return panels;
}

// ============ STRATEGY D: DIAGONAL PANEL DETECTION ============

function detectDiagonalPanels(
  gray: GrayscaleImage,
  settings: DetectionSettings
): Panel[] {
  const panels: Panel[] = [];
  const { width, height } = gray;

  // Detect edges
  const edges = sobelEdge(gray);
  const lines = detectLines(edges, 40);

  // Find pairs of parallel lines that could form diagonal panels
  const angleGroups = new Map<number, typeof lines>();

  for (const line of lines) {
    // Group by similar angles (within 10 degrees)
    const angleGroup = Math.round(line.angle / 10) * 10;
    if (!angleGroups.has(angleGroup)) {
      angleGroups.set(angleGroup, []);
    }
    angleGroups.get(angleGroup)!.push(line);
  }

  // For each angle group with enough lines, try to form panels
  for (const [angle, groupLines] of angleGroups) {
    if (groupLines.length < 2) continue;

    // Skip near-horizontal and near-vertical (handled by gutter detection)
    if (angle < 15 || angle > 165) continue;

    // Sort by distance
    const sorted = [...groupLines].sort((a, b) => a.distance - b.distance);

    // Find pairs of lines that form a panel
    for (let i = 0; i < sorted.length - 1; i++) {
      const dist = Math.abs(sorted[i + 1].distance - sorted[i].distance);
      if (dist > settings.minPanelSize && dist < Math.min(width, height) * 0.8) {
        // Calculate bounding box of the diagonal panel
        const radAngle = (angle * Math.PI) / 180;
        const cos = Math.cos(radAngle);
        const sin = Math.sin(radAngle);

        // Approximate the panel as an axis-aligned bounding box
        const cx = width / 2;
        const cy = height / 2;
        const panelWidth = dist / Math.abs(sin) || dist;
        const panelHeight = dist / Math.abs(cos) || dist;

        if (panelWidth >= settings.minPanelSize && panelHeight >= settings.minPanelSize) {
          panels.push({
            id: '',
            x: Math.max(0, cx - panelWidth / 2),
            y: Math.max(0, cy - panelHeight / 2),
            width: Math.min(panelWidth, width),
            height: Math.min(panelHeight, height),
            confidence: 0.3,
            type: 'diagonal',
            angle: angle,
          });
        }
      }
    }
  }

  return panels;
}

// ============ PANEL MERGING ============

function mergeOverlappingPanels(panels: Panel[], imgWidth: number, imgHeight: number): Panel[] {
  if (panels.length <= 1) return panels;

  const merged: Panel[] = [];
  const used = new Set<number>();

  for (let i = 0; i < panels.length; i++) {
    if (used.has(i)) continue;

    let current = { ...panels[i] };

    for (let j = i + 1; j < panels.length; j++) {
      if (used.has(j)) continue;

      const overlap = computeOverlap(current, panels[j]);

      if (overlap > 0.5) {
        // Merge: take the union
        const newX = Math.min(current.x, panels[j].x);
        const newY = Math.min(current.y, panels[j].y);
        const newRight = Math.max(current.x + current.width, panels[j].x + panels[j].width);
        const newBottom = Math.max(current.y + current.height, panels[j].y + panels[j].height);

        current = {
          ...current,
          x: newX,
          y: newY,
          width: newRight - newX,
          height: newBottom - newY,
          confidence: Math.max(current.confidence, panels[j].confidence),
        };
        used.add(j);
      } else if (overlap > 0.2) {
        // Keep the one with higher confidence
        if (panels[j].confidence > current.confidence) {
          current = { ...panels[j] };
        }
        used.add(j);
      }
    }

    merged.push(current);
  }

  return merged;
}

function computeOverlap(a: Panel, b: Panel): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return intersection / Math.min(areaA, areaB);
}

// ============ PANEL VALIDATION ============

function validatePanels(
  panels: Panel[],
  settings: DetectionSettings,
  mask: ProtectionMask,
  imgWidth: number,
  imgHeight: number
): Panel[] {
  const valid: Panel[] = [];

  for (const panel of panels) {
    // Size validation
    if (panel.width < settings.minPanelSize || panel.height < settings.minPanelSize) continue;
    if (panel.width > imgWidth * 1.1 || panel.height > imgHeight * 1.1) continue;

    // Aspect ratio validation (allow wide range for webtoons)
    const aspect = panel.width / panel.height;
    if (aspect < 0.1 || aspect > 10) continue;

    // Bounds check
    const x = Math.max(0, Math.floor(panel.x));
    const y = Math.max(0, Math.floor(panel.y));
    const w = Math.min(Math.ceil(panel.width), imgWidth - x);
    const h = Math.min(Math.ceil(panel.height), imgHeight - y);
    if (w < settings.minPanelSize || h < settings.minPanelSize) continue;

    // Content protection check
    if (settings.contentProtectionStrength > 0) {
      const tolerance = 0.3 - (settings.contentProtectionStrength / 100) * 0.25;

      // Check if any edge of the panel cuts through protected content
      const topCut = doesCutIntersectContent(mask, y, x, x + w, tolerance);
      const bottomCut = doesCutIntersectContent(mask, y + h - 1, x, x + w, tolerance);

      // If the panel boundary cuts through significant content, adjust it
      if (topCut || bottomCut) {
        // Try to adjust the panel to avoid cutting content
        const adjusted = adjustPanelToAvoidContent(panel, mask, settings);
        if (adjusted) {
          valid.push(adjusted);
          continue;
        }
      }
    }

    valid.push({
      ...panel,
      x, y, width: w, height: h,
    });
  }

  // Merge small panels if enabled
  if (settings.mergeSmallPanels) {
    return mergeSmallAdjacentPanels(valid, settings);
  }

  return valid;
}

function adjustPanelToAvoidContent(
  panel: Panel,
  mask: ProtectionMask,
  settings: DetectionSettings
): Panel | null {
  const { combinedMask, width } = mask;
  let { x, y, width: w, height: h } = panel;

  // Try to shrink from top
  let newY = y;
  for (let row = y; row < y + h * 0.3; row++) {
    let protectedCount = 0;
    for (let col = x; col < x + w; col += 4) {
      if (combinedMask[row * width + col] === 255) protectedCount++;
    }
    if (protectedCount / (w / 4) > 0.2) {
      newY = row;
      break;
    }
  }

  // Try to shrink from bottom
  let newBottom = y + h;
  for (let row = y + h - 1; row > y + h * 0.7; row--) {
    let protectedCount = 0;
    for (let col = x; col < x + w; col += 4) {
      if (combinedMask[row * width + col] === 255) protectedCount++;
    }
    if (protectedCount / (w / 4) > 0.2) {
      newBottom = row;
      break;
    }
  }

  const newH = newBottom - newY;
  if (newH >= settings.minPanelSize) {
    return { ...panel, y: newY, height: newH };
  }

  return null;
}

function mergeSmallAdjacentPanels(panels: Panel[], settings: DetectionSettings): Panel[] {
  if (panels.length <= 1) return panels;

  const result: Panel[] = [...panels];
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      const p = result[i];
      const isSmall = p.width < settings.minPanelSize * 1.5 || p.height < settings.minPanelSize * 1.5;
      if (!isSmall) continue;

      // Find adjacent panel to merge with
      for (let j = 0; j < result.length; j++) {
        if (i === j) continue;
        const q = result[j];

        // Check if panels are adjacent (touching or very close)
        const gap = computeGap(p, q);
        if (gap < settings.minGapBetweenPanels * 3) {
          // Merge
          const newX = Math.min(p.x, q.x);
          const newY = Math.min(p.y, q.y);
          const newRight = Math.max(p.x + p.width, q.x + q.width);
          const newBottom = Math.max(p.y + p.height, q.y + q.height);

          result[i] = {
            ...p,
            x: newX,
            y: newY,
            width: newRight - newX,
            height: newBottom - newY,
            confidence: Math.max(p.confidence, q.confidence),
          };
          result.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }

  return result;
}

function computeGap(a: Panel, b: Panel): number {
  // Compute minimum gap between two panels
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.width, by2 = b.y + b.height;

  const xGap = Math.max(0, Math.max(ax1 - bx2, bx1 - ax2));
  const yGap = Math.max(0, Math.max(ay1 - by2, by1 - ay2));

  return Math.max(xGap, yGap);
}

// ============ SORTING ============

function sortPanels(panels: Panel[], verticalScroll: boolean): Panel[] {
  if (verticalScroll) {
    // Sort top-to-bottom, then left-to-right
    return [...panels].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > Math.min(a.height, b.height) * 0.3) {
        return yDiff;
      }
      return a.x - b.x;
    });
  } else {
    // Sort left-to-right, then top-to-bottom (manga style)
    return [...panels].sort((a, b) => {
      const xDiff = a.x - b.x;
      if (Math.abs(xDiff) > Math.min(a.width, b.width) * 0.3) {
        return xDiff;
      }
      return a.y - b.y;
    });
  }
}

// ============ EXPORT ============

export function exportPanelAsBlob(
  imgData: ImageData,
  panel: Panel,
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality: number = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = panel.width;
    canvas.height = panel.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas context failed'));

    // Create temp canvas with full image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imgData.width;
    tempCanvas.height = imgData.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imgData, 0, 0);

    ctx.drawImage(
      tempCanvas,
      panel.x, panel.y, panel.width, panel.height,
      0, 0, panel.width, panel.height
    );

    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Blob creation failed'));
      },
      format,
      quality
    );
  });
}
