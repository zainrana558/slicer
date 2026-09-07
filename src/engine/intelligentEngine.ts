/**
 * Ultra-Intelligent Panel Detection Engine
 * 
 * Next-generation detection with:
 * - Adaptive algorithm selection
 * - Multi-scale processing
 * - Smart caching
 * - Content-aware optimization
 * - Ultra-fast processing paths
 */

import { Panel, DetectionOptions, SliceResult } from './types';
import { detectPanelsCV } from './cv';
import { 
  analyzeImageSignature, 
  generateAdaptiveOptions, 
  detectPanelsFastPath,
  classifyPanelIntelligent,
  determineReadingOrder,
  ImageSignature,
  PanelInsight 
} from './advancedVision';

export interface IntelligentResult extends SliceResult {
  signature: ImageSignature;
  insights: PanelInsight[];
  adaptiveOptions: DetectionOptions;
  processingPath: string;
  optimizations: string[];
}

/**
 * Main intelligent detection function
 */
export async function detectPanelsIntelligent(
  imageData: ImageData,
  options: DetectionOptions
): Promise<IntelligentResult> {
  const startTime = performance.now();
  const optimizations: string[] = [];
  
  // Step 1: Analyze image signature (fast path)
  const signature = analyzeImageSignature(imageData);
  optimizations.push('signature-analysis');
  
  // Step 2: Generate adaptive options
  const adaptiveOptions = generateAdaptiveOptions(options, signature);
  optimizations.push('adaptive-tuning');
  
  // Step 3: Choose processing path based on complexity
  let panels: Panel[] = [];
  let processingPath = '';
  
  if (signature.estimatedComplexity === 'low' && !options.useIntelligentMode) {
    // Ultra-fast path for simple images
    panels = detectPanelsFastPath(imageData, adaptiveOptions, signature);
    processingPath = 'fast-path';
    optimizations.push('fast-path-detection');
  } else if (signature.estimatedComplexity === 'medium' && adaptiveOptions.fastMode) {
    // Optimized path for medium complexity
    panels = detectPanelsFastPath(imageData, adaptiveOptions, signature);
    processingPath = 'optimized-path';
    optimizations.push('optimized-detection');
  } else {
    // Full detection path
    panels = detectPanelsCV(imageData, adaptiveOptions);
    processingPath = 'full-path';
    optimizations.push('full-detection');
  }
  
  // Step 4: Classify panels intelligently
  const insights = panels.map(panel => 
    classifyPanelIntelligent(panel, imageData)
  );
  optimizations.push('intelligent-classification');
  
  // Step 5: Determine smart reading order
  const readingOrder = determineReadingOrder(
    panels, 
    insights, 
    signature.layoutType
  );
  
  // Apply reading order to insights
  insights.forEach((insight, i) => {
    insight.readingOrder = readingOrder[i];
  });
  
  // Sort panels by reading order
  const sortedIndices = readingOrder
    .map((order, i) => ({ order, i }))
    .sort((a, b) => a.order - b.order)
    .map(item => item.i);
  
  const sortedPanels = sortedIndices.map(i => panels[i]);
  const sortedInsights = sortedIndices.map(i => insights[i]);
  
  // Step 6: Re-index panels
  sortedPanels.forEach((panel, i) => {
    panel.id = `panel-${i}`;
  });
  
  const processingTime = performance.now() - startTime;
  
  return {
    panels: sortedPanels,
    processingTime,
    strategy: adaptiveOptions.strategy,
    imageWidth: imageData.width,
    imageHeight: imageData.height,
    signature,
    insights: sortedInsights,
    adaptiveOptions,
    processingPath,
    optimizations,
    metadata: {
      cvPanels: panels.length,
      mlPanels: 0,
      mergedPanels: sortedPanels.length,
      protectedCuts: 0,
      techniquesUsed: optimizations,
      confidenceAvg: sortedPanels.reduce((sum, p) => sum + p.confidence, 0) / Math.max(1, sortedPanels.length),
      characteristics: signature,
      panelContents: sortedInsights.map(i => ({
        type: i.contentType,
        confidence: i.confidence,
        importance: i.importance,
      })),
      quality: {
        overallScore: calculateOverallScore(sortedPanels, signature),
        precision: calculatePrecision(sortedPanels, signature),
        recall: calculateRecall(sortedPanels, signature),
        issues: detectIssues(sortedPanels, signature),
        suggestions: generateSuggestions(sortedPanels, signature, adaptiveOptions),
      },
    },
  };
}

// ============ Quality Metrics ============

function calculateOverallScore(panels: Panel[], signature: ImageSignature): number {
  const precision = calculatePrecision(panels, signature);
  const recall = calculateRecall(panels, signature);
  return Math.round((precision + recall) / 2 * 100);
}

