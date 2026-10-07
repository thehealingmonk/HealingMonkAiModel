/** @type {import('next').NextConfig} */

// Security headers applied to every response. A strict CSP is intentionally
// omitted: the app loads Razorpay, Google Fonts, remote images and MediaPipe
// WASM, so a CSP needs dedicated testing before it can be enabled safely.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Camera is required for the on-device pose capture flow; microphone is
  // required for the online meeting (WebRTC audio). Both are limited to same-origin.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // The project type-checks cleanly (`npm run typecheck`), so the production
  // build enforces it — a type error now fails the build instead of shipping.
  // ESLint is not configured for this project yet, so it stays skipped.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
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
