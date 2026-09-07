# 🎯 Kaggle Training Guide

## Overview

Train your webtoon panel detection model using **Kaggle's free GPU** (30 hours/week, T4 x2 GPUs).

**Advantages over Colab:**
- ✅ Longer session time (30 hours vs 12 hours)
- ✅ Dual T4 GPUs available
- ✅ Persistent storage (optional)
- ✅ Better for long training runs

---

## 🚀 Quick Start (10 Minutes)

### Step 1: Open Kaggle Notebook

1. Go to [Kaggle Notebooks](https://www.kaggle.com/notebooks)
2. Click **New Notebook**
3. Upload `training/train_kaggle.ipynb`

### Step 2: Enable GPU

1. Click **Settings** (right sidebar)
2. Under **Accelerator**, select **GPU T4 x2**
3. Confirm the change

### Step 3: Configure Training

Edit the configuration cell:

```python
# Choose model
MODEL_TYPE = 'rf-detr'  # or 'yolov11', 'rtdetr'
MODEL_SIZE = 'small'

# Dataset
USE_ROBOFLOW = True
ROBOFLOW_API_KEY = "your_key_here"  # Get from roboflow.com

# Training
EPOCHS = 100
BATCH_SIZE = 16
```

### Step 4: Run Training

1. Click **Run All** (or Shift+Enter on each cell)
2. Wait 30-60 minutes
3. Download `webtoon-panel-model.zip`

### Step 5: Install Model

```bash
unzip webtoon-panel-model.zip
mkdir -p public/models
mv webtoon-panels.onnx public/models/
```

---

## 📊 Model Options

### RF-DETR (Recommended) ⭐
**Roboflow's Detection Transformer (2025)**

```python
MODEL_TYPE = 'rf-detr'
MODEL_SIZE = 'small'  # or 'nano', 'medium'
```

**Performance:**
- Accuracy: 60.5 mAP @ 25 FPS (T4)
- Model size: ~6 MB
- Best for: Balance of speed and accuracy

**Pros:**
- ✅ State-of-the-art (2025)
- ✅ Real-time performance
- ✅ Excellent accuracy

**Cons:**
- ⚠️ Newer, less documentation
- ⚠️ Requires `rf-detr` package

---

### YOLOv11
**Latest YOLO (2024)**

```python
MODEL_TYPE = 'yolov11'
MODEL_SIZE = 's'  # or 'n', 'm'
```

**Performance:**
- Accuracy: 55-58 mAP @ 30 FPS
- Model size: ~7 MB
- Best for: Well-tested, reliable

**Pros:**
- ✅ Well-documented
- ✅ Large community
- ✅ Many tutorials

**Cons:**
- ⚠️ Slightly lower accuracy than RF-DETR

---

### RT-DETR
**Real-Time Detection Transformer**

```python
MODEL_TYPE = 'rtdetr'
MODEL_SIZE = 'rtdetr-l'  # or 'rtdetr-x'
```

**Performance:**
- Accuracy: 52-55 mAP @ 35 FPS
- Model size: ~8 MB
- Best for: Transformer-based detection

**Pros:**
- ✅ Transformer architecture
- ✅ Good accuracy

**Cons:**
- ⚠️ Larger model size
- ⚠️ Slower than YOLO

---

## 🎨 Dataset Options

### Option 1: Roboflow Dataset (Easiest)

1. Sign up at [roboflow.com](https://roboflow.com/) (free)
2. Get API key from Account Settings
3. Use pre-made comic panel dataset or upload your own

```python
USE_ROBOFLOW = True
ROBOFLOW_API_KEY = "your_key_here"
ROBOFLOW_WORKSPACE = "your-workspace"
ROBOFLOW_PROJECT = "webtoon-panel-detection"
ROBOFLOW_VERSION = 1
```

**Pros:**
- ✅ Easy setup
- ✅ Web-based labeling
- ✅ Automatic augmentation

**Cons:**
- ⚠️ Requires account
- ⚠️ Limited free tier

---

### Option 2: Kaggle Dataset

Use pre-made datasets from Kaggle:

```python
# In notebook cell
!kaggle datasets download -d andrewmvd/comic-panel-detection
!unzip comic-panel-detection.zip
```

**Pros:**
- ✅ Free datasets available
- ✅ No external account needed

**Cons:**
- ⚠️ May need format conversion
- ⚠️ Quality varies

---

### Option 3: Custom Dataset

Upload your own webtoon collection:

```python
USE_CUSTOM_DATASET = True
CUSTOM_DATASET_PATH = "/kaggle/input/your-dataset"
```

**Upload process:**
1. Click **Add Input** (right sidebar)
2. Upload your images
3. Update path in notebook

**Pros:**
- ✅ Tailored to your needs
- ✅ Highest accuracy

**Cons:**
- ⚠️ Requires labeling effort
- ⚠️ Need 200+ images

---

## ⚙️ Advanced Configuration

### Enable Advanced Features

```python
# Test Time Augmentation (+2-3% accuracy)
ENABLE_TTA = True

# Ensemble multiple models (+3-5% accuracy)
ENABLE_ENSEMBLE = True

# Soft NMS (better overlapping panels)
ENABLE_SOFT_NMS = True
```

### Training Hyperparameters

```python
EPOCHS = 100        # More = better (but slower)
BATCH_SIZE = 16     # Reduce to 8 if OOM
IMAGE_SIZE = 640    # Standard size
PATIENCE = 20       # Early stopping
```

### Learning Rate Tuning

```python
# In training cell
model.train(
    # ... other params
    lr=0.0001,           # Lower = more stable
    weight_decay=0.0001, # Regularization
    warmup_epochs=5,     # Gradual start
)
```

---

## 📈 Training Tips

### For Best Accuracy

1. **Use RF-DETR medium** (larger model)
2. **Train for 150 epochs**
3. **Enable TTA**
4. **Use 500+ images**
5. **Enable augmentation**

```python
MODEL_TYPE = 'rf-detr'
MODEL_SIZE = 'medium'
EPOCHS = 150
ENABLE_TTA = True
```

### For Fastest Training

1. **Use RF-DETR nano** (smallest model)
2. **Train for 50 epochs**
3. **Reduce image size**

```python
MODEL_TYPE = 'rf-detr'
MODEL_SIZE = 'nano'
EPOCHS = 50
IMAGE_SIZE = 416
```

### For Balance

1. **Use RF-DETR small**
2. **Train for 100 epochs**
3. **Standard settings**

```python
MODEL_TYPE = 'rf-detr'
MODEL_SIZE = 'small'
EPOCHS = 100
IMAGE_SIZE = 640
```

---

## 🔧 Troubleshooting

### Out of Memory (OOM)

**Solution 1:** Reduce batch size
```python
BATCH_SIZE = 8  # or 4
```

**Solution 2:** Use smaller model
```python
MODEL_SIZE = 'nano'  # or 'small'
```

**Solution 3:** Reduce image size
```python
IMAGE_SIZE = 416
```

---

### Low Accuracy

**Solution 1:** Train longer
```python
EPOCHS = 150  # or 200
```

**Solution 2:** Add more data
- Aim for 500+ images
- Diverse layouts and styles

**Solution 3:** Enable augmentation
```python
model.train(
    # ... other params
    augment=True,
    mosaic=1.0,
    mixup=0.1,
)
```

---

### Slow Training

**Solution 1:** Use smaller model
```python
MODEL_SIZE = 'nano'
```

**Solution 2:** Reduce epochs
```python
EPOCHS = 50
```

**Solution 3:** Reduce image size
```python
IMAGE_SIZE = 416
```

---

### Model Not Downloading

**Solution:** Check output directory
```python
# In download cell
print(os.listdir('./output'))
```

If empty, check training logs for errors.

---

## 📊 Expected Results

### With Roboflow Dataset (Pre-made)
- **Training time:** 30-45 minutes
- **Accuracy:** 85-90% mAP50
- **Model size:** ~6 MB

### With Custom Dataset (500 images)
- **Training time:** 45-60 minutes
- **Accuracy:** 90-95% mAP50
- **Model size:** ~6 MB

### With Advanced Features
- **Training time:** 60-90 minutes
- **Accuracy:** 92-96% mAP50
- **Model size:** ~6 MB

---

## 🎯 Kaggle vs Colab Comparison

| Feature | Kaggle | Colab |
|---------|--------|-------|
| **GPU Time** | 30 hours/week | 12 hours/session |
| **GPU Type** | T4 x2 | T4 |
| **Storage** | 20 GB persistent | 100 GB temporary |
| **Session Length** | Up to 12 hours | Up to 12 hours |
| **Internet Access** | ✅ Yes | ✅ Yes |
| **Ease of Use** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Best For** | Long training | Quick experiments |

**Recommendation:**
- **Quick training (< 1 hour):** Use Colab
- **Long training (> 1 hour):** Use Kaggle
- **Multiple experiments:** Use Kaggle (more GPU time)

---

## 📚 Complete Workflow

### 1. Prepare Dataset (Local)
```bash
# Collect 200-500 webtoon images
mkdir -p webtoons
cp ~/my-webtoons/*.jpg webtoons/

# Generate labels
cd training
python prepare_dataset.py --input ./webtoons --output ./dataset
```

### 2. Upload to Kaggle
1. Go to Kaggle Notebooks
2. Upload `train_kaggle.ipynb`
3. Upload dataset via "Add Input"

### 3. Train Model
1. Enable GPU T4 x2
2. Configure settings
3. Run all cells
4. Wait 30-60 minutes

### 4. Download & Install
```bash
# Download webtoon-panel-model.zip
unzip webtoon-panel-model.zip
mkdir -p public/models
mv webtoon-panels.onnx public/models/
```

### 5. Use in App
```bash
npm run dev
# App automatically uses trained model!
```

---

## 💡 Pro Tips

### Tip 1: Version Your Models
Save different training runs:
```python
# Change output directory
model.train(..., project=f"./runs/experiment_{date}")
```

### Tip 2: Use Checkpoints
Resume training if interrupted:
```python
model.train(..., resume=True)
```

### Tip 3: Monitor Training
Watch metrics in real-time:
```python
# Training logs show mAP, loss, etc.
# Check every 10 epochs
```

### Tip 4: Ensemble Multiple Runs
Train 3 models with different seeds:
```python
for seed in [42, 123, 456]:
    model.train(..., seed=seed, project=f"./runs/seed_{seed}")
```

### Tip 5: Use Kaggle Datasets
Find pre-labeled datasets:
```bash
!kaggle datasets list -s "comic panel"
```

---

## 🎉 Success Checklist

After training, verify:

- [ ] Model downloaded successfully
- [ ] ONNX file is ~6 MB
- [ ] mAP50 > 85%
- [ ] Inference works in browser
- [ ] Accuracy improved over CV-only

---

## 📞 Getting Help

### Kaggle Documentation
- [Kaggle Notebooks Guide](https://www.kaggle.com/docs/notebooks)
- [GPU Usage](https://www.kaggle.com/docs/gpu)

### Model Training
- [Ultralytics Docs](https://docs.ultralytics.com/)
- [RF-DETR Docs](https://github.com/roboflow/rf-detr)

### Community
- [Kaggle Forums](https://www.kaggle.com/discussions)
- [Ultralytics Discord](https://discord.gg/ultralytics)

---

## 🚀 Next Steps

1. **Train your first model** (30 minutes)
2. **Test in app** (verify accuracy)
3. **Iterate** (add more data, adjust params)
4. **Deploy** (use in production)

---

**Ready to train on Kaggle?** Open `training/train_kaggle.ipynb` and start training! 🎯
