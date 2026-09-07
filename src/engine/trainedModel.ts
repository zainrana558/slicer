/**
 * Trained YOLO Model Integration for Panel Detection
 * 
 * This module uses a trained YOLOv8-nano model for accurate panel detection.
 * The model must be trained using the training notebook and exported to ONNX format.
 * 
 * Setup:
 * 1. Run training/train_panel_detector.ipynb on Google Colab (free GPU)
 * 2. Download the trained model (best.onnx)
 * 3. Place it in public/models/webtoon-panels.onnx
 * 4. This module will automatically use it
 */

import { Panel, DetectionOptions } from './types';

// ONNX Runtime for browser
let ort: any = null;
let session: any = null;
let modelLoaded = false;
let loadingPromise: Promise<void> | null = null;

const MODEL_PATH = '/models/webtoon-panels.onnx';

/**
 * Load the trained YOLO model
 */
export async function loadTrainedModel(
  onProgress?: (progress: number) => void
): Promise<void> {
  if (modelLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      // Dynamically import ONNX Runtime
      const ortModule = await import('onnxruntime-web');
      ort = ortModule;

      onProgress?.(10);

      // Configure ONNX Runtime
      ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
      ort.env.wasm.simd = true;

      onProgress?.(30);

      // Load model
      session = await ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });

      onProgress?.(90);
      modelLoaded = true;
      onProgress?.(100);

      console.log('✅ Trained YOLO model loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load trained model:', error);
      modelLoaded = false;
      loadingPromise = null;
      throw error;
    }
  })();

  return loadingPromise;
}

/**
 * Check if trained model is available
 */
export function isTrainedModelLoaded(): boolean {
  return modelLoaded && session !== null;
}

/**
 * Preprocess image for YOLO input
 * YOLO expects: [batch, channels, height, width] = [1, 3, 640, 640]
 */
function preprocessImage(imageData: ImageData): Float32Array {
  const targetSize = 640;
  const { width, height, data } = imageData;

  // Calculate scaling to maintain aspect ratio
  const scale = Math.min(targetSize / width, targetSize / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  // Create padded image
  const input = new Float32Array(3 * targetSize * targetSize);

  // Resize and normalize
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      // Map to source coordinates
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);

      if (srcX < width && srcY < height) {
        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = y * targetSize + x;

        // RGB channels, normalized to 0-1
        input[dstIdx] = data[srcIdx] / 255.0; // R
        input[targetSize * targetSize + dstIdx] = data[srcIdx + 1] / 255.0; // G
        input[2 * targetSize * targetSize + dstIdx] = data[srcIdx + 2] / 255.0; // B
      }
    }
  }

  return input;
}

/**
 * Post-process YOLO output to extract panels
 * YOLO output shape: [1, 84, 8400] for YOLOv8
 * 84 = 4 (bbox) + 80 (classes)
 * 8400 = number of anchor points
 */
function postprocessOutput(
  output: Float32Array,
  originalWidth: number,
  originalHeight: number,
  confidenceThreshold: number = 0.5
): Panel[] {
  const panels: Panel[] = [];
  const targetSize = 640;

  // YOLOv8 output format: [1, 84, 8400]
  // Reshape to [84, 8400]
  const numClasses = 80;
  const numBoxes = 8400;

  // Calculate scaling factor
  const scale = Math.min(targetSize / originalWidth, targetSize / originalHeight);

  for (let i = 0; i < numBoxes; i++) {
    // Get class scores
    let maxScore = 0;
    let maxClass = 0;

    for (let c = 0; c < numClasses; c++) {
      const score = output[4 * numBoxes + c * numBoxes + i];
      if (score > maxScore) {
        maxScore = score;
        maxClass = c;
      }
    }

    // Filter by confidence
    if (maxScore < confidenceThreshold) continue;

    // Get bounding box
    const cx = output[0 * numBoxes + i];
    const cy = output[1 * numBoxes + i];
    const w = output[2 * numBoxes + i];
    const h = output[3 * numBoxes + i];

    // Convert to original image coordinates
    const x1 = (cx - w / 2) / scale;
    const y1 = (cy - h / 2) / scale;
    const x2 = (cx + w / 2) / scale;
    const y2 = (cy + h / 2) / scale;

    // Clamp to image bounds
    const panelX = Math.max(0, Math.min(originalWidth, x1));
    const panelY = Math.max(0, Math.min(originalHeight, y1));
    const panelWidth = Math.min(originalWidth - panelX, x2 - x1);
    const panelHeight = Math.min(originalHeight - panelY, y2 - y1);

    // Filter invalid panels
    if (panelWidth < 50 || panelHeight < 50) continue;

    panels.push({
      id: `ml-panel-${panels.length}`,
      x: Math.round(panelX),
      y: Math.round(panelY),
      width: Math.round(panelWidth),
      height: Math.round(panelHeight),
      confidence: maxScore,
      type: 'standard',
    });
  }

  // Apply NMS (Non-Maximum Suppression)
  return applyNMS(panels, 0.4);
}

/**
 * Non-Maximum Suppression to remove duplicate detections
 */
function applyNMS(panels: Panel[], iouThreshold: number): Panel[] {
  // Sort by confidence
  const sorted = [...panels].sort((a, b) => b.confidence - a.confidence);
  const keep: Panel[] = [];

  while (sorted.length > 0) {
    const best = sorted.shift()!;
    keep.push(best);

    // Remove overlapping panels
    for (let i = sorted.length - 1; i >= 0; i--) {
      const iou = calculateIoU(best, sorted[i]);
      if (iou > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return keep;
}

/**
 * Calculate Intersection over Union
 */
function calculateIoU(a: Panel, b: Panel): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Detect panels using trained YOLO model
 */
export async function detectPanelsWithTrainedModel(
  imageData: ImageData,
  options: DetectionOptions
): Promise<Panel[]> {
  if (!modelLoaded || !session) {
    throw new Error('Trained model not loaded. Call loadTrainedModel() first.');
  }

  const { width, height } = imageData;

  // Preprocess
  const input = preprocessImage(imageData);

  // Create tensor
  const tensor = new ort.Tensor('float32', input, [1, 3, 640, 640]);

  // Run inference
  const feeds: Record<string, any> = {};
  feeds[session.inputNames[0]] = tensor;
  const results = await session.run(feeds);

  // Get output
  const output = results[session.outputNames[0]].data as Float32Array;

  // Post-process
  const panels = postprocessOutput(output, width, height, 0.5);

  // Sort by reading order
  panels.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > Math.min(a.height, b.height) * 0.5) {
      return yDiff;
    }
    return a.x - b.x;
  });

  // Re-index
  panels.forEach((panel, i) => {
    panel.id = `panel-${i}`;
  });

  return panels;
}

/**
 * Hybrid detection: Use trained model + CV fallback
 */
export async function detectPanelsHybrid(
  imageData: ImageData,
  options: DetectionOptions
): Promise<Panel[]> {
  // Try trained model first
  if (modelLoaded) {
    try {
      const mlPanels = await detectPanelsWithTrainedModel(imageData, options);
      if (mlPanels.length > 0) {
        return mlPanels;
      }
    } catch (error) {
      console.warn('Trained model failed, falling back to CV:', error);
    }
  }

  // Fallback to CV
  const { detectPanelsCV } = await import('./cv');
  return detectPanelsCV(imageData, options);
}
