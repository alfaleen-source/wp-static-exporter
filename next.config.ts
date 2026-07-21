import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/export": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
      "./bundled-fonts/**/*",
    ],
    "/api/cleanup": ["./bundled-fonts/**/*"],
  },
};

export default nextConfig;
