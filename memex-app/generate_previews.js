require("dotenv").config();
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const sharp = require("sharp");

// Initialize AWS clients with region from env variables.
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });

const bucket = process.env.S3_BUCKET_NAME || "my-media-bucket-515966532699-us-east-1.s3.us-east-1.amazonaws.com";
const previewFolder = process.env.PREVIEW_FOLDER || "previews";
const tableName = process.env.DYNAMODB_TABLE_NAME || "MediaTable";

/**
 * Processes a single DynamoDB item.
 * If the item does not have a previewKey and is an image,
 * the function downloads the image from S3, generates a preview,
 * uploads the preview to S3, and updates the DynamoDB item.
 */
async function processItem(item) {
  // Extract fileKey (assumes fileKey attribute exists in low-level format)
  const fileKey = item.fileKey.S;
  
  // Skip if previewKey is already defined.
  if (item.previewKey) {
    console.log(`Skipping ${fileKey} (previewKey already exists)`);
    return;
  }

  // Only process files under the "images/" prefix.
  if (!fileKey.startsWith("images/")) {
    console.log(`Skipping non-image file: ${fileKey}`);
    return;
  }

  try {
    // Download image from S3.
    console.log(`Downloading image: ${fileKey}`);
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: fileKey,
    });
    const { Body, ContentType } = await s3.send(getCommand);
    console.log(`Downloaded ${fileKey} with ContentType: ${ContentType}`);

    // Skip if the content type is not an image.
    if (!ContentType || !ContentType.startsWith("image/")) {
      console.log(`Skipping file with non-image ContentType: ${ContentType}`);
      return;
    }

    // Convert the S3 stream to a buffer.
    const chunks = [];
    for await (const chunk of Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    console.log(`Buffer created for ${fileKey}`);

    // Generate preview using sharp (resize to width 200px and convert to JPEG).
    const previewBuffer = await sharp(buffer)
      .resize({ width: 200 })
      .jpeg()
      .toBuffer();

    // Define previewKey (for example: "previews/filename.jpg").
    const previewKey = `${previewFolder}/${fileKey.split("/").pop()}`;
    console.log(`Uploading preview to S3 as: ${previewKey}`);

    // Upload the preview image to S3.
    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: previewKey,
      Body: previewBuffer,
      ContentType: "image/jpeg",
    });
    await s3.send(putCommand);
    console.log(`Preview uploaded to S3: ${previewKey}`);

    // Update the DynamoDB item with the previewKey.
    const updateCommand = new UpdateItemCommand({
      TableName: tableName,
      Key: { fileKey: { S: fileKey } },
      UpdateExpression: "SET previewKey = :p",
      ExpressionAttributeValues: {
        ":p": { S: previewKey },
      },
      ConditionExpression: "attribute_exists(fileKey)", // Ensures the item exists
    });
    await dynamoClient.send(updateCommand);
    console.log(`DynamoDB updated for ${fileKey} with previewKey ${previewKey}`);
  } catch (error) {
    console.error(`Error processing ${fileKey}:`, error);
    // If using ConditionExpression failure, consider adding retry logic here.
  }
}

/**
 * Main function:
 * Scans the DynamoDB media table (with pagination)
 * and processes each item that lacks a previewKey.
 */
async function main() {
  console.log("Starting script to update media items with previewKey if missing...");
  let lastEvaluatedKey = undefined;

  do {
    const scanParams = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      // Optionally, you can filter here with FilterExpression like:
      // FilterExpression: "attribute_not_exists(previewKey)"
    };

    const scanCommand = new ScanCommand(scanParams);
    const data = await dynamoClient.send(scanCommand);
    const items = data.Items || [];
    console.log(`Scanned ${items.length} items`);

    // Process each item that does not have previewKey.
    for (const item of items) {
      if (!item.previewKey) {
        await processItem(item);
      } else {
        console.log(`Item ${item.fileKey.S} already has previewKey, skipping.`);
      }
    }

    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log("Script completed.");
}

main().catch(err => {
  console.error("Error in script execution:", err);
});
