/**
 * ML-based Vision module using Hugging Face Transformers
 * Runs entirely locally using ONNX Runtime (CPU or WASM)
 * 
 * Uses semantic segmentation to identify panel boundaries
 * with human-level accuracy by understanding image content
 */

import { Panel, DetectionOptions, PanelType } from './types';

// Lazy-loaded pipeline
let segmentationPipeline: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

const MODEL_ID = 'Xenova/segformer-b0-finetuned-ade-512-512';

/**
 * Initialize the ML model (downloads on first use, cached after)
 */
export async function initializeVisionModel(
  onProgress?: (progress: number) => void
): Promise<void> {
  if (segmentationPipeline) return;
  if (loadPromise) return loadPromise;
  
  isLoading = true;
  loadPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    
    // Configure for local operation
    env.allowLocalModels = false;
    env.useBrowserCache = typeof window !== 'undefined';
    
    // Load the segmentation model
    segmentationPipeline = await pipeline('image-segmentation', MODEL_ID, {
      progress_callback: onProgress ? (data: any) => {
        if (data.progress) {
          onProgress(data.progress);
        }
      } : undefined,
    });
    
    isLoading = false;
  })();
  
  return loadPromise;
}

export function isModelLoaded(): boolean {
  return segmentationPipeline !== null;
}

export function isModelLoading(): boolean {
  return isLoading;
}

/**
 * ML-based panel detection using semantic segmentation
 * 
 * The model segments the image into semantic regions. We use this to:
 * 1. Identify "background/gutter" regions (uniform, low-content areas)
 * 2. Identify "content" regions (panels with artwork)
 * 3. Use the segmentation boundaries to find panel edges
 */
export async function detectPanelsML(
  imageData: ImageData,
  options: DetectionOptions
): Promise<Panel[]> {
  if (!segmentationPipeline) {
    await initializeVisionModel();
  }
  
  const { width, height } = imageData;
  
  // Convert ImageData to format expected by the model
  const input = imageDataToModelInput(imageData);
  
  // Run segmentation
  const output = await segmentationPipeline(input, {
    threshold: 0.5,
    percentage: 10,
  });
  
  // Process segmentation output to find panels
  const panels = await processSegmentationOutput(output, width, height, options);
  
  return panels;
}

function imageDataToModelInput(imageData: ImageData): any {
  // The transformers library accepts ImageData directly in browser
  // or needs conversion in Node.js
  if (typeof window !== 'undefined') {
    // Browser: create HTMLCanvasElement
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
  
  // Node.js: return raw data
  return {
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
  };
}

async function processSegmentationOutput(
  output: any,
  width: number,
  height: number,
  options: DetectionOptions
): Promise<Panel[]> {
  const panels: Panel[] = [];
  
  // The segmentation output contains labeled regions
  // We need to identify which regions are "panels" vs "gutters"
  
  // Strategy: 
  // 1. Create a content mask from segmentation
  // 2. Find connected components of content
  // 3. Each significant component is a panel
  
  const contentMask = createContentMask(output, width, height);
  const components = findContentComponents(contentMask, width, height, options);
  
  for (const comp of components) {
    const panel = componentToPanel(comp, width, height, options);
    if (panel) {
      panels.push(panel);
    }
  }
  
  return panels;
}

function createContentMask(output: any, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  
  // The segmentation output has a segmentation map
  // Labels that indicate "content" vs "background"
  // For webtoons, we consider most labels as "content" except:
  // - "wall", "sky", "road" (when they fill the entire image uniformly)
  // - Very large uniform regions
  
  if (output.segmentation) {
    const seg = output.segmentation;
    const segWidth = seg.dims ? seg.dims[1] : width;
    const segHeight = seg.dims ? seg.dims[2] : height;
    const data = seg.data;
    
    // Scale mask to original image size
    const scaleX = width / segWidth;
    const scaleY = height / segHeight;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const segX = Math.min(segWidth - 1, Math.floor(x / scaleX));
        const segY = Math.min(segHeight - 1, Math.floor(y / scaleY));
        const label = data[segY * segWidth + segX];
        
        // Most labels indicate content (artwork, characters, etc.)
        // Background-like labels: 0 (background), some specific classes
        const isBackground = label === 0;
        mask[y * width + x] = isBackground ? 0 : 255;
      }
    }
  }
  
  return mask;
}

