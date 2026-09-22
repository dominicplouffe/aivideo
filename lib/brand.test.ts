import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { BRAND_FONTS, contrastText, resolveBrand, sanitizeBrandTokens } from "./brand";
import { fontFile, fontsDirectory } from "./render/fonts-path";

describe("sanitizeBrandTokens", () => {
  it("keeps what it understands and upper-cases colours", () => {
    const out = sanitizeBrandTokens({
      colors: { accent: "#ff6a00", background: "#0b0d14", text: "#f5f7ff" },
      font: "Montserrat",
      captionStyle: "outline-top",
      logoPosition: "top-left",
      intro: "  A   tour  ",
      outro: "",
      cursor: "pulse",
      music: "ambient",
    });
    assert.ok("tokens" in out);
    assert.deepEqual(out.tokens, {
      colors: { accent: "#FF6A00", background: "#0B0D14", text: "#F5F7FF" },
      font: "Montserrat",
      captionStyle: "outline-top",
      logoPosition: "top-left",
      intro: "A tour",
      outro: "",
    });
  });
  it("refuses a colour that is not a six-digit hex", () => {
    const out = sanitizeBrandTokens({ colors: { accent: "red" } });
    assert.ok("error" in out);
  });
  it("refuses a typeface the renderer does not have", () => {
    assert.ok("error" in sanitizeBrandTokens({ font: "Comic Sans" }));
  });
  it("never takes a logo from tokens", () => {
    const out = sanitizeBrandTokens({ logo: { key: "../../etc/passwd", contentType: "image/png" } });
    assert.ok("tokens" in out);
    assert.equal(out.tokens.logo, undefined);
  });
  it("caps a card line", () => {
    assert.ok("error" in sanitizeBrandTokens({ intro: "x".repeat(81) }));
  });
});

describe("resolveBrand", () => {
  it("fills every gap so a renderer never reads undefined", () => {
    const b = resolveBrand(null);
    assert.equal(b.font, "Inter");
    assert.equal(b.captionStyle, "boxed-bottom");
    assert.equal(b.logo, null);
    assert.equal(b.intro, "");
  });
});

describe("bundled fonts", () => {
  it("has Regular and Bold on disk for every offered typeface", () => {
    for (const font of BRAND_FONTS) {
      for (const weight of ["Regular", "Bold"] as const) {
        const file = path.join(fontsDirectory(), fontFile(font, weight));
        assert.ok(existsSync(file), `${file} is missing`);
      }
    }
  });
});

describe("contrastText", () => {
  it("puts dark ink on a light swatch and light ink on a dark one", () => {
    assert.equal(contrastText("#F5F7FF"), "#000000");
    assert.equal(contrastText("#0B0D14"), "#FFFFFF");
  });
});
