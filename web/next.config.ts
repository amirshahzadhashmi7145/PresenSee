import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so Turbopack never wanders up the drive.
  turbopack: { root: path.resolve(process.cwd()) },
  // Do not write helper files for coding tools into the repo.
  agentRules: false,
};

export default nextConfig;
