import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets the Android emulator (which reaches this computer at 10.0.2.2) load the dev server.
  allowedDevOrigins: ["10.0.2.2"],
  // The source corpus is read from disk at runtime; make sure Vercel bundles it.
  outputFileTracingIncludes: {
    "/api/ask": ["./data/sources/**/*"],
  },
};

export default withNextIntl(nextConfig);
