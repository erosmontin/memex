import getConfig from "next/config";
import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const config = {
  runtime: "nodejs",
};

const { serverRuntimeConfig, publicRuntimeConfig } = getConfig();

const region = process.env.AWS_REGION || publicRuntimeConfig.NEXT_PUBLIC_COGNITO_REGION;
const s3BucketName = process.env.S3_BUCKET_NAME || serverRuntimeConfig.S3_BUCKET_NAME;

const s3Client = new S3Client({ region });

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("fileName");
  const fileType = searchParams.get("fileType");

  if (!fileName || !fileType) {
    return NextResponse.json({ error: "Missing fileName or fileType" }, { status: 400 });
  }

  // Construct a fileKey (you could add more logic here)
  const fileKey = `uploads/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: s3BucketName,
    Key: fileKey,
    ContentType: fileType,
  });

  try {
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return NextResponse.json({ signedUrl, fileKey });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return NextResponse.json({ error: "Could not generate presigned URL" }, { status: 500 });
  }
}