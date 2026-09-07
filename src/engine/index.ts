/**
 * Webtoon Panel Slicer Engine
 * 
 * Advanced panel detection with human-level accuracy
 * Supports CV-based, ML-based, and hybrid detection strategies
 * 
 * Features:
 * - Multi-strategy detection (CV, ML, Hybrid)
 * - Content-aware protection (faces, text, speech bubbles)
 * - Handles all webtoon types (manhwa, manga, manhua, vertical scroll)
 * - Detects diagonal, borderless, inset, and bleed panels
 * - Runs locally without GPU (CPU/WASM optimized)
 * - Pipeline-friendly API
 * - Intelligent adaptive parameter tuning
 * - Panel content classification
 * - Quality scoring and optimization
 */

export * from './types';
export * from './cv';
export * from './vision';
export * from './hybrid';
export * from './intelligent';
export * from './advancedVision';
export * from './intelligentEngine';
export * from './trainedModel';

// Convenience re-exports
export { detectPanels, exportPanelAsBlob, initializeVisionModel, isModelLoaded } from './hybrid';
export { detectPanelsIntelligent } from './intelligentEngine';
export type { IntelligentResult } from './intelligentEngine';
export { loadTrainedModel, isTrainedModelLoaded, detectPanelsWithTrainedModel } from './trainedModel';
