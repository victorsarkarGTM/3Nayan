import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@3nayan/client', '@3nayan/shared'],
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
