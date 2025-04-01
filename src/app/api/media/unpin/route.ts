import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

export const config = { runtime: "nodejs" };

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileKey = searchParams.get("fileKey");

  if (!fileKey) {
    return NextResponse.json({ error: "Missing fileKey" }, { status: 400 });
  }

  try {
    const command = new UpdateItemCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { fileKey: { S: fileKey } },
      UpdateExpression: "SET pinned = :falseVal",
      ExpressionAttributeValues: {
        ":falseVal": { BOOL: false },
      },
      ReturnValues: "ALL_NEW",
    });
    const result = await dynamoClient.send(command);
    console.log("Updated item:", result.Attributes);
    return NextResponse.json({ message: "Image unpinned successfully", updatedItem: result.Attributes });
  } catch (error) {
    console.error("Unpin image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
