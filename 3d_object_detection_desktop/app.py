from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
import cv2
from PIL import Image
from bson.objectid import ObjectId
import datetime
import json
import hashlib
import aiofiles
from typing import Optional
from torchvision import transforms
from dotenv import load_dotenv

# Custom modules
from db import collection
from ml_models import (
    perform_object_detection, 
    perform_pose_estimation, 
    perform_emotion_detection
)

load_dotenv()

# Check for required environment variables
required_env_vars = ["MONGO_URI", "DATABASE_NAME", "COLLECTION_NAME", "UPLOAD_FOLDER"]
for var in required_env_vars:
    if not os.getenv(var):
        raise ValueError(f"Missing required environment variable: {var}")

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")
templates.env.filters['tojson'] = json.dumps

UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER")
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    # Get top 5 most common objects from analytics
    pipeline = [
        {"$unwind": "$detected_objects"},
        {"$group": {"_id": "$detected_objects.class_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    top_objects = list(collection.aggregate(pipeline))
    return templates.TemplateResponse("index.html", {"request": request, "top_objects": top_objects})

@app.post("/upload")
async def upload_file(
    request: Request, 
    file: UploadFile = File(...),
    detect_objects: Optional[str] = Form(None),
    detect_poses: Optional[str] = Form(None),
    detect_emotions: Optional[str] = Form(None),
    confidence_threshold: int = Form(60)
):
    filename = file.filename
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()

    # Check for a cached result that matches the request
    if detect_objects or detect_poses or detect_emotions:
        cache_query = {"file_hash": file_hash}
        if detect_objects:
            cache_query["detected_objects"] = {"$exists": True}
        if detect_poses:
            cache_query["poses"] = {"$exists": True}
        if detect_emotions:
            cache_query["emotions"] = {"$exists": True}
        
        cached_record = collection.find_one(cache_query)
        if cached_record:
            cached_record['_id'] = str(cached_record['_id'])
            response_data = {
                "result_image": f"/uploads/{cached_record.get('result_filename', filename)}",
                "detected_objects": cached_record.get("detected_objects"),
                "poses": cached_record.get("poses"),
                "emotions": cached_record.get("emotions"),
                "record_id": cached_record['_id'],
                "cached": True
            }
            return JSONResponse(content=response_data)

    # If no suitable cache, proceed with processing
    async with aiofiles.open(filepath, 'wb') as out_file:
        await out_file.write(content)

    try:
        image_cv = cv2.imread(filepath)
        if image_cv is None:
            return JSONResponse(status_code=400, content={"error": "Could not read image file."})
        image_rgb = cv2.cvtColor(image_cv, cv2.COLOR_BGR2RGB)

        response_data = {"result_image": f"/uploads/{filename}"}
        db_record = {
            "filename": filename,
            "result_filename": filename,
            "timestamp": datetime.datetime.utcnow(),
            "file_hash": file_hash
        }

        # Run analyses with isolated image objects to prevent library conflicts
        if detect_objects:
            image_pil_for_obj = Image.fromarray(image_rgb)
            threshold_float = confidence_threshold / 100.0
            detected_objects_data = perform_object_detection(image_pil_for_obj, threshold=threshold_float)
            response_data["detected_objects"] = detected_objects_data
            db_record["detected_objects"] = detected_objects_data

        if detect_emotions:
            emotions_data = perform_emotion_detection(filepath)
            response_data["emotions"] = emotions_data
            db_record["emotions"] = emotions_data

        if detect_poses:
            image_pil_for_pose = Image.fromarray(image_rgb)
            transform = transforms.Compose([transforms.ToTensor()])
            img_tensor = transform(image_pil_for_pose).unsqueeze(0)
            poses_data = perform_pose_estimation(img_tensor)
            response_data["poses"] = poses_data
            db_record["poses"] = poses_data

        if detect_objects or detect_poses or detect_emotions:
            result = collection.insert_one(db_record)
            response_data["record_id"] = str(result.inserted_id)

        return JSONResponse(content=response_data)

    except Exception as e:
        print(f"Processing error: {e}")
        return JSONResponse(status_code=500, content={"error": "Processing failed"})

@app.post("/verify_detection")
async def verify_detection(request: Request):
    data = await request.json()
    record_id = data.get("record_id")
    object_index = data.get("object_index")

    if not record_id or object_index is None:
        return JSONResponse(status_code=400, content={"error": "Missing record_id or object_index"})

    collection.update_one(
        {"_id": ObjectId(record_id)},
        {"$set": {f"detected_objects.{object_index}.verified": True}}
    )
    
    return JSONResponse(content={"status": "success"})


@app.get("/history", response_class=HTMLResponse)
async def history(request: Request, search: Optional[str] = None):
    query = {}
    if search and search.strip():
        query = {"detected_objects.class_name": {"$regex": search.strip(), "$options": "i"}}
    
    records = list(collection.find(query).sort("timestamp", -1).limit(50))
    
    all_object_names = collection.distinct("detected_objects.class_name")

    return templates.TemplateResponse("history.html", {
        "request": request, 
        "records": records,
        "all_object_names": sorted(all_object_names),
        "search_term": search
    })

@app.post("/history/clear")
async def clear_history():
    try:
        # Find all records to get filenames for deletion
        records_to_delete = list(collection.find({}, {"result_filename": 1}))
        
        # 1. Delete records from MongoDB
        result = collection.delete_many({})
        
        # 2. Delete associated files from upload folder
        deleted_files = 0
        for record in records_to_delete:
            if 'result_filename' in record:
                file_path = os.path.join(UPLOAD_FOLDER, record['result_filename'])
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        deleted_files += 1
                    except OSError as e:
                        print(f"Error deleting file {file_path}: {e}")

        return JSONResponse(content={"status": "success", "deleted_count": result.deleted_count, "deleted_files": deleted_files})
    except Exception as e:
        print(f"Error clearing history: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": "Failed to clear history"})

@app.get("/analytics", response_class=HTMLResponse)
async def analytics(request: Request):
    pipeline = [
        {"$match": {"detected_objects": {"$exists": True, "$ne": []}}},
        {"$unwind": "$detected_objects"},
        {"$group": {"_id": "$detected_objects.class_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    analytics_data = list(collection.aggregate(pipeline))
    return templates.TemplateResponse("analytics.html", {"request": request, "analytics": analytics_data})

@app.get("/uploads/{filename}")
async def get_upload(filename: str):
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return HTMLResponse(status_code=404, content="File not found")


@app.get("/base")
async def get_base(request: Request):
    return templates.TemplateResponse("base.html", {"request": request})

@app.get("/result")
async def result(request: Request):
    return templates.TemplateResponse("result.html", {"request": request})
