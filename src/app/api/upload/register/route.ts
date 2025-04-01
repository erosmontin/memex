import getConfig from "next/config";
import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";

// Retrieve runtime configuration values
const { serverRuntimeConfig, publicRuntimeConfig } = getConfig();

// Fallback: Read from process.env then fallback to runtime config.
const region = process.env.AWS_REGION || publicRuntimeConfig.NEXT_PUBLIC_COGNITO_REGION;
const dynamoTableName = process.env.DYNAMODB_TABLE_NAME || serverRuntimeConfig.DYNAMODB_TABLE_NAME;
const userPoolId =
  process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ||
  publicRuntimeConfig.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const clientId =
  process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ||
  publicRuntimeConfig.NEXT_PUBLIC_COGNITO_CLIENT_ID;

const dynamoClient = new DynamoDBClient({ region });

const verifier = CognitoJwtVerifier.create({
  userPoolId: userPoolId!,
  tokenUse: "id",
  clientId: clientId!,
});

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let username: string;
  try {
    const payload = await verifier.verify(token, { clientId: clientId! });
    username = payload.sub;
    console.log("Upload username:", username);
  } catch (_error) {
    console.error("Token verification failed:", _error);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const { fileKey, fileType } = await request.json();
    if (!fileKey || !fileType) {
      return NextResponse.json({ error: "Missing file metadata" }, { status: 400 });
    }

    // Save metadata to DynamoDB.
    const command = new PutItemCommand({
      TableName: dynamoTableName,
      Item: {
        fileKey: { S: fileKey },
        fileType: { S: fileType },
        uploadDate: { S: new Date().toISOString() },
        pinned: { BOOL: false },
        uploadedBy: { S: username },
      },
    });

    await dynamoClient.send(command);
    console.log("File metadata saved to DynamoDB");
    return NextResponse.json({ fileKey });
  } catch (error) {
    console.error("Error registering file metadata:", error);
    return NextResponse.json({ error: "Failed to register file metadata" }, { status: 500 });
  }
}