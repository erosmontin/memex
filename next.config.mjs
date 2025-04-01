/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
      unoptimized: true,
      remotePatterns: [
        {
          protocol: "https",
          hostname: "my-media-bucket-515966532699-us-east-1.amazonaws.com",
          port: "",
          pathname: "/**",
        },
      ],
    },
  };
  
  export default nextConfig;