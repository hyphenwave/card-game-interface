/** @type {import('next').NextConfig} */
import path from "path"

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [
    "@zama-fhe/relayer-sdk",
    "@zama-fhe/relayer-sdk/node",
    "@walletconnect/ethereum-provider",
    "@walletconnect/universal-provider",
    "pino",
    "thread-stream",
    "fastbench",
    "tape",
    "tap",
    "desm",
    "why-is-node-running",
  ],
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "thread-stream": path.resolve("./lib/empty.js"),
      "pino-pretty": path.resolve("./lib/empty.js"),
      "pino-std-serializers": path.resolve("./lib/empty.js"),
      "sonic-boom": path.resolve("./lib/empty.js"),
      "@react-native-async-storage/async-storage": path.resolve("./lib/empty.js"),
    }
    if (!isServer) {
      // Inject global polyfill as the first entry point
      const originalEntry = config.entry;
      config.entry = async () => {
        const entries = await originalEntry();
        
        // Add polyfill to all entry points
        Object.keys(entries).forEach((key) => {
          if (Array.isArray(entries[key])) {
            entries[key].unshift('./lib/global-polyfill.js');
          } else if (typeof entries[key] === 'string') {
            entries[key] = ['./lib/global-polyfill.js', entries[key]];
          }
        });
        
        return entries;
      };
      
      // Add fallback for node modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        pino: false,
        fs: false,
        net: false,
        tls: false,
      }

      config.resolve.alias = {
        ...config.resolve.alias,
        pino: "pino/browser",
      }
    }
    return config
  },
  turbopack: {
    resolveAlias: {
      "pino": "pino/browser",
      "thread-stream": "./lib/empty.js",
      "pino-pretty": "./lib/empty.js",
      "pino-std-serializers": "./lib/empty.js",
      "sonic-boom": "./lib/empty.js",
    },
  },
}

export default nextConfig
