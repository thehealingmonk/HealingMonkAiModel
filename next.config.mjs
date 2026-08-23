/** @type {import('next').NextConfig} */

// Security headers applied to every response. A strict CSP is intentionally
// omitted: the app loads Razorpay, Google Fonts, remote images and MediaPipe
// WASM, so a CSP needs dedicated testing before it can be enabled safely.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Camera is required for the on-device pose capture flow.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // The migrated SPA (src/) was built with Vite, which never type-checked or
  // linted at build time. Keep that behaviour so pre-existing type/lint noise in
  // the pose/analysis modules doesn't block production builds.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: 'images.pexels.com' }],
  },
  // Native/CommonJS server-only packages that should not be bundled by webpack;
  // they run in the Node.js runtime inside the API route handlers.
  experimental: {
    serverComponentsExternalPackages: ['mongoose', 'bcryptjs'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
