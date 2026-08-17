import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Reuses the sidebar brand mark's exact shape and colors (BroomIcon on
// bg-brand/text-brand-ink in AppShell.tsx) so the browser tab matches the
// in-app logo instead of introducing a second, unrelated icon.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e8551f",
          borderRadius: 7,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2.5v6" />
          <path d="M6.5 8.5h7l1.2 8h-9.4z" />
          <path d="M10 12.5v4" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
