# Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Run the Web Demo
```bash
npm run dev
```
Open http://localhost:5173 in your browser

### Step 3: Upload a Webtoon Image
- Click "Drop your webtoon image here" or browse
- Adjust settings if needed
- Click "Detect Panels"
- Export individual panels or all at once

---

## 📸 Example Usage

### CLI - Quick Test
```bash
# Process a single image
npx ts-node src/cli.ts test.jpg -o output/

# See what was detected
cat output/metadata.json
```

### CLI - Batch Processing
```bash
# Process all images in a folder
npx ts-node src/cli.ts webtoons/ -o panels/ --batch

# With maximum accuracy
npx ts-node src/cli.ts webtoons/ -o panels/ --batch \
  --strategy hybrid \
  --webtoon-type manhwa \
  --gutter-sensitivity 70 \
  --protection-strength 85
```

### Programmatic API
```typescript
import { detectPanels, initializeVisionModel, DEFAULT_OPTIONS } from './engine';
import sharp from 'sharp';

async function processWebtoon(imagePath: string) {
  // Load ML model (one-time, ~50MB download)
  await initializeVisionModel();
  
  // Load image
  const { data, info } = await sharp(imagePath)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  
  const imageData = {
     new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
  
  // Detect panels
  const result = await detectPanels(imageData as any, {
    ...DEFAULT_OPTIONS,
    strategy: 'hybrid',
    webtoonType: 'manhwa',
  });
  
  console.log(`Found ${result.panels.length} panels`);
  console.log(`Time: ${result.processingTime}ms`);
  
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
      .toFile(`panel_${i}.png`);
  }
}

processWebtoon('webtoon.jpg');
```

---

## ⚙️ Recommended Settings

### For Korean Manhwa (Vertical Scroll)
```bash
--strategy hybrid \
--webtoon-type manhwa \
--gutter-sensitivity 65 \
--edge-sensitivity 60 \
--content-awareness 75 \
--protection-strength 80 \
--detect-diagonal \
--detect-borderless
```

### For Japanese Manga (Traditional)
```bash
--strategy hybrid \
--webtoon-type manga \
--gutter-sensitivity 70 \
--edge-sensitivity 65 \
--content-awareness 80 \
--protection-strength 85
```

### For Maximum Speed (CV Only)
```bash
--strategy cv \
--gutter-sensitivity 60 \
--no-watershed \
--no-superpixels \
--no-active-contours
```

### For Maximum Accuracy
```bash
--strategy hybrid \
--gutter-sensitivity 75 \
--edge-sensitivity 70 \
--content-awareness 85 \
--protection-strength 90 \
--use-watershed \
--use-superpixels \
--use-active-contours \
--use-hierarchical \
--refine-boundaries \
--snap-to-edges
```

---

## 🎯 Common Tasks

### Task 1: Extract All Panels from a Chapter
```bash
npx ts-node src/cli.ts chapter001.jpg -o panels/ --batch
```

### Task 2: Process Multiple Chapters
```bash
npx ts-node src/cli.ts chapters/ -o extracted/ --batch --json > results.json
```

### Task 3: Verify Detection Quality
```bash
# Run with verbose output
npx ts-node src/cli.ts test.jpg -o output/ --verbose

# Check metadata
cat output/metadata.json | jq '.results[0].panels | length'
```

### Task 4: Integrate with Image Processing Pipeline
```bash
# Step 1: Detect panels
npx ts-node src/cli.ts input/ -o panels/ --batch --json > detection.json

# Step 2: Extract panel info
cat detection.json | jq -r '.results[].panels[] | "\(.x),\(.y),\(.width),\(.height)"' > panel_coords.txt

# Step 3: Process panels (example: resize)
while read coords; do
  IFS=',' read -r x y w h <<< "$coords"
  # Your processing here
done < panel_coords.txt
```

### Task 5: Docker Deployment
```bash
# Build image
docker build -t webtoon-slicer .

# Run on a folder
docker run -v $(pwd)/input:/input -v $(pwd)/output:/output \
  webtoon-slicer /input -o /output --batch
```

