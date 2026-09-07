/**
 * Quick test script for the panel slicer
 * Run with: npx ts-node src/test.ts <image-path>
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { detectPanels, initializeVisionModel, DEFAULT_OPTIONS } from './engine';

async function test(imagePath: string) {
  console.log('🔧 Webtoon Panel Slicer - Test');
  console.log('='.repeat(50));
  
  // Load image
  console.log(`\n📷 Loading image: ${imagePath}`);
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  console.log(`   Size: ${metadata.width}x${metadata.height}`);
  
  // Convert to raw pixels
  const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const imageData = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
  
  // Initialize ML model
  console.log('\n🧠 Loading ML model...');
  await initializeVisionModel((progress) => {
    process.stdout.write(`\r   Progress: ${progress.toFixed(1)}%`);
  });
  console.log('\n   ✓ Model loaded');
  
  // Detect panels with different strategies
  const strategies = ['cv', 'ml', 'hybrid'] as const;
  
  for (const strategy of strategies) {
    console.log(`\n🔍 Testing ${strategy.toUpperCase()} strategy...`);
    const options = { ...DEFAULT_OPTIONS, strategy };
    
    const startTime = performance.now();
    const result = await detectPanels(imageData as any, options);
    const elapsed = performance.now() - startTime;
    
    console.log(`   Panels found: ${result.panels.length}`);
    console.log(`   Time: ${elapsed.toFixed(0)}ms`);
    console.log(`   Strategy: ${result.strategy}`);
    
    if (result.metadata) {
      console.log(`   CV panels: ${result.metadata.cvPanels}`);
      console.log(`   ML panels: ${result.metadata.mlPanels}`);
      console.log(`   Merged: ${result.metadata.mergedPanels}`);
    }
    
    // Show panel details
    console.log('\n   Panel details:');
    result.panels.forEach((panel, i) => {
      console.log(`   [${i + 1}] ${panel.type.padEnd(12)} ${panel.width}x${panel.height} @ (${panel.x},${panel.y}) conf:${(panel.confidence * 100).toFixed(0)}%`);
    });
  }
  
  console.log('\n✅ Test complete!');
}

// Run
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: npx ts-node src/test.ts <image-path>');
  process.exit(1);
}

test(args[0]).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
