import os
from io import BytesIO
import boto3
from botocore.exceptions import ClientError
from PIL import Image
# from dotenv import load_dotenv

# Load environment variables from .env file
# load_dotenv()

# Get configuration values from environment variables.
AWS_REGION = "us-east-1"
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME")
DYNAMODB_TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME")
PREVIEW_FOLDER = "previews"
KID = os.environ.get("AWS_ACCESS_KEY_ID")
SKID = os.environ.get("AWS_SECRET_ACCESS_KEY")

# Initialize AWS clients with explicit credentials.
s3_client = boto3.client(
    's3',
    region_name=AWS_REGION,
    aws_access_key_id=KID,
    aws_secret_access_key=SKID
)
dynamodb_client = boto3.client(
    'dynamodb',
    region_name=AWS_REGION,
    aws_access_key_id=KID,
    aws_secret_access_key=SKID
)

def process_item(item):
    """
    Process a single DynamoDB item.
    If the item does not have a previewKey and its fileKey starts with "images/",
    download the image from S3, generate a preview using Pillow, upload the preview
    to S3, and update the DynamoDB item with the previewKey.
    """
    file_key = item.get('fileKey', {}).get('S')
    if not file_key:
        print("No fileKey found in item, skipping.")
        return

    # Skip items that already have a previewKey.
    if 'previewKey' in item:
        print(f"Skipping {file_key} (previewKey already exists)")
        return

    # Only process files under the "images/" prefix.
    if not file_key.startswith("images/"):
        print(f"Skipping non-image file: {file_key}")
        return

    try:
        print(f"Downloading image: {file_key}")
        s3_response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=file_key)
        content_type = s3_response.get('ContentType')
        print(f"Downloaded {file_key} with ContentType: {content_type}")

        # Skip if the file is not an image.
        if not content_type or not content_type.startswith("image/"):
            print(f"Skipping file with non-image ContentType: {content_type}")
            return

        # Read the S3 object body into a bytes buffer.
        body = s3_response['Body'].read()
        print(f"Buffer created for {file_key}")

        # Open the image with Pillow.
        with Image.open(BytesIO(body)) as img:
            # Resize the image to a width of 200px while maintaining aspect ratio.
            width, height = img.size
            new_width = 200
            new_height = int((new_width / width) * height)
            img = img.resize((new_width, new_height))
            
            # Convert image to RGB if necessary (JPEG doesn't support RGBA).
            if img.mode != "RGB":
                img = img.convert("RGB")
            
            # Save the preview image to a buffer in JPEG format.
            preview_buffer = BytesIO()
            img.save(preview_buffer, format="JPEG")
            preview_buffer.seek(0)

        # Create the preview key (e.g., "previews/filename.jpg").
        filename = file_key.split("/")[-1]
        preview_key = f"{PREVIEW_FOLDER}/{filename}"
        print(f"Uploading preview to S3 as: {preview_key}")

        # Upload the preview image to S3.
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=preview_key,
            Body=preview_buffer,
            ContentType="image/jpeg"
        )
        print(f"Preview uploaded to S3: {preview_key}")

        # Update the DynamoDB item with the new previewKey.
        dynamodb_client.update_item(
            TableName=DYNAMODB_TABLE_NAME,
            Key={'fileKey': {'S': file_key}},
            UpdateExpression="SET previewKey = :p",
            ExpressionAttributeValues={":p": {'S': preview_key}},
            ConditionExpression="attribute_exists(fileKey)"
        )
        print(f"DynamoDB updated for {file_key} with previewKey {preview_key}")
    except ClientError as e:
        print(f"Error processing {file_key}: {e}")

def main():
    print("Starting script to update media items with previewKey if missing...")
    last_evaluated_key = None

    # Scan the table in a paginated manner.
    while True:
        scan_kwargs = {'TableName': DYNAMODB_TABLE_NAME}
        if last_evaluated_key:
            scan_kwargs['ExclusiveStartKey'] = last_evaluated_key

        response = dynamodb_client.scan(**scan_kwargs)
        items = response.get('Items', [])
        print(f"Scanned {len(items)} items")

        for item in items:
            if 'previewKey' not in item:
                process_item(item)
            else:
                file_key = item.get('fileKey', {}).get('S', 'Unknown')
                print(f"Item {file_key} already has previewKey, skipping.")

        last_evaluated_key = response.get('LastEvaluatedKey')
        if not last_evaluated_key:
            break

    print("Script completed.")

if __name__ == "__main__":
    main()
