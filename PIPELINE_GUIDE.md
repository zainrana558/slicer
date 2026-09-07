# Quick Start Guide - Pipeline Integration

## For Pipeline Users

This tool is designed to be used in automated pipelines. Here's how to get started:

### 1. Install Dependencies

```bash
npm install
```

### 2. Basic Usage

```bash
# Process a single image
npx ts-node src/cli.ts your-image.jpg -o output/

# Process a directory of images
npx ts-node src/cli.ts images/ -o panels/ --batch
```

### 3. Recommended Settings for Production

For **maximum accuracy** (slower):
```bash
npx ts-node src/cli.ts input/ -o output/ --batch \
  --strategy hybrid \
  --webtoon-type auto \
  --gutter-sensitivity 70 \
  --content-awareness 80 \
  --protection-strength 85
```

For **fast processing** (good accuracy):
```bash
npx ts-node src/cli.ts input/ -o output/ --batch \
  --strategy cv \
  --gutter-sensitivity 65
```

### 4. JSON Output for Integration

```bash
npx ts-node src/cli.ts input/ -o output/ --batch --json > results.json
```

Output format:
```json
{
  "totalFiles": 10,
  "successCount": 10,
  "errorCount": 0,
  "totalTime": 45230,
  "results": [
    {
      "file": "chapter001.jpg",
      "panels": [
        {
          "id": "panel-0",
          "x": 10,
          "y": 20,
          "width": 800,
          "height": 600,
          "confidence": 0.92,
          "type": "standard"
        }
      ],
      "processingTime": 4523,
      "strategy": "hybrid",
      "imageWidth": 1000,
      "imageHeight": 1500
    }
  ]
}
```

### 5. Programmatic Usage (Node.js)

```typescript
import { detectPanels, initializeVisionModel, DEFAULT_OPTIONS } from './engine';
import sharp from 'sharp';

async function processImage(imagePath: string, outputPath: string) {
  // Initialize ML model (one-time, cached after)
  await initializeVisionModel();
  
  // Load image
  const { data, info } = await sharp(imagePath)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  
  const imageData = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
  
  // Detect panels
  const result = await detectPanels(imageData as any, {
    ...DEFAULT_OPTIONS,
    strategy: 'hybrid',
  });
  
  // Export panels
  for (let i = 0; i < result.panels.length; i++) {
    const panel = result.panels[i];
    await sharp(imagePath)
      .extract({
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
      })
      .toFile(`${outputPath}/panel_${i}.png`);
  }
  
  return result;
}
```

### 6. Docker Usage (Optional)

Create a `Dockerfile`:
```dockerfile
FROM node:18-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENTRYPOINT ["npx", "ts-node", "src/cli.ts"]
```

Build and run:
```bash
docker build -t webtoon-slicer .
docker run -v $(pwd)/input:/input -v $(pwd)/output:/output \
  webtoon-slicer /input -o /output --batch
```

### 7. Performance Tips

- **Use CV strategy** for batch processing when speed is critical
- **Use Hybrid strategy** for best accuracy on complex layouts
- **Process images in parallel** using multiple instances
- **Resize large images** before processing (e.g., max 2000px on longest side)
- **Cache the ML model** - it downloads once (~50MB) then runs from cache

### 8. Common Issues

**Issue**: ML model fails to load
- **Solution**: Check internet connection for first download, then it's cached

**Issue**: Too many small panels detected
- **Solution**: Increase `--min-width` and `--min-height`

**Issue**: Panels cutting through content
- **Solution**: Increase `--protection-strength` to 90+

**Issue**: Slow processing
- **Solution**: Use `--strategy cv` for 3-5x speed improvement

### 9. Example Pipeline Script

```bash
#!/bin/bash
# process-webtoon.sh

INPUT_DIR=$1
OUTPUT_DIR=$2

if [ -z "$INPUT_DIR" ] || [ -z "$OUTPUT_DIR" ]; then
  echo "Usage: $0 <input-dir> <output-dir>"
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Process all images
npx ts-node src/cli.ts "$INPUT_DIR" -o "$OUTPUT_DIR" \
  --batch \
  --strategy hybrid \
  --format png \
  --quality 95 \
  --json > "$OUTPUT_DIR/metadata.json"

echo "✓ Processing complete!"
echo "  Output: $OUTPUT_DIR"
echo "  Metadata: $OUTPUT_DIR/metadata.json"
```

### 10. Integration with Other Tools

**With ImageMagick** (post-processing):
```bash
# Slice panels
npx ts-node src/cli.ts input/ -o panels/ --batch

# Optimize panels
for panel in panels/*.png; do
  convert "$panel" -resize 800x -strip -interlace Plane -quality 85% "optimized/$(basename "$panel")"
done
```

**With FFmpeg** (create video from panels):
```bash
# Slice panels
npx ts-node src/cli.ts chapter.jpg -o panels/ --batch

# Create slideshow video
ffmpeg -framerate 2 -i panels/panel_%03d.png -c:v libx264 -pix_fmt yuv420p output.mp4
```

## Support

For issues or questions, check the main README.md or open an issue on GitHub.
