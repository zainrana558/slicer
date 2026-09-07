/**
 * Webtoon Panel Slicer - Node.js Library Entry Point
 * 
 * Usage:
 *   const { detectPanels, initializeVisionModel } = require('./lib');
 *   
 *   // or
 *   
 *   import { detectPanels, initializeVisionModel } from './lib';
 */

// Re-export everything from the engine
export * from './engine';

// Export version
export const VERSION = '1.0.0';
