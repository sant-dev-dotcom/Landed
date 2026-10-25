import { ImageResponse } from "next/og";

export const runtime = "edge";

const ALLOWED = new Set([180, 192, 512]);

// Rounded-square app icon: Lamplight ink field, paper "landing" mark, an oat lamp.
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = ALLOWED.has(Number(raw)) ? Number(raw) : 192;
  const s = size / 100;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#131211",
        }}
      >
        <svg width={64 * s} height={64 * s} viewBox="0 0 64 64">
          {/* ground line */}
          <rect x="6" y="52" width="52" height="5" rx="2.5" fill="#A8C3A0" />
          {/* plane descending */}
          <path
            d="M10 20 L46 34 C50 35.5 52 38 50.5 40.5 C49 42.5 46 42.5 43 41.5 L31 37.5 L22 46 L17 44.5 L22 34.5 L13 31.5 L9 35 L5.5 33.8 L8 26 Z"
            fill="#EDE6DA"
          />
          <circle cx="54" cy="14" r="5" fill="#D9CBB0" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
