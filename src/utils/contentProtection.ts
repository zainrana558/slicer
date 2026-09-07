/**
 * Content-Aware Protection System
 * Detects faces, speech bubbles, text, and important content regions
 * Creates protection masks that panel boundaries cannot cross
 */

import {
  GrayscaleImage,
  BinaryImage,
  Rect,
  imageDataToRGB,
  morphClose,
  morphOpen,
  connectedComponents,
  regionVariance,
} from './imageProcessing';

export type ProtectionMask = {
  faces: Rect[];
  bubbles: Rect[];
  textRegions: Rect[];
  importantContent: Rect[];
  combinedMask: Uint8Array;
  width: number;
  height: number;
};

// ============ FACE DETECTION (Skin-tone based) ============

/** Detect skin-tone regions using YCbCr color space */
export function detectSkinRegions(
  r: Uint8ClampedArray,
  g: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number
): BinaryImage {
  const skin = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const R = r[i], G = g[i], B = b[i];

    // Convert to YCbCr
    const Y = 0.299 * R + 0.587 * G + 0.114 * B;
    const Cb = 128 - 0.168736 * R - 0.331264 * G + 0.5 * B;
    const Cr = 128 + 0.5 * R - 0.418688 * G - 0.081312 * B;

    // Skin tone range in YCbCr (multiple models for robustness)
    const isSkin =
      // Model 1: Standard skin detection
      (Cb >= 77 && Cb <= 127 && Cr >= 133 && Cr <= 173) ||
      // Model 2: Broader range for diverse skin tones
      (Y > 60 && Cb >= 85 && Cb <= 135 && Cr >= 135 && Cr <= 180) ||
      // Model 3: HSV-based approximation
      (R > 95 && G > 40 && B > 20 &&
       Math.max(R, G, B) - Math.min(R, G, B) > 15 &&
       Math.abs(R - G) > 15 && R > G && R > B);

    skin[i] = isSkin ? 255 : 0;
  }

  return { data: skin, width, height };
}

/** Group skin regions into face candidates */
export function detectFaceRegions(skin: BinaryImage, minFaceSize: number = 30): Rect[] {
  // Clean up skin mask
  let cleaned = morphClose(skin, 7);
  cleaned = morphOpen(cleaned, 5);

  // Find connected components
  const components = connectedComponents(cleaned, minFaceSize * minFaceSize / 4);

  const faces: Rect[] = [];
  for (const comp of components) {
    const aspect = comp.w / comp.h;
    // Face-like aspect ratio (roughly 0.5 to 1.5)
    if (aspect >= 0.4 && aspect <= 2.0 && comp.w >= minFaceSize && comp.h >= minFaceSize) {
      // Check fill ratio - faces should have significant skin coverage
      const fillRatio = comp.pixels / comp.area;
      if (fillRatio > 0.2) {
        // Add padding around detected face
        const pad = Math.min(comp.w, comp.h) * 0.3;
        faces.push({
          x: Math.max(0, comp.x - pad),
          y: Math.max(0, comp.y - pad),
          w: Math.min(comp.w + pad * 2, skin.width - comp.x + pad),
          h: Math.min(comp.h + pad * 2, skin.height - comp.y + pad),
        });
      }
    }
  }

  return faces;
}

// ============ SPEECH BUBBLE DETECTION ============

/** Detect speech bubbles (white/rounded regions with dark borders) */
export function detectSpeechBubbles(gray: GrayscaleImage): Rect[] {
  const { width, height } = gray;

  // Detect bright regions that could be speech bubbles
  const brightThreshold = 220;
  const brightMask = new Uint8Array(width * height);
  for (let i = 0; i < gray.data.length; i++) {
    brightMask[i] = gray.data[i] > brightThreshold ? 255 : 0;
  }

  let brightBin: BinaryImage = { data: brightMask, width, height };

  // Close small gaps in bubble outlines
  brightBin = morphClose(brightBin, 9);
  brightBin = morphOpen(brightBin, 3);

  const components = connectedComponents(brightBin, 400);
  const bubbles: Rect[] = [];

  for (const comp of components) {
    const aspect = comp.w / comp.h;
    const fillRatio = comp.pixels / comp.area;

    // Speech bubbles are typically:
    // - Rounded (aspect ratio 0.3 to 3.0)
    // - Fairly filled (fill ratio > 0.4)
    // - Medium sized (not tiny noise, not entire page)
    const isBubble =
      aspect >= 0.3 && aspect <= 3.5 &&
      fillRatio > 0.35 &&
      comp.w >= 30 && comp.h >= 20 &&
      comp.area < (width * height * 0.3); // Not too large

    if (isBubble) {
      // Check if it has a dark border (characteristic of speech bubbles)
      const hasBorder = checkBubbleBorder(gray, comp);
      if (hasBorder || fillRatio > 0.6) {
        bubbles.push({
          x: Math.max(0, comp.x - 5),
          y: Math.max(0, comp.y - 5),
          w: Math.min(comp.w + 10, width - comp.x + 5),
          h: Math.min(comp.h + 10, height - comp.y + 5),
        });
      }
    }
  }

  return bubbles;
}

