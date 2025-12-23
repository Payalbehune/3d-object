import pymongo
import os
from dotenv import load_dotenv

load_dotenv()

# Check for required environment variables
required_db_vars = ["MONGO_URI", "DATABASE_NAME", "COLLECTION_NAME"]
for var in required_db_vars:
    if not os.getenv(var):
        raise ValueError(f"Missing required database environment variable: {var}")

# MongoDB
mongo_client = pymongo.MongoClient(os.getenv("MONGO_URI"))
db = mongo_client[os.getenv("DATABASE_NAME")]
collection = db[os.getenv("COLLECTION_NAME")]
