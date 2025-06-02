/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    
    // Environment variables available to the client
    env: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
      NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000',
    },
  
    // Image optimization
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'lh3.googleusercontent.com',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'firebasestorage.googleapis.com',
          port: '',
          pathname: '/**',
        },
      ],
    },
  
    // Headers for security and CORS
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'X-Frame-Options',
              value: 'DENY',
            },
            {
              key: 'X-Content-Type-Options',
              value: 'nosniff',
            },
            {
              key: 'Referrer-Policy',
              value: 'strict-origin-when-cross-origin',
            },
            {
              key: 'Permissions-Policy',
              value: 'microphone=(self), camera=(self), geolocation=()',
            },
          ],
        },
      ];
    },
  
    // Redirects for better UX
    async redirects() {
      return [
        {
          source: '/home',
          destination: '/',
          permanent: true,
        },
        {
          source: '/auth',
          destination: '/login',
          permanent: true,
        },
      ];
    },
  
    // Webpack configuration for Chrome extension compatibility
    webpack: (config, { isServer }) => {
      // Ignore node-specific modules in client bundle
      if (!isServer) {
        config.resolve.fallback = {
          ...config.resolve.fallback,
          fs: false,
          net: false,
          tls: false,
          crypto: false,
        };
      }
  
      // Handle WebSocket connections
      config.externals = config.externals || [];
      if (!isServer) {
        config.externals.push({
          'socket.io-client': 'io',
        });
      }
  
      return config;
    },
  
    // Experimental features
    experimental: {
      // App Router features
      appDir: true,
      
      // Performance optimizations
      optimizeCss: true,
      
      // Bundle analyzer
      bundlePagesRouterDependencies: true,
    },
  
    // Performance optimizations
    compiler: {
      // Remove console logs in production
      removeConsole: process.env.NODE_ENV === 'production',
    },
  
    // Output configuration
    output: 'standalone',
  
    // PWA configuration (optional)
    ...(process.env.NODE_ENV === 'production' && {
      async rewrites() {
        return [
          {
            source: '/service-worker.js',
            destination: '/_next/static/service-worker.js',
          },
        ];
      },
    }),
  };
  
  export default nextConfig;