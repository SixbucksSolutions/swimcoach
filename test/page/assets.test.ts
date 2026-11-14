import { describe, expect, it } from "vitest";
import icon192 from "../../public/icons/icon-192.png?inline";
import icon512 from "../../public/icons/icon-512.png?inline";
import html from "../../public/index.html?raw";
import manifestText from "../../public/manifest.webmanifest?raw";

// MVP-10 A: the home-screen assets. iOS took the page title for the label ("(1)swimcoach..."), so the
// head names the app outright and links the manifest. The touch icon stays a data URI in the page
// (embed-logo.py): every path on the Worker sits behind Cloudflare Access, and a served icon fetched
// without the login cookie would get the login redirect (PR #37/#39 review, 2026-11-14).
// These tests run under the page's DOM-typed tsconfig, which has no Node types, so Vite reads the files:
// "?raw" for text, "?inline" (a base64 data URI) for the PNGs (vite-queries.d.ts types both).

const TOUCH_ICON = /<link rel="apple-touch-icon" href="(?<uri>data:image\/png;base64,[^"]+)">/gu;
const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
const touchIcons = [...head.matchAll(TOUCH_ICON)].map((m) => m.groups?.uri ?? "");

const PNGS: Record<string, string> = {
  "/icons/icon-192.png": icon192,
  "/icons/icon-512.png": icon512,
  touch: touchIcons[0] ?? "",
};

interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose?: string;
}
interface Manifest {
  readonly name: string;
  readonly short_name: string;
  readonly display: string;
  readonly start_url: string;
  readonly scope: string;
  readonly background_color: string;
  readonly theme_color: string;
  readonly icons: readonly ManifestIcon[];
}

const manifest = JSON.parse(manifestText) as Manifest;
const APP_NAME = "swimcoach";
const PAGE_GROUND = "#0b0f14"; // --bg, docs/brand.md section 5
const PNG_SIGNATURE = "89504e470d0a1a0a";

/** The signature and pixel size from a PNG's header: 8 signature bytes, then IHDR's width and height. */
function pngSize(servedPath: string): { width: number; height: number; signature: string } {
  const uri = PNGS[servedPath];
  if (uri === undefined) {
    throw new Error(`${servedPath} was not read`);
  }
  const bytes = Uint8Array.from(atob(uri.slice(uri.indexOf(",") + 1)), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return {
    signature: [...bytes.subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join(""),
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

describe("the page head", () => {
  it("names the home-screen app swimcoach", () => {
    expect(head).toContain(`<meta name="apple-mobile-web-app-title" content="${APP_NAME}">`);
  });

  it("links the manifest", () => {
    expect(head).toContain('<link rel="manifest" href="/manifest.webmanifest">');
  });

  it("has exactly one apple-touch-icon, embedded as a PNG data URI, never a served path", () => {
    const links = head.match(/<link rel="apple-touch-icon"[^>]*>/gu) ?? [];
    expect(links).toHaveLength(1);
    expect(touchIcons).toHaveLength(1);
  });

  it("keeps the standalone and safe-area switches", () => {
    expect(head).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(head).toContain("viewport-fit=cover");
  });
});

describe("the manifest", () => {
  it("names the app and opens it standalone at the root", () => {
    expect(manifest.name).toBe("swimcoach");
    expect(manifest.short_name).toBe("swimcoach");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("takes both colors from the page ground token", () => {
    expect(manifest.background_color).toBe(PAGE_GROUND);
    expect(manifest.theme_color).toBe(PAGE_GROUND);
  });

  it("declares 192 and 512 icons that exist at the declared size", () => {
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(
        (i) => i.sizes === `${size}x${size}` && i.purpose === undefined,
      );
      expect(icon, `a ${size} icon`).toBeDefined();
      expect(icon?.type).toBe("image/png");
      const file = pngSize(icon?.src ?? "");
      expect(file).toEqual({ signature: PNG_SIGNATURE, width: size, height: size });
    }
  });

  it("declares no maskable icon: the mark reaches past a maskable icon's 40 % safe circle", () => {
    expect(manifest.icons.filter((i) => i.purpose !== undefined)).toEqual([]);
  });
});

describe("the touch icon", () => {
  it("is a 180 px PNG", () => {
    expect(pngSize("touch")).toEqual({
      signature: PNG_SIGNATURE,
      width: 180,
      height: 180,
    });
  });
});
