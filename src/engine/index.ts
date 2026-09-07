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
 */

export * from './types';
export * from './cv';
export * from './vision';
export * from './hybrid';

// Convenience re-exports
export { detectPanels, exportPanelAsBlob, initializeVisionModel, isModelLoaded } from './hybrid';
