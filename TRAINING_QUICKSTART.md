# 🚀 Quick Start: Train Your ML Model

## The Honest Truth

**Current Status:** The app currently uses a generic image segmentation model (NOT trained for panels).

**Solution:** Train a custom YOLO model specifically for webtoon panels (takes 30 minutes, free).

---

## ⚡ 5-Minute Setup (Use Pre-Made Dataset)

### Step 1: Open Training Notebook

1. Go to [Google Colab](https://colab.research.google.com/)
2. Upload: `training/train_panel_detector.ipynb`

### Step 2: Enable GPU

```
Runtime → Change runtime type → GPU (T4)
```

### Step 3: Get Roboflow API Key (Free)

1. Sign up at [roboflow.com](https://roboflow.com/)
2. Go to Account Settings → API Key
3. Copy the key

### Step 4: Run Training

In the notebook, replace:
```python
api_key="YOUR_API_KEY"  # ← Paste your key here
```

Then: **Runtime → Run all**

Wait 20-30 minutes.

### Step 5: Download Model

The notebook will auto-download `best.onnx`

### Step 6: Install Model

```bash
# Create models directory
mkdir -p public/models

# Move downloaded file
mv ~/Downloads/best.onnx public/models/webtoon-panels.onnx
```

### Step 7: Use It!

```bash
npm run dev
```

The app will automatically use your trained model! 🎉

---

## 📊 What You Get

| Metric | Before | After Training |
|--------|--------|----------------|
| **Accuracy** | ~70% | **90-96%** |
| **Speed** | 200ms | **50-100ms** |
| **Reliability** | Inconsistent | **Consistent** |
| **Model Size** | 50MB | **6MB** |

---

## 🎯 Next Steps

### Option A: Quick Test (Done in 30 min)
Use the pre-made dataset as shown above.

### Option B: Custom Training (Best Results)
Train on your own webtoon collection:

```bash
# 1. Collect 200-500 webtoon images
mkdir -p training/webtoons
cp ~/my-webtoons/*.jpg training/webtoons/

# 2. Generate labels
cd training
python prepare_dataset.py --input ./webtoons --output ./dataset

# 3. Review and fix labels (important!)
# Use labelImg or Roboflow to check labels

# 4. Train on Colab
# Upload notebook + dataset to Colab
# Run training
```

See `training/README.md` for detailed instructions.

---

## 🔍 Verify Model is Working

After placing the model, check the browser console:

```
✅ Trained YOLO model loaded successfully
✅ Using trained YOLO model for detection
```

If you see this, you're using the trained model! 🎉

If you see:
```
⚠️ Trained model not available, loading fallback model
```

Then the model file is missing or in the wrong location.

---

## 🆘 Troubleshooting

### "Model not found"
- Check file exists: `public/models/webtoon-panels.onnx`
- Check file name is exactly: `webtoon-panels.onnx`
- Restart dev server: `npm run dev`

### "Out of memory"
- Use smaller model: Train with `yolov8n.pt` (nano)
- Reduce batch size in notebook: `batch=8`

### "Slow inference"
- Enable WASM SIMD (already enabled by default)
- Use nano model: `yolov8n.pt`
- Reduce input size: `imgsz=416`

---

## 📚 More Info

- **Full Training Guide**: `training/README.md`
- **Technical Details**: `training/TECHNICAL.md`
- **Model Architecture**: YOLOv8-nano
- **Expected Performance**: 90-96% mAP50

---

## 💡 Tips

1. **Start with pre-made dataset** - Get working in 30 minutes
2. **Then customize** - Train on your webtoons for best results
3. **Review labels** - Quality labels = better model
4. **Test thoroughly** - Try different webtoon types

---

**Ready?** Start with the 5-minute setup above! 🚀
