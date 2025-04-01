/** @type {import('next').NextConfig} */
const nextConfig = {
  serverRuntimeConfig: {
    DYNAMODB_TABLE_NAME: process.env.DYNAMODB_TABLE_NAME,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
  },
  publicRuntimeConfig: {
    NEXT_PUBLIC_COGNITO_REGION: process.env.NEXT_PUBLIC_COGNITO_REGION,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    NEXT_PUBLIC_COGNITO_DOMAIN: process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "my-media-bucket-515966532699-us-east-1.s3.us-east-1.amazonaws.com",
        pathname: "/**", // Allow all paths under this hostname
      },
    ],
  },
};
module.exports = nextConfig;

