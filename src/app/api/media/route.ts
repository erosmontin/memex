import { NextResponse } from "next/server";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
});

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  console.log("Token received:", token ? "Yes" : "No");

  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let username: string;
  try {
    const payload = await verifier.verify(token);
    console.log("Token payload:", payload);
    username = payload.sub; // Use sub explicitly
    console.log("Verified username:", username);
  } catch (error) {
    console.error("Token verification failed:", error);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const command = new ScanCommand({ TableName: process.env.DYNAMODB_TABLE_NAME });
    const result = await docClient.send(command);
    console.log("DynamoDB items:", result.Items);

    if (!result.Items) return NextResponse.json([]);

    const mediaItems = await Promise.all(
      result.Items.map(async (item) => {
        const fileKey = item.fileKey.S!;
        const fileType = item.fileType.S!;
        const uploadDate = item.uploadDate.S!;
        const uploadedBy = item.uploadedBy.S!;

        const s3Command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: fileKey,
        });
        const url = await getSignedUrl(s3Client, s3Command, { expiresIn: 3600 });
        return { fileKey, fileType, uploadDate, uploadedBy, url };
      })
    );

    const userMedia = mediaItems.filter((item) => item.uploadedBy === username);
    console.log("Filtered user media:", userMedia);

    return NextResponse.json(userMedia);
  } catch (error) {
    console.error("Error fetching media:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}