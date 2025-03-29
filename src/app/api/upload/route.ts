import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const s3Client = new S3Client({}); // Region is automatically set by Lambda in production
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
});

export async function POST(request: NextRequest) {
  console.log("POST request received at /api/upload");
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  console.log("Token:", token ? "Present" : "Missing");
  if (!token) {
    console.log("No token provided, returning 401");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let username: string;
  try {
    const payload = await verifier.verify(token);
    console.log("Token payload:", payload);
    username = payload.sub;
    console.log("Verified username:", username);
  } catch (error) {
    console.error("Token verification failed:", error);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    console.log("File received:", file ? file.name : "No file");
    if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
      console.log("Invalid file type, returning 400");
      return NextResponse.json({ error: "Please upload an image or video" }, { status: 400 });
    }

    const fileType = file.type.startsWith("image/") ? "image" : "video";
    const fileKey = `${fileType}s/${Date.now()}-${file.name}`;
    console.log("Generated fileKey:", fileKey);

    // Upload to S3
    console.log("Uploading to S3...");
    const s3Command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileKey,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type,
    });
    await s3Client.send(s3Command);
    console.log("S3 upload successful");

    // Save metadata to DynamoDB
    try {
      console.log("Saving metadata to DynamoDB...");
      const dynamoCommand = new PutItemCommand({
        TableName: process.env.DYNAMODB_TABLE_NAME,
        Item: {
          fileKey: { S: fileKey },
          fileType: { S: fileType },
          uploadDate: { S: new Date().toISOString() },
          uploadedBy: { S: username },
        },
      });
      await docClient.send(dynamoCommand);
      console.log("DynamoDB save successful");
    } catch (dynamoError) {
      console.error("DynamoDB save failed:", dynamoError);
      // Rollback: Delete the file from S3 if DynamoDB fails
      console.log("Rolling back: Deleting file from S3...");
      const deleteCommand = new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
      });
      await s3Client.send(deleteCommand);
      console.log("S3 rollback successful");
      return NextResponse.json({ error: "Failed to save metadata to DynamoDB" }, { status: 500 });
    }

    return NextResponse.json({ message: "Upload successful", fileKey });
  } catch (error) {
    console.error("Upload error:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}