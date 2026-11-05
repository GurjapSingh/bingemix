/** @type {import('next').NextConfig} */
const nextConfig = {
    // Emit a self-contained server (.next/standalone) with only the files the
    // app actually uses, so the Docker image doesn't need node_modules.
    output: 'standalone',

    // Hide the floating Next.js "N" badge shown in dev mode.
    devIndicators: false,
};

export default nextConfig;
