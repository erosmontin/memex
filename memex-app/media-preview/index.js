const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const sharp = require("sharp");

const s3 = new S3Client({ region: process.env.REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.REGION });
const bucket = process.env.S3_BUCKET_NAME;
const previewFolder = process.env.PREVIEW_FOLDER || "previews";
const tableName = process.env.DYNAMODB_TABLE_NAME;

exports.handler = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const fileKey = record.s3.object.key;

    // Only process files in the images/ prefix (redundant with S3 filter, but safe)
    if (!fileKey.startsWith("images/")) {
      console.log(`Skipping non-image file: ${fileKey}`);
      continue;
    }

    try {
      // Download image from S3
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: fileKey,
      });
      const { Body, ContentType } = await s3.send(getCommand);
      console.log(`Downloaded image from S3: ${fileKey}`);
      console.log(`ContentType: ${ContentType}`);
      // Skip if not an image
      if (!ContentType || !ContentType.startsWith("image/")) {
        console.log(`Skipping non-image ContentType: ${ContentType}`);
        continue;
      }
      console.log(`Processing image: ${fileKey}`);
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of Body) {
        chunks.push(chunk);
      }
      console.log(`Image converted to buffer: ${fileKey}`);
      const buffer = Buffer.concat(chunks);
      console.log(`Buffer created: ${fileKey}`);
      // Generate preview
      const previewBuffer = await sharp(buffer)
        .resize({ width: 50 })
        .jpeg()
        .toBuffer();

      // Upload preview to S3
      const previewKey = `${previewFolder}/${fileKey.split("/").pop()}`; // e.g., previews/filename.jpg
      console.log(`Preview key: ${previewKey}`);
      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: previewKey,
        Body: previewBuffer,
        ContentType: "image/jpeg",
      });
      console.log(`Uploading preview to S3: ${previewKey}`);
      await s3.send(putCommand); 
      

      console.log(`Preview uploaded to ${previewKey}`);

      // Update DynamoDB with previewKey
      const updateCommand = new UpdateItemCommand({
        TableName: tableName,
        Key: { fileKey: { S: fileKey } },
        UpdateExpression: "SET previewKey = :p",
        ExpressionAttributeValues: {
          ":p": { S: previewKey },
        },
        ConditionExpression: "attribute_exists(fileKey)", // Ensure the item exists
      });
      await dynamoClient.send(updateCommand);
      console.log(`Updated DynamoDB with previewKey: ${previewKey}`);
    } catch (error) {
      console.error(`Error processing ${fileKey}:`, error);
      if (error.name === "ConditionalCheckFailedException") {
        console.log(`DynamoDB entry for ${fileKey} not found yet—may need retry logic`);
      }
    }
  }

  return { statusCode: 200, body: "Processing complete" };
};