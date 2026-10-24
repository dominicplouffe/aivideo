import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${site.name} — ${site.tagline}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#06070D",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg,#6E56F8,#A855F7 48%,#22D3EE)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 5,
              paddingBottom: 14,
            }}
          >
            <div style={{ width: 7, height: 34, borderRadius: 4, background: "rgba(255,255,255,0.95)" }} />
            <div style={{ width: 7, height: 24, borderRadius: 4, background: "rgba(255,255,255,0.8)" }} />
            <div style={{ width: 7, height: 14, borderRadius: 4, background: "rgba(255,255,255,0.62)" }} />
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>
            <span style={{ color: "#FFFFFF" }}>Demo</span>
            <span style={{ color: "#A7AFC2" }}>Riff</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.05,
              fontWeight: 600,
              color: "#FFFFFF",
              letterSpacing: -2.6,
              maxWidth: 940,
            }}
          >
            Your product deserves better than a screen recording.
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.4, color: "#A7AFC2", maxWidth: 880 }}>
            One rough screen recording becomes a directed demo video and a step-by-step written
            guide, edited as text.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 36, fontSize: 22, color: "#737D93" }}>
          <div style={{ display: "flex" }}>Record once</div>
          <div style={{ display: "flex" }}>·</div>
          <div style={{ display: "flex" }}>Edit as text</div>
          <div style={{ display: "flex" }}>·</div>
          <div style={{ display: "flex" }}>Share or embed</div>
          <div style={{ display: "flex", marginLeft: "auto", color: "#A7AFC2" }}>{site.domain}</div>
        </div>
      </div>
    ),
    size,
  );
}
