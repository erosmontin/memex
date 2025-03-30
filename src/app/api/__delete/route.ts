import { NextRequest, NextResponse } from "next/server";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
});

export async function DELETE(request: NextRequest) {
  console.log("DELETE request received at /api/delete");
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
  } catch (_error) {
    console.error("Token verification failed:", _error);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const { fileKey } = await request.json();
    console.log("FileKey to delete:", fileKey);
    if (!fileKey) {
      console.log("No fileKey provided, returning 400");
      return NextResponse.json({ error: "fileKey is required" }, { status: 400 });
    }

    // Fetch the item from DynamoDB to verify ownership
    console.log("Fetching item from DynamoDB...");
    const getCommand = new ScanCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      FilterExpression: "fileKey = :fileKey",
      ExpressionAttributeValues: { ":fileKey": { S: fileKey } },
    });
    const result = await docClient.send(getCommand);
    console.log("DynamoDB result:", result);

    if (!result.Items || result.Items.length === 0) {
      console.log("Item not found in DynamoDB, returning 404");
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const item = result.Items[0];
    console.log("Item found:", item);
    if (item.uploadedBy.S !== username) {
      console.log("User does not own this item, returning 403");
      return NextResponse.json({ error: "You can only delete your own uploads" }, { status: 403 });
    }

    // Delete from S3
    console.log("Deleting from S3...");
    const s3Command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileKey,
    });
    await s3Client.send(s3Command);
    console.log("S3 deletion successful");

    // Delete from DynamoDB
    console.log("Deleting from DynamoDB...");
    const dynamoCommand = new DeleteItemCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        fileKey: { S: fileKey },
      },
    });
    await docClient.send(dynamoCommand);
    console.log("DynamoDB deletion successful");

    return NextResponse.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}