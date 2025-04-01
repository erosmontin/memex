import os
import time
import boto3
from botocore.exceptions import ClientError
from datetime import datetime

# Configuration – either set these environment variables or update the default values below.
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "your-s3-bucket-name")
DYNAMODB_TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME", "your-dynamodb-table")
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "./images")  # Directory to scan for images.
UPLOADED_BY = os.environ.get("UPLOADED_BY", "script_uploader")  # Identifier for uploader.

# Initialize AWS clients
s3_client = boto3.client("s3", region_name=AWS_REGION)
dynamodb_client = boto3.client("dynamodb", region_name=AWS_REGION)

def determine_content_type(filename: str):
    ext = os.path.splitext(filename)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    elif ext == ".png":
        return "image/png"
    elif ext == ".gif":
        return "image/gif"
    else:
        return None

def upload_file_to_s3(file_path: str, bucket: str, key: str, content_type: str) -> bool:
    try:
        with open(file_path, "rb") as f:
            s3_client.put_object(
                Bucket=bucket,
                Key=key,
                Body=f,
                ContentType=content_type
            )
        print(f"Uploaded {file_path} to S3 as {key}")
        return True
    except ClientError as e:
        print(f"Error uploading {file_path} to S3: {e}")
        return False

def save_metadata_to_dynamodb(file_key: str, file_type: str, uploaded_by: str) -> bool:
    try:
        dynamodb_client.put_item(
            TableName=DYNAMODB_TABLE_NAME,
            Item={
                "fileKey": {"S": file_key},
                "fileType": {"S": file_type},
                "uploadDate": {"S": datetime.utcnow().isoformat()},
                "uploadedBy": {"S": uploaded_by},
                "pinned": {"BOOL": False}
            }
        )
        print(f"Saved metadata in DynamoDB for {file_key}")
        return True
    except ClientError as e:
        print(f"Error saving metadata for {file_key}: {e}")
        return False

def main():
    if not os.path.isdir(UPLOAD_DIR):
        print(f"Upload directory '{UPLOAD_DIR}' does not exist.")
        return

    files = os.listdir(UPLOAD_DIR)
    if not files:
        print("No files found in the upload directory.")
        return

    for filename in files:
        file_path = os.path.join(UPLOAD_DIR, filename)
        if os.path.isfile(file_path):
            content_type = determine_content_type(filename)
            if not content_type:
                print(f"Skipping unsupported file type: {filename}")
                continue

            # Build the S3 file key in the format "images/<timestamp>-<filename>"
            timestamp = int(time.time())
            file_key = f"images/{timestamp}-{filename}"

            # Upload the file to S3.
            if upload_file_to_s3(file_path, S3_BUCKET_NAME, file_key, content_type):
                save_metadata_to_dynamodb(file_key, "image", UPLOADED_BY)

if __name__ == "__main__":
    main()