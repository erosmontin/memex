/** @type {import('next').NextConfig} */
const nextConfig = {
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
