import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The workspace is private. Sign-in is left crawlable so its noindex
        // tag can be read; a blocked page can still be indexed from links.
        disallow: ["/app", "/app/", "/api/"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
