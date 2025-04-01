export const config = { runtime: "nodejs" };

import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import {
  DynamoDBClient,
  ScanCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
});

export async function GET(request: NextRequest) {
  console.log("GET request received at /api/media");
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
    // Fetch media items from DynamoDB for the verified user.
    console.log("Fetching media items from DynamoDB...");
    const scanCommand = new ScanCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      FilterExpression: "uploadedBy = :username",
      ExpressionAttributeValues: {
        ":username": { S: username },
      },
    });
    const dynamoData = await docClient.send(scanCommand);
    console.log("DynamoDB scan successful");

    // Map items to include the pinned attribute and other necessary fields.
    const mediaItems = dynamoData.Items?.map((item) => ({
      fileKey: item.fileKey?.S || item.fileKey,
      fileType: item.fileType?.S || item.fileType,
      uploadDate: item.uploadDate?.S || item.uploadDate,
      uploadedBy: item.uploadedBy?.S || item.uploadedBy,
      previewKey: item.previewKey?.S || item.previewKey,
      // Convert the pinned attribute to a plain boolean.
      pinned: item.pinned ? (item.pinned.S || item.pinned.BOOL || item.pinned) : false,
    })) || [];

    // Generate presigned URLs for each media item.
    const mediaWithUrls = await Promise.all(
      mediaItems.map(async (item) => {
        // Explicitly convert fileKey to string.
        const fileKey: string = typeof item.fileKey === "string" ? item.fileKey : (item.fileKey?.S as string);
        const getObjectCommand = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: fileKey,
        });
        const url = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 6400 }); // URL valid for 24 hours.
        return { ...item, url };
      })
    );

    return NextResponse.json(mediaWithUrls);
  } catch (error) {
    const err = error as Error;
    console.error("Fetch media error:", err);
    console.error("Error stack:", err.stack);
    return NextResponse.json({ error: `Internal server error: ${err.message}` }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // Extract fileKey from the query string.
  const { searchParams } = new URL(request.url);
  const fileKey = searchParams.get("fileKey");
  if (!fileKey) {
    return NextResponse.json({ error: "fileKey is required" }, { status: 400 });
  }

  // Optionally, add token verification/authorization logic here.

  try {
    // Delete the file from S3.
    const s3DeleteCommand = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileKey,
    });
    await s3Client.send(s3DeleteCommand);

    // Delete the metadata from DynamoDB.
    const dynamoDeleteCommand = new DeleteItemCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        fileKey: { S: fileKey },
      },
    });
    await dynamoClient.send(dynamoDeleteCommand);

    return NextResponse.json({ message: "File deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json({ error: (err as Error).message || "Failed to delete file" }, { status: 500 });
  }
}
