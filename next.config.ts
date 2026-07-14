import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/plan": ["./node_modules/@napi-rs/**/*", "./node_modules/pdfjs-dist/**/*"],
  },
};

export default nextConfig;
