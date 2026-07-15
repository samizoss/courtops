import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // templates/ is read via fs at runtime; without tracing it into the
  // serverless bundle these routes 500 on Vercel while working locally.
  outputFileTracingIncludes: {
    "/api/newsletter/generate": ["./templates/**"],
    "/api/weekly-digest/run": ["./templates/**"],
    "/weekly-digest": ["./templates/**"],
  },
};

export default nextConfig;