/** Check if a region has a dark border (speech bubble characteristic) */
function checkBubbleBorder(gray: GrayscaleImage, comp: { x: number; y: number; w: number; h: number }): boolean {
  const { data, width } = gray;
  const { x, y, w, h } = comp;

  // Sample border pixels
  let darkBorderPixels = 0;
  let totalBorderPixels = 0;

  // Check top and bottom edges
  for (let px = x; px < Math.min(x + w, width); px += 2) {
    if (y > 0) {
      totalBorderPixels++;
      if (data[y * width + px] < 100) darkBorderPixels++;
    }
    const by = Math.min(y + h - 1, gray.height - 1);
    totalBorderPixels++;
    if (data[by * width + px] < 100) darkBorderPixels++;
  }

  // Check left and right edges
  for (let py = y; py < Math.min(y + h, gray.height); py += 2) {
    if (x > 0) {
      totalBorderPixels++;
      if (data[py * width + x] < 100) darkBorderPixels++;
    }
    const bx = Math.min(x + w - 1, width - 1);
    totalBorderPixels++;
    if (data[py * width + bx] < 100) darkBorderPixels++;
  }

  return totalBorderPixels > 0 && (darkBorderPixels / totalBorderPixels) > 0.15;
}

// ============ TEXT DETECTION ============

/** Detect text regions using high-frequency analysis */
export function detectTextRegions(gray: GrayscaleImage): Rect[] {
  const { width, height, data } = gray;

  // Text has high local variance (dark on light or light on dark)
  const blockSize = 8;
  const bw = Math.ceil(width / blockSize);
  const bh = Math.ceil(height / blockSize);
  const varianceMap = new Float32Array(bw * bh);

  let maxVar = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const x = bx * blockSize;
      const y = by * blockSize;
      const v = regionVariance(gray, x, y, blockSize, blockSize);
      varianceMap[by * bw + bx] = v;
      maxVar = Math.max(maxVar, v);
    }
  }

  // Threshold variance to find text regions
  const varThreshold = maxVar * 0.15;
  const textMask = new Uint8Array(width * height);

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      if (varianceMap[by * bw + bx] > varThreshold) {
        // Mark the entire block
        for (let dy = 0; dy < blockSize; dy++) {
          for (let dx = 0; dx < blockSize; dx++) {
            const px = bx * blockSize + dx;
            const py = by * blockSize + dy;
            if (px < width && py < height) {
              textMask[py * width + px] = 255;
            }
          }
        }
      }
    }
  }

  let textBin: BinaryImage = { data: textMask, width, height };
  textBin = morphClose(textBin, 5);

  const components = connectedComponents(textBin, 200);
  const textRegions: Rect[] = [];

  for (const comp of components) {
    const aspect = comp.w / comp.h;
    // Text regions tend to be wider than tall (lines of text)
    // or roughly square (paragraphs)
    if (comp.w >= 20 && comp.h >= 10 && aspect >= 0.3 && aspect <= 10) {
      textRegions.push({
        x: Math.max(0, comp.x - 8),
        y: Math.max(0, comp.y - 8),
        w: Math.min(comp.w + 16, width - Math.max(0, comp.x - 8)),
        h: Math.min(comp.h + 16, height - Math.max(0, comp.y - 8)),
      });
    }
  }

  return textRegions;
}

// ============ IMPORTANT CONTENT DETECTION ============