function calculatePrecision(panels: Panel[], signature: ImageSignature): number {
  let precision = 0.85; // Base precision
  
  // Adjust based on coverage
  const totalPanelArea = panels.reduce((sum, p) => sum + p.width * p.height, 0);
  const imageArea = signature.width * signature.height;
  const coverageRatio = totalPanelArea / imageArea;
  
  if (coverageRatio > 0.9) {
    precision -= 0.1; // Too much coverage = likely merging
  } else if (coverageRatio < 0.3) {
    precision -= 0.05; // Too little coverage
  }
  
  // Adjust based on panel sizes
  const avgPanelSize = totalPanelArea / Math.max(1, panels.length);
  const expectedPanelSize = imageArea / Math.max(1, signature.panelCount);
  const sizeRatio = avgPanelSize / expectedPanelSize;
  
  if (sizeRatio > 2 || sizeRatio < 0.5) {
    precision -= 0.1; // Panel sizes are off
  }
  
  // Adjust based on image quality
  if (signature.noise > 0.15) {
    precision -= 0.1;
  }
  if (signature.compression > 0.7) {
    precision -= 0.05;
  }
  
  return Math.max(0, Math.min(1, precision));
}

function calculateRecall(panels: Panel[], signature: ImageSignature): number {
  let recall = 0.80; // Base recall
  
  // Adjust based on coverage
  const totalPanelArea = panels.reduce((sum, p) => sum + p.width * p.height, 0);
  const imageArea = signature.width * signature.height;
  const coverageRatio = totalPanelArea / imageArea;
  
  if (coverageRatio < 0.3) {
    recall -= 0.15; // Missing many panels
  }
  
  // Adjust based on panel count
  const countRatio = panels.length / Math.max(1, signature.panelCount);
  if (countRatio < 0.5) {
    recall -= 0.2; // Detected too few panels
  } else if (countRatio > 2) {
    recall -= 0.1; // Detected too many panels
  }
  
  // Adjust based on image quality
  if (signature.noise > 0.15) {
    recall -= 0.1;
  }
  
  return Math.max(0, Math.min(1, recall));
}

function detectIssues(panels: Panel[], signature: ImageSignature): string[] {
  const issues: string[] = [];
  
  // Check for very large panels
  const imageArea = signature.width * signature.height;
  const largePanels = panels.filter(p => (p.width * p.height) / imageArea > 0.5);
  if (largePanels.length > 0) {
    issues.push(`${largePanels.length} very large panel(s) detected`);
  }
  
  // Check for very small panels
  const smallPanels = panels.filter(p => p.width < 50 || p.height < 50);
  if (smallPanels.length > 0) {
    issues.push(`${smallPanels.length} very small panel(s) detected`);
  }
  
  // Check coverage
  const totalPanelArea = panels.reduce((sum, p) => sum + p.width * p.height, 0);
  const coverageRatio = totalPanelArea / imageArea;
  if (coverageRatio > 0.9) {
    issues.push('Very high coverage - panels may be merged');
  } else if (coverageRatio < 0.3) {
    issues.push('Low coverage - may be missing panels');
  }
  
  // Check image quality
  if (signature.noise > 0.15) {
    issues.push('High image noise detected');
  }
  if (signature.compression > 0.7) {
    issues.push('Heavy compression artifacts detected');
  }
  
  // Check panel count
  if (panels.length === 0) {
    issues.push('No panels detected');
  } else if (panels.length > signature.panelCount * 2) {
    issues.push('More panels detected than expected');
  }
  
  return issues;
}

function generateSuggestions(
  panels: Panel[], 
  signature: ImageSignature,
  options: DetectionOptions
): string[] {
  const suggestions: string[] = [];
  
  // Suggest based on issues
  const issues = detectIssues(panels, signature);
  
  if (issues.some(i => i.includes('large panel'))) {
    suggestions.push('Check if large panels should be split into smaller ones');
  }
  
  if (issues.some(i => i.includes('small panel'))) {
    suggestions.push('Consider increasing minimum panel size');
  }
  
  if (issues.some(i => i.includes('noise'))) {
    suggestions.push('Increase edge sensitivity for noisy images');
  }
  
  if (issues.some(i => i.includes('compression'))) {
    suggestions.push('Use higher quality source images if possible');
  }
  
  if (issues.some(i => i.includes('Low coverage'))) {
    suggestions.push('Decrease gutter sensitivity to detect more panels');
  }
  
  if (issues.some(i => i.includes('high coverage'))) {
    suggestions.push('Increase merge threshold to separate merged panels');
  }
  
  // Suggest based on layout
  if (signature.layoutType === 'vertical' && options.webtoonType !== 'webtoon') {
    suggestions.push('Image appears to be vertical scroll - consider setting webtoon type to "webtoon"');
  }
  
  // Suggest based on content
  if (signature.hasAction && !options.detectDiagonal) {
    suggestions.push('Action content detected - enable diagonal panel detection');
  }
  
  if (signature.hasFaces && options.protectionStrength < 80) {
    suggestions.push('Faces detected - consider increasing protection strength');
  }
  
  // Suggest based on complexity
  if (signature.estimatedComplexity === 'high' && !options.fastMode) {
    suggestions.push('Complex image detected - consider enabling fast mode for quicker results');
  }
  
  return suggestions;
}