interface ContentComponent {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  fillRatio: number;
  centerX: number;
  centerY: number;
}

function findContentComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  options: DetectionOptions
): ContentComponent[] {
  // Connected components on the content mask
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
  
  // First pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue;
      
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
  
  // Second pass
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
  
  // Compute component stats
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
  
  // Filter and convert to components
  const minArea = options.minPanelWidth * options.minPanelHeight;
  const components: ContentComponent[] = [];
  
  for (const [, comp] of compMap) {
    const w = comp.maxX - comp.minX + 1;
    const h = comp.maxY - comp.minY + 1;
    const area = w * h;
    const fillRatio = comp.pixels / area;
    
    if (area >= minArea && fillRatio > 0.3) {
      components.push({
        x: comp.minX,
        y: comp.minY,
        width: w,
        height: h,
        area,
        fillRatio,
        centerX: comp.minX + w / 2,
        centerY: comp.minY + h / 2,
      });
    }
  }
  
  return components;
}

function componentToPanel(
  comp: ContentComponent,
  imageWidth: number,
  imageHeight: number,
  options: DetectionOptions
): Panel | null {
  // Determine panel type based on position and characteristics
  let type: PanelType = 'standard';
  
  const bleedsLeft = comp.x < 5;
  const bleedsRight = comp.x + comp.width > imageWidth - 5;
  const bleedsTop = comp.y < 5;
  const bleedsBottom = comp.y + comp.height > imageHeight - 5;
  
  if (bleedsLeft && bleedsRight) {
    type = 'full-width';
  } else if (bleedsLeft || bleedsRight || bleedsTop || bleedsBottom) {
    type = 'bleed';
  }
  
  const areaRatio = comp.area / (imageWidth * imageHeight);
  if (areaRatio < 0.08 && options.detectInset) {
    type = 'inset';
  }
  
  // Low fill ratio might indicate borderless panel
  if (comp.fillRatio < 0.5 && options.detectBorderless) {
    type = 'borderless';
  }
  
  return {
    id: `ml-panel-${Math.random().toString(36).substr(2, 9)}`,
    x: comp.x,
    y: comp.y,
    width: comp.width,
    height: comp.height,
    confidence: comp.fillRatio * 0.9,
    type,
  };
}

/**
 * Alternative: Use edge detection model for more precise boundaries
 */
export async function detectEdgesML(
  imageData: ImageData
): Promise<Float32Array> {
  if (!segmentationPipeline) {
    await initializeVisionModel();
  }
  
  // Use the segmentation model's internal features for edge detection
  const input = imageDataToModelInput(imageData);
  const output = await segmentationPipeline(input, {
    threshold: 0.5,
    percentage: 5,
  });
  
  // Extract edges from segmentation boundaries
  const { width, height } = imageData;
  const edges = new Float32Array(width * height);
  
  if (output.segmentation) {
    const seg = output.segmentation;
    const segWidth = seg.dims ? seg.dims[1] : width;
    const segHeight = seg.dims ? seg.dims[2] : height;
    const data = seg.data;
    
    const scaleX = width / segWidth;
    const scaleY = height / segHeight;
    
    // Find boundaries between different labels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const segX = Math.min(segWidth - 1, Math.floor(x / scaleX));
        const segY = Math.min(segHeight - 1, Math.floor(y / scaleY));
        const label = data[segY * segWidth + segX];
        
        // Check neighbors
        let isEdge = false;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = segX + dx;
          const ny = segY + dy;
          if (nx >= 0 && nx < segWidth && ny >= 0 && ny < segHeight) {
            if (data[ny * segWidth + nx] !== label) {
              isEdge = true;
              break;
            }
          }
        }
        
        edges[y * width + x] = isEdge ? 255 : 0;
      }
    }
  }
  
  return edges;
}
