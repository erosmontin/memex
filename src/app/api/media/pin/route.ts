import getConfig from "next/config";
import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

export const config = { runtime: "nodejs" };

const { serverRuntimeConfig, publicRuntimeConfig } = getConfig();

// Read from process.env first, then fallback to runtime config.
const region = process.env.AWS_REGION || publicRuntimeConfig.NEXT_PUBLIC_COGNITO_REGION;
const dynamoTableName = process.env.DYNAMODB_TABLE_NAME || serverRuntimeConfig.DYNAMODB_TABLE_NAME;
const s3BucketName = process.env.S3_BUCKET_NAME || serverRuntimeConfig.S3_BUCKET_NAME;

const dynamoClient = new DynamoDBClient({ region });

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  console.log("DYNAMODB_TABLE_NAME:", dynamoTableName);
  console.log("S3_BUCKET_NAME:", s3BucketName);

  const fileKey = searchParams.get("fileKey");
  if (!fileKey) {
    return NextResponse.json({ error: "Missing fileKey" }, { status: 400 });
  }

  try {
    const command = new UpdateItemCommand({
      TableName: dynamoTableName,
      Key: { fileKey: { S: fileKey } },
      UpdateExpression: "SET pinned = :trueVal",
      ExpressionAttributeValues: {
        ":trueVal": { BOOL: true },
      },
      // This option tells DynamoDB to return the updated attributes
      ReturnValues: "ALL_NEW",
    });
    const result = await dynamoClient.send(command);
    console.log("Updated item:", result.Attributes);

    return NextResponse.json({ message: "Image pinned successfully", updatedItem: result.Attributes });
  } catch (error) {
    console.error("Pin image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
