#!/usr/bin/env python3
"""
Dataset Preparation Script for Webtoon Panel Detection

This script helps you create a training dataset from your webtoon images.
It uses the existing CV-based detector to generate initial labels,
which you can then review and correct.

Usage:
    python prepare_dataset.py --input ./webtoons --output ./dataset
    
Requirements:
    pip install opencv-python pillow tqdm
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import List, Tuple
import cv2
import numpy as np
from PIL import Image
from tqdm import tqdm

# Add parent directory to path to import engine
sys.path.insert(0, str(Path(__file__).parent.parent))


def detect_panels_cv(image_path: str) -> List[Tuple[float, float, float, float]]:
    """
    Use CV-based detection to generate initial panel labels
    
    Returns:
        List of (x_center, y_center, width, height) normalized to 0-1
    """
    try:
        # Import the CV detector
        from src.engine.cv import detectPanelsCV
        from src.engine.types import DEFAULT_OPTIONS
        
        # Load image
        img = cv2.imread(image_path)
        if img is None:
            return []
        
        # Convert to ImageData format
        height, width = img.shape[:2]
        
        # Create options for detection
        options = DEFAULT_OPTIONS.copy()
        options['strategy'] = 'cv'
        options['fastMode'] = False
        
        # Detect panels (this is a simplified version)
        # In reality, you'd need to adapt the TypeScript code
        # For now, we'll use a basic approach
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Edge detection
        edges = cv2.Canny(gray, 50, 150)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Filter contours by area
        min_area = (width * height) * 0.01  # 1% of image
        panels = []
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > min_area:
                x, y, w, h = cv2.boundingRect(contour)
                
                # Convert to YOLO format (normalized)
                x_center = (x + w / 2) / width
                y_center = (y + h / 2) / height
                w_norm = w / width
                h_norm = h / height
                
                panels.append((x_center, y_center, w_norm, h_norm))
        
        return panels
    
    except Exception as e:
        print(f"Error processing {image_path}: {e}")
        return []


def create_yolo_label(image_path: str, output_dir: str, split: str = 'train'):
    """
    Create YOLO format label file for an image
    """
    # Detect panels
    panels = detect_panels_cv(image_path)
    
    if not panels:
        return False
    
    # Create label file
    image_name = Path(image_path).stem
    label_path = Path(output_dir) / 'labels' / split / f'{image_name}.txt'
    label_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(label_path, 'w') as f:
        for panel in panels:
            x_center, y_center, width, height = panel
            # YOLO format: class x_center y_center width height
            f.write(f'0 {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}\n')
    
    return True


def prepare_dataset(input_dir: str, output_dir: str, val_split: float = 0.2):
    """
    Prepare dataset in YOLO format
    
    Args:
        input_dir: Directory containing webtoon images
        output_dir: Output directory for dataset
        val_split: Fraction of images for validation
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    # Create directory structure
    (output_path / 'images' / 'train').mkdir(parents=True, exist_ok=True)
    (output_path / 'images' / 'val').mkdir(parents=True, exist_ok=True)
    (output_path / 'labels' / 'train').mkdir(parents=True, exist_ok=True)
    (output_path / 'labels' / 'val').mkdir(parents=True, exist_ok=True)
    
    # Get all images
    image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.webp']
    images = []
    for ext in image_extensions:
        images.extend(input_path.glob(ext))
        images.extend(input_path.glob(ext.upper()))
    
    if not images:
        print(f"No images found in {input_dir}")
        return
    
    print(f"Found {len(images)} images")
    
    # Shuffle and split
    import random
    random.shuffle(images)
    val_count = int(len(images) * val_split)
    val_images = images[:val_count]
    train_images = images[val_count:]
    
    print(f"Training: {len(train_images)} images")
    print(f"Validation: {len(val_images)} images")
    
    # Process images
    success_count = 0
    
    for split, split_images in [('train', train_images), ('val', val_images)]:
        print(f"\nProcessing {split} set...")
        
        for img_path in tqdm(split_images, desc=split):
            # Copy image
            import shutil
            dest = output_path / 'images' / split / img_path.name
            shutil.copy(img_path, dest)
            
            # Create label
            if create_yolo_label(str(img_path), str(output_path), split):
                success_count += 1
    
    # Create data.yaml
    data_yaml = {
        'path': str(output_path.absolute()),
        'train': 'images/train',
        'val': 'images/val',
        'nc': 1,  # Number of classes
        'names': ['panel']
    }
    
    yaml_path = output_path / 'data.yaml'
    with open(yaml_path, 'w') as f:
        import yaml
        yaml.dump(data_yaml, f)
    
    print(f"\n✅ Dataset created successfully!")
    print(f"Location: {output_path}")
    print(f"Images processed: {success_count}/{len(images)}")
    print(f"Config: {yaml_path}")
    print(f"\nNext steps:")
    print(f"1. Review labels in {output_path / 'labels'}")
    print(f"2. Correct any mislabeled panels")
    print(f"3. Upload to Roboflow or use directly with YOLO")


def main():
    parser = argparse.ArgumentParser(description='Prepare webtoon panel detection dataset')
    parser.add_argument('--input', type=str, required=True, help='Input directory with webtoon images')
    parser.add_argument('--output', type=str, default='./dataset', help='Output directory for dataset')
    parser.add_argument('--val-split', type=float, default=0.2, help='Validation split (0.0-1.0)')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"Error: Input directory {args.input} does not exist")
        sys.exit(1)
    
    prepare_dataset(args.input, args.output, args.val_split)


if __name__ == '__main__':
    main()
