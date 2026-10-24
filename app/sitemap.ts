import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { productPages } from "@/lib/product-content";
import { solutionPages } from "@/lib/solutions-content";
import { comparePages } from "@/lib/compare-content";
import { posts } from "@/lib/blog-content";
import { courses } from "@/lib/academy-content";
import { allDocPages } from "@/lib/docs-content";
import { legalDocs } from "@/lib/legal-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${site.url}${path}`;

  const core: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/pricing"), changeFrequency: "weekly", priority: 0.9 },
    { url: url("/product"), changeFrequency: "weekly", priority: 0.9 },
    { url: url("/solutions"), changeFrequency: "weekly", priority: 0.8 },
    { url: url("/compare"), changeFrequency: "weekly", priority: 0.8 },
    { url: url("/security"), changeFrequency: "monthly", priority: 0.7 },
    { url: url("/integrations"), changeFrequency: "monthly", priority: 0.7 },
    { url: url("/blog"), changeFrequency: "daily", priority: 0.8 },
    { url: url("/academy"), changeFrequency: "weekly", priority: 0.7 },
    { url: url("/docs"), changeFrequency: "weekly", priority: 0.7 },
    { url: url("/docs/api"), changeFrequency: "weekly", priority: 0.7 },
    { url: url("/changelog"), changeFrequency: "weekly", priority: 0.6 },
    { url: url("/roi-calculator"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/about"), changeFrequency: "monthly", priority: 0.5 },
    { url: url("/careers"), changeFrequency: "weekly", priority: 0.5 },
    { url: url("/partners"), changeFrequency: "monthly", priority: 0.5 },
    { url: url("/press"), changeFrequency: "monthly", priority: 0.4 },
    { url: url("/contact"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/signup"), changeFrequency: "monthly", priority: 0.7 },
  ];

  return [
    ...core,
    ...productPages.map((p) => ({ url: url(`/product/${p.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    ...solutionPages.map((p) => ({ url: url(`/solutions/${p.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    ...comparePages.map((p) => ({ url: url(`/compare/${p.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
    ...posts.map((p) => ({ url: url(`/blog/${p.slug}`), lastModified: new Date(p.date), changeFrequency: "monthly" as const, priority: 0.7 })),
    ...courses.flatMap((c) =>
      c.lessons.map((l) => ({ url: url(`/academy/${c.slug}/${l.slug}`), changeFrequency: "monthly" as const, priority: 0.6 })),
    ),
    ...allDocPages.map((d) => ({ url: url(`/docs/${d.slug}`), changeFrequency: "monthly" as const, priority: 0.6 })),
    ...legalDocs.map((d) => ({ url: url(`/legal/${d.slug}`), lastModified: new Date(d.updated), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
