import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

export const config = { runtime: "nodejs" };

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function GET(request: NextRequest) {
  try {
    const command = new ScanCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
    });
    const data = await dynamoClient.send(command);

    // Unmarshall each item into a plain JS object
    const items = data.Items ? data.Items.map(item => unmarshall(item)) : [];
    
    return NextResponse.json(items);
  } catch (error) {
    console.error("Fetch media error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
