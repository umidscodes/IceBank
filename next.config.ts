import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "bcryptjs", "pdf-lib"],
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
