#!/usr/bin/env node
/**
 * Webtoon Panel Slicer CLI
 * 
 * Pipeline-friendly tool for batch processing webtoon images
 * 
 * Usage:
 *   webtoon-slicer <input> [options]
 * 
 * Examples:
 *   webtoon-slicer image.jpg -o output/
 *   webtoon-slicer *.jpg --strategy hybrid --format png
 *   webtoon-slicer input/ -o output/ --batch
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { detectPanels, initializeVisionModel, DetectionOptions, DEFAULT_OPTIONS, SliceResult } from './engine';

const program = new Command();

program
  .name('webtoon-slicer')
  .description('Advanced webtoon panel slicer with AI vision capabilities')
  .version('1.0.0')
  .argument('<input>', 'Input image file or directory')
  .option('-o, --output <dir>', 'Output directory', './sliced')
  .option('-f, --format <format>', 'Output format (png, jpeg, webp)', 'png')
  .option('-q, --quality <number>', 'Output quality (1-100)', '95')
  .option('-s, --strategy <strategy>', 'Detection strategy (cv, ml, hybrid)', 'hybrid')
  .option('--webtoon-type <type>', 'Webtoon type (manhwa, manga, manhua, vertical, auto)', 'auto')
  .option('--gutter-sensitivity <number>', 'Gutter detection sensitivity (0-100)', '65')
  .option('--edge-sensitivity <number>', 'Edge detection sensitivity (0-100)', '60')
  .option('--content-awareness <number>', 'Content awareness level (0-100)', '75')
  .option('--min-width <number>', 'Minimum panel width in pixels', '80')
  .option('--min-height <number>', 'Minimum panel height in pixels', '100')
  .option('--max-panels <number>', 'Maximum panels to detect', '50')
  .option('--no-protect-faces', 'Disable face protection')
  .option('--no-protect-text', 'Disable text protection')
  .option('--no-protect-bubbles', 'Disable speech bubble protection')
  .option('--protection-strength <number>', 'Content protection strength (0-100)', '80')
  .option('--no-diagonal', 'Disable diagonal panel detection')
  .option('--no-borderless', 'Disable borderless panel detection')
  .option('--no-inset', 'Disable inset panel detection')
  .option('--no-bleed', 'Disable bleed panel detection')
  .option('--merge-threshold <number>', 'Panel merge threshold (0-100)', '15')
  .option('--json', 'Output detection results as JSON')
  .option('--verbose', 'Verbose output')
  .option('--batch', 'Process all images in input directory')
  .action(async (input: string, opts: any) => {
    try {
      await runCLI(input, opts);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function runCLI(input: string, opts: any) {
  const startTime = performance.now();
  
  // Build options
  const options: DetectionOptions = {
    ...DEFAULT_OPTIONS,
    strategy: opts.strategy as 'cv' | 'ml' | 'hybrid',
    webtoonType: opts.webtoonType as any,
    gutterSensitivity: parseInt(opts.gutterSensitivity),
    edgeSensitivity: parseInt(opts.edgeSensitivity),
    contentAwareness: parseInt(opts.contentAwareness),
    minPanelWidth: parseInt(opts.minWidth),
    minPanelHeight: parseInt(opts.minHeight),
    maxPanelCount: parseInt(opts.maxPanels),
    protectFaces: opts.protectFaces !== false,
    protectText: opts.protectText !== false,
    protectBubbles: opts.protectBubbles !== false,
    protectionStrength: parseInt(opts.protectionStrength),
    detectDiagonal: opts.diagonal !== false,
    detectBorderless: opts.borderless !== false,
    detectInset: opts.inset !== false,
    detectBleed: opts.bleed !== false,
    mergeThreshold: parseInt(opts.mergeThreshold),
  };
  
  // Initialize ML model if using ML or hybrid strategy
  if (options.strategy === 'ml' || options.strategy === 'hybrid') {
    if (opts.verbose) console.log('Loading ML model...');
    await initializeVisionModel((progress) => {
      if (opts.verbose) process.stdout.write(`\rLoading model: ${progress.toFixed(1)}%`);
    });
    if (opts.verbose) console.log('\nModel loaded.');
  }
  
  // Get input files
  const inputPath = path.resolve(input);
  let files: string[] = [];
  
  if (opts.batch || fs.statSync(inputPath).isDirectory()) {
    // Process directory
    const entries = fs.readdirSync(inputPath);
    files = entries
      .filter(f => /\.(jpg|jpeg|png|webp|bmp)$/i.test(f))
      .map(f => path.join(inputPath, f));
  } else {
    // Single file
    files = [inputPath];
  }
  
  if (files.length === 0) {
    console.error('No image files found');
    process.exit(1);
  }
  
  if (opts.verbose) {
    console.log(`Processing ${files.length} file(s)...`);
    console.log(`Strategy: ${options.strategy}`);
    console.log(`Output: ${opts.output}`);
  }
  
  // Create output directory
  const outputDir = path.resolve(opts.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Process files
  const results: Map<string, SliceResult> = new Map();
  const errors: Map<string, Error> = new Map();
  
  for (const file of files) {
    try {
      if (opts.verbose) console.log(`\nProcessing: ${path.basename(file)}`);
      
      const result = await processFile(file, outputDir, options, opts);
      results.set(file, result);
      
      if (opts.verbose) {
        console.log(`  Found ${result.panels.length} panels in ${(result.processingTime / 1000).toFixed(2)}s`);
        if (result.metadata) {
          console.log(`  CV: ${result.metadata.cvPanels}, ML: ${result.metadata.mlPanels}, Merged: ${result.metadata.mergedPanels}`);
        }
      }
    } catch (error) {
      console.error(`Error processing ${path.basename(file)}:`, error instanceof Error ? error.message : error);
      errors.set(file, error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  // Output JSON if requested
  if (opts.json) {
    const jsonOutput = {
      totalFiles: files.length,
      successCount: results.size,
      errorCount: errors.size,
      totalTime: performance.now() - startTime,
      results: Array.from(results.entries()).map(([file, result]) => ({
        file: path.basename(file),
        panels: result.panels,
        processingTime: result.processingTime,
        strategy: result.strategy,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
        metadata: result.metadata,
      })),
      errors: Array.from(errors.entries()).map(([file, error]) => ({
        file: path.basename(file),
        error: error.message,
      })),
    };
    
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    // Summary
    const totalTime = performance.now() - startTime;
    console.log('\n' + '='.repeat(60));
    console.log('Processing Complete');
    console.log('='.repeat(60));
    console.log(`Files processed: ${results.size}/${files.length}`);
    console.log(`Total time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`Output directory: ${outputDir}`);
    
    if (results.size > 0) {
      const totalPanels = Array.from(results.values()).reduce((sum, r) => sum + r.panels.length, 0);
      const avgTime = Array.from(results.values()).reduce((sum, r) => sum + r.processingTime, 0) / results.size;
      console.log(`Total panels: ${totalPanels}`);
      console.log(`Average time per image: ${(avgTime / 1000).toFixed(2)}s`);
    }
    
    if (errors.size > 0) {
      console.log(`\nErrors: ${errors.size}`);
      for (const [file, error] of errors) {
        console.log(`  ${path.basename(file)}: ${error.message}`);
      }
    }
  }
}

async function processFile(
  file: string,
  outputDir: string,
  options: DetectionOptions,
  opts: any
): Promise<SliceResult> {
  // Load image
  const image = sharp(file);
  const metadata = await image.metadata();
  
  if (!metadata.width || !metadata.height) {
    throw new Error('Invalid image metadata');
  }
  
  // Convert to raw pixel data
  const { data, info } = await image
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  
  // Create ImageData-like object
  const imageData = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
  
  // Detect panels
  const result = await detectPanels(imageData as any, options);
  
  // Export panels
  const baseName = path.basename(file, path.extname(file));
  const format = opts.format as 'png' | 'jpeg' | 'webp';
  const quality = parseInt(opts.quality);
  
  for (let i = 0; i < result.panels.length; i++) {
    const panel = result.panels[i];
    const outputFile = path.join(outputDir, `${baseName}_panel_${String(i + 1).padStart(3, '0')}.${format}`);
    
    await sharp(file)
      .extract({
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
      })
      .toFormat(format, { quality })
      .toFile(outputFile);
  }
  
  return result;
}

program.parse();
