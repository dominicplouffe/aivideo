import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The customer stories were invented and have been removed.
  async redirects() {
    return [
      { source: "/customers", destination: "/", permanent: false },
      { source: "/customers/:slug", destination: "/", permanent: false },
    ];
  },
  typedRoutes: false,
  experimental: {
    optimizePackageImports: [],
    // With a proxy file present, Next buffers every request body before the
    // route handler sees it, and past this size it silently keeps only the
    // first part: no error, a warning in the server log, and a route that
    // stores a truncated take. The default is 10 MB. Matched to the ceiling
    // the recording upload route enforces itself (512 MB), with headroom.
    proxyClientMaxBodySize: "520mb",
  },
};

export default nextConfig;
