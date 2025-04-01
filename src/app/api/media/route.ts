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
    console.log('DYNAMODB_TABLE_NAME:', process.env.DYNAMODB_TABLE_NAME);
    console.log('S3_BUCKET_NAME:', process.env.S3_BUCKET_NAME);
  
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

    const mediaItems = dynamoData.Items?.map((item) => {
      // Explicitly determine the pinned status
      let isPinned = false;
      if (item.pinned && typeof item.pinned.BOOL !== "undefined") {
        isPinned = item.pinned.BOOL; // Directly use the BOOL value if it exists
      } else if (item.pinned && item.pinned.S) {
        // Handle string values if they exist (e.g., "true" or "false")
        isPinned = item.pinned.S.toLowerCase() === "true";
      }

      return {
        fileKey: item.fileKey?.S || item.fileKey,
        fileType: item.fileType?.S || item.fileType,
        uploadDate: item.uploadDate?.S || item.uploadDate,
        uploadedBy: item.uploadedBy?.S || item.uploadedBy,
        previewKey: item.previewKey?.S || item.previewKey,
        pinned: isPinned, // Use the normalized boolean value
      };
    }) || [];

    const mediaWithUrls = await Promise.all(
      mediaItems.map(async (item) => {
        const fileKey: string =
          typeof item.fileKey === "string" ? item.fileKey : (item.fileKey?.S as string);
        const fileUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: fileKey,
          }),
          { expiresIn: 6400 }
        );

        let previewUrl = "";
        if (item.previewKey) {
          const pKey: string =
            typeof item.previewKey === "string" ? item.previewKey : (item.previewKey?.S as string);
          previewUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: process.env.S3_BUCKET_NAME,
              Key: pKey,
            }),
            { expiresIn: 6400 }
          );
        }
        return { ...item, url: fileUrl, previewUrl: previewUrl || fileUrl };
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
  const { searchParams } = new URL(request.url);
  const fileKey = searchParams.get("fileKey");
  if (!fileKey) {
    return NextResponse.json({ error: "fileKey is required" }, { status: 400 });
  }

  try {
    const s3DeleteCommand = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileKey,
    });
    await s3Client.send(s3DeleteCommand);

    
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