import os
import firebase_admin
from firebase_admin import credentials, firestore, storage, auth
from dotenv import load_dotenv

load_dotenv()

def _init_app():
    if firebase_admin._apps:
        return firebase_admin.get_app()

    cred_path = os.getenv("FIREBASE_CREDENTIALS")
    if not cred_path:
        raise EnvironmentError("FIREBASE_CREDENTIALS not set in .env")

    cred = credentials.Certificate(cred_path)
    return firebase_admin.initialize_app(cred, {
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", ""),
    })

_init_app()

db = firestore.client()


def get_bucket():
    """Return the Storage bucket. Requires FIREBASE_STORAGE_BUCKET to be set."""
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET")
    if not bucket_name:
        raise EnvironmentError("FIREBASE_STORAGE_BUCKET not set in .env")
    return storage.bucket(bucket_name)


def verify_token(id_token: str) -> dict:
    return auth.verify_id_token(id_token)
