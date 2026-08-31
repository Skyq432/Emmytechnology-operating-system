import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/**': ['./src/lib/sales/documents/templates/**/*'],
  },
};

export default nextConfig;
