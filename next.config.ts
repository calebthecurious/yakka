import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  experimental: {
    // Resume uploads POST the raw PDF to the extractResumeText Server Action.
    // Next's default Server Action body limit is 1MB, which silently rejects
    // any real resume (1-3MB) at the framework layer — before the action's
    // try/catch — surfacing as a full-page runtime crash. Raise to Vercel's
    // 4.5MB function request-body hard cap; the client-side 4MB file check
    // (extract-resume.ts) rejects anything larger with a friendly message.
    serverActions: { bodySizeLimit: '4.5mb' },
  },
};

export default nextConfig;