---

## 🔍 Troubleshooting

### Problem: Too few panels detected
**Solution**: Lower gutter sensitivity
```bash
--gutter-sensitivity 50
```

### Problem: Too many small panels detected
**Solution**: Increase minimum panel size
```bash
--min-width 100 --min-height 120
```

### Problem: Cutting through text/faces
**Solution**: Increase protection strength
```bash
--protection-strength 90
```

### Problem: Missing diagonal panels
**Solution**: Ensure diagonal detection is enabled
```bash
--detect-diagonal
```

### Problem: Slow processing
**Solution**: Use CV-only strategy
```bash
--strategy cv
```

### Problem: ML model won't load
**Solution**: Check internet connection (first run downloads ~50MB)
```bash
# Or use CV-only
--strategy cv
```

---

## 📊 Understanding Output

### JSON Output Structure
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
      "imageHeight": 1500,
      "metadata": {
        "cvPanels": 15,
        "mlPanels": 14,
        "mergedPanels": 12,
        "protectedCuts": 3,
        "techniquesUsed": ["cv", "ml", "fusion"],
        "confidenceAvg": 0.87
      }
    }
  ]
}
```

### Panel Types
- `standard` - Regular rectangular panel
- `diagonal` - Tilted/rotated panel
- `borderless` - No visible border
- `inset` - Small panel overlaid on another
- `bleed` - Extends to page edge
- `full-width` - Spans entire width
- `split` - Vertically split panel

### Confidence Scores
- `0.9+` - Very high confidence (clear borders)
- `0.7-0.9` - High confidence (good detection)
- `0.5-0.7` - Medium confidence (may need review)
- `<0.5` - Low confidence (likely false positive)

---

## 🎨 Web Demo Features

### Upload
- Drag & drop or click to browse
- Supports JPG, PNG, WEBP
- Any image size

### Settings Panel
- **Strategy**: CV, ML, or Hybrid
- **Webtoon Type**: Auto, Manhwa, Manga, Manhua, Vertical
- **Sensitivity**: Gutter, Edge, Content Awareness
- **Protection**: Faces, Text, Bubbles
- **Advanced**: Watershed, Superpixels, Active Contours, etc.

### Visualization
- See detected panels overlaid on image
- Click panels to see details
- Zoom in/out for inspection

### Export
- Export individual panels
- Export all panels at once
- PNG format with original quality

---

## 💡 Pro Tips

### Tip 1: Start with Hybrid Strategy
Hybrid gives best results for most cases. Only switch to CV-only if you need speed.

### Tip 2: Tune for Your Content
Different webtoons have different styles. Adjust sensitivity based on:
- Gutter width (thick vs thin)
- Border style (clear vs subtle)
- Panel density (sparse vs packed)

### Tip 3: Use Protection Wisely
- High protection (80-90) for dialogue-heavy pages
- Lower protection (60-70) for action scenes with few bubbles

### Tip 4: Batch Process Efficiently
```bash
# Process in parallel (if you have multiple cores)
for dir in chapters/*/; do
  npx ts-node src/cli.ts "$dir" -o "output/$(basename "$dir")/" --batch &
done
wait
```

### Tip 5: Validate Results
Always check a few samples before batch processing:
```bash
# Test on 5 random images
ls images/*.jpg | shuf -n 5 | xargs -I {} npx ts-node src/cli.ts {} -o test/ --verbose
```

---

## 📚 Learn More

- **Full Documentation**: README.md
- **Pipeline Integration**: PIPELINE_GUIDE.md
- **Advanced Techniques**: ADVANCED_TECHNIQUES.md
- **Achievement Summary**: ACHIEVEMENT_SUMMARY.md

---

## 🆘 Need Help?

1. Check the documentation files
2. Review example code in src/test.ts and src/cli.ts
3. Adjust parameters based on your content
4. Try different strategies (CV vs ML vs Hybrid)

---

**Happy Panel Slicing! 🎉**