/** Detect regions with significant visual content (not gutters/background) */
export function detectImportantContent(gray: GrayscaleImage): Rect[] {
  const { width, height } = gray;

  // Use edge density to find content-rich regions
  const blockSize = 16;
  const bw = Math.ceil(width / blockSize);
  const bh = Math.ceil(height / blockSize);

  // Compute local edge density
  const densityMap = new Float32Array(bw * bh);
  let maxDensity = 0;

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const x = bx * blockSize;
      const y = by * blockSize;
      let edgeSum = 0;
      let count = 0;

      for (let dy = 1; dy < blockSize - 1; dy++) {
        for (let dx = 1; dx < blockSize - 1; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && px < width - 1 && py >= 0 && py < height - 1) {
            const idx = py * width + px;
            // Simple gradient magnitude
            const gx = Math.abs(gray.data[idx + 1] - gray.data[idx - 1]);
            const gy = Math.abs(gray.data[idx + width] - gray.data[idx - width]);
            edgeSum += Math.sqrt(gx * gx + gy * gy);
            count++;
          }
        }
      }

      const density = count > 0 ? edgeSum / count : 0;
      densityMap[by * bw + bx] = density;
      maxDensity = Math.max(maxDensity, density);
    }
  }

  // Find content blocks
  const threshold = maxDensity * 0.2;
  const contentMask = new Uint8Array(width * height);

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      if (densityMap[by * bw + bx] > threshold) {
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
  contentBin = morphClose(contentBin, 7);
  contentBin = morphOpen(contentBin, 3);

  const components = connectedComponents(contentBin, 500);
  const regions: Rect[] = [];

  for (const comp of components) {
    if (comp.w >= 30 && comp.h >= 30) {
      regions.push({
        x: comp.x,
        y: comp.y,
        w: comp.w,
        h: comp.h,
      });
    }
  }

  return regions;
}

// ============ COMBINED PROTECTION MASK ============

/** Build the complete protection mask */
export function buildProtectionMask(
  imgData: ImageData,
  protectFaces: boolean = true,
  protectBubbles: boolean = true,
  protectText: boolean = true
): ProtectionMask {
  const { width, height } = imgData;
  const gray = {
    data: new Uint8ClampedArray(width * height),
    width,
    height,
  };

  // Convert to grayscale
  for (let i = 0; i < width * height; i++) {
    const j = i * 4;
    gray.data[i] = (imgData.data[j] * 0.299 + imgData.data[j + 1] * 0.587 + imgData.data[j + 2] * 0.114) | 0;
  }

  const rgb = imageDataToRGB(imgData);

  // Detect content regions
  const faces = protectFaces ? detectFaceRegions(detectSkinRegions(rgb.r, rgb.g, rgb.b, width, height)) : [];
  const bubbles = protectBubbles ? detectSpeechBubbles(gray) : [];
  const textRegions = protectText ? detectTextRegions(gray) : [];
  const importantContent = detectImportantContent(gray);

  // Build combined mask
  const combinedMask = new Uint8Array(width * height);

  const addRegion = (rect: Rect, padding: number = 0) => {
    const x1 = Math.max(0, Math.floor(rect.x - padding));
    const y1 = Math.max(0, Math.floor(rect.y - padding));
    const x2 = Math.min(width, Math.ceil(rect.x + rect.w + padding));
    const y2 = Math.min(height, Math.ceil(rect.y + rect.h + padding));
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        combinedMask[y * width + x] = 255;
      }
    }
  };

  // Add all protected regions with padding
  faces.forEach(f => addRegion(f, 10));
  bubbles.forEach(b => addRegion(b, 5));
  textRegions.forEach(t => addRegion(t, 5));

  return {
    faces,
    bubbles,
    textRegions,
    importantContent,
    combinedMask,
    width,
    height,
  };
}

/** Check if a cut line intersects protected content */
export function doesCutIntersectContent(
  mask: ProtectionMask,
  y: number,
  x1: number,
  x2: number,
  tolerance: number = 0.15
): boolean {
  const { combinedMask, width, height } = mask;
  if (y < 0 || y >= height) return false;

  const startX = Math.max(0, Math.floor(x1));
  const endX = Math.min(width - 1, Math.ceil(x2));
  const rowStart = y * width;

  let protectedPixels = 0;
  let totalPixels = 0;

  for (let x = startX; x <= endX; x++) {
    totalPixels++;
    if (combinedMask[rowStart + x] === 255) {
      protectedPixels++;
    }
  }

  return totalPixels > 0 && (protectedPixels / totalPixels) > tolerance;
}

/** Check if a vertical cut intersects protected content */
export function doesVerticalCutIntersectContent(
  mask: ProtectionMask,
  x: number,
  y1: number,
  y2: number,
  tolerance: number = 0.15
): boolean {
  const { combinedMask, width, height } = mask;
  if (x < 0 || x >= width) return false;

  const startY = Math.max(0, Math.floor(y1));
  const endY = Math.min(height - 1, Math.ceil(y2));

  let protectedPixels = 0;
  let totalPixels = 0;

  for (let y = startY; y <= endY; y++) {
    totalPixels++;
    if (combinedMask[y * width + x] === 255) {
      protectedPixels++;
    }
  }

  return totalPixels > 0 && (protectedPixels / totalPixels) > tolerance;
}
