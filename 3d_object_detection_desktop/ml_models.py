import torch
import torchvision
from torchvision import transforms
from ultralytics import YOLO
from torchvision.models.detection import KeypointRCNN_ResNet50_FPN_Weights
from PIL import Image
from deepface import DeepFace

# Load models
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {device}")

# Object detection model (YOLOv8)
obj_model = YOLO('yolov8m.pt')

# Keypoint (pose) detection model (Heavy - conditionally run)
pose_model = torchvision.models.detection.keypointrcnn_resnet50_fpn(weights=KeypointRCNN_ResNet50_FPN_Weights.DEFAULT)
pose_model.eval()
pose_model.to(device)

# Colors for visualization
COLORS = [
    '#FF3838', '#FF9D97', '#FF701F', '#FFB21D', '#CFD231', '#48F21D', '#1FE045', '#1DFF70',
    '#1DFFB2', '#1D97FF', '#3838FF', '#9D97FF', '#FF1DFF', '#FF1D70', '#8E44AD', '#3498DB'
] * 6

def perform_object_detection(image_pil, threshold=0.5):
    # Note: obj_model.predict handles device placement automatically.
    predictions = obj_model.predict(source=image_pil, device=device)
    detected_objects_data = []
    for box in predictions[0].boxes:
        score = box.conf.item()
        if score > threshold:
            class_id = int(box.cls.item())
            class_name = obj_model.names[class_id]
            x1, y1, x2, y2 = [int(i) for i in box.xyxy[0]]
            detected_objects_data.append({
                "class_name": class_name,
                "score": score,
                "box": [x1, y1, x2, y2],
                "color": COLORS[class_id % len(COLORS)]
            })
    return detected_objects_data

def perform_pose_estimation(img_tensor):
    with torch.no_grad():
        # Move tensor to the correct device
        img_tensor = img_tensor.to(device)
        pose_predictions = pose_model(img_tensor)
    poses_data = []
    for prediction in pose_predictions:
        # Move results back to CPU for post-processing if they are on GPU
        scores = prediction['scores'].cpu()
        if scores.shape[0] > 0 and scores[0] > 0.8:
            keypoints = prediction['keypoints'].cpu()[0].int().tolist()
            poses_data.append({
                "keypoints": keypoints,
                "score": float(scores[0].item())
            })
    return poses_data

def perform_emotion_detection(filepath):
    emotions_data = []
    try:
        # DeepFace.analyze has its own device handling, often CPU-based for some backends
        emotion_results = DeepFace.analyze(img_path=filepath, actions=['emotion'], enforce_detection=False)
        for result in emotion_results:
            if result['face_confidence'] > 0.2:
                emotions_data.append({
                    "emotion": result['dominant_emotion'],
                    "box": [result['region']['x'], result['region']['y'], result['region']['w'], result['region']['h']]
                })
    except Exception as e:
        print(f"Emotion detection error: {e}")
    return emotions_data
