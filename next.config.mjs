import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The source corpus is read from disk at runtime; make sure Vercel bundles it.
  outputFileTracingIncludes: {
    "/api/ask": ["./data/sources/**/*"],
  },
};

export default withNextIntl(nextConfig);
