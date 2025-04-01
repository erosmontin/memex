import getConfig from "next/config";
import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";

// Retrieve runtime configuration values
const { serverRuntimeConfig, publicRuntimeConfig } = getConfig();

// Fallback: Read from process.env then fallback to runtime config.
const region = process.env.AWS_REGION || publicRuntimeConfig.NEXT_PUBLIC_COGNITO_REGION;
const dynamoTableName = process.env.DYNAMODB_TABLE_NAME || serverRuntimeConfig.DYNAMODB_TABLE_NAME;
const s3BucketName = process.env.S3_BUCKET_NAME || serverRuntimeConfig.S3_BUCKET_NAME;
const userPoolId =
  process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ||
  publicRuntimeConfig.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const clientId =
  process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ||
  publicRuntimeConfig.NEXT_PUBLIC_COGNITO_CLIENT_ID;

const s3Client = new S3Client({ region });
const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const verifier = CognitoJwtVerifier.create({
  userPoolId: userPoolId!,
  tokenUse: "id",
  clientId: clientId!,
});

export const config = {
  runtime: "nodejs", // or "experimental-edge", if you're using edge runtime
  api: {
    bodyParser: {
      sizeLimit: '200mb', // Increase the limit to 200 MB
    },
  },
};
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let username: string;
  try {
    // Pass an empty options object if needed
    const payload = await verifier.verify(token, { clientId: clientId! });
    username = payload.sub;
    console.log("Upload username:", username);
  } catch (_error) {
    console.error("Token verification failed:", _error);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    // Retrieve all files with the key "files"
    const files = formData.getAll("files") as File[];
    if (files.length === 0) {
      return NextResponse.json(
        { error: "Please upload at least one image or video" },
        { status: 400 }
      );
    }

    const uploadResults = [];
    for (const file of files) {
      if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
        continue;
      }

      const fileType = file.type.startsWith("image/") ? "image" : "video";
      const fileKey = `${fileType}s/${Date.now()}-${file.name}`;

      // Upload file to S3
      const s3Command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: fileKey,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      });
      await s3Client.send(s3Command);

      // Save metadata to DynamoDB
      const dynamoCommand = new PutItemCommand({
        TableName: dynamoTableName,
        Item: {
          fileKey: { S: fileKey },
          fileType: { S: fileType },
          uploadDate: { S: new Date().toISOString() },
          uploadedBy: { S: username },
          pinned: { BOOL: false },
        },
      });
      await docClient.send(dynamoCommand);

      uploadResults.push({ fileKey, fileType });
    }

    if (uploadResults.length === 0) {
      return NextResponse.json({ error: "No valid files were uploaded" }, { status: 400 });
    }

    return NextResponse.json({
      message: "Upload successful",
      files: uploadResults,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
