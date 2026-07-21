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
    // fs.readFileSync'd at module scope in the image route (see route.tsx
    // comment) — without this the .ttf files 500 on Vercel the same way
    // templates/ would without its own entry above.
    "/api/weekly-digest/image": ["./src/app/api/weekly-digest/image/fonts/**"],
  },
};

export default nextConfig;
