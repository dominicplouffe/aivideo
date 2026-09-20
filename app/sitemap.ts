import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { productPages } from "@/lib/product-content";
import { solutionPages } from "@/lib/solutions-content";
import { comparePages } from "@/lib/compare-content";
import { caseStudies } from "@/lib/customers-content";
import { posts } from "@/lib/blog-content";
import { courses } from "@/lib/academy-content";
import { allDocPages } from "@/lib/docs-content";
import { legalDocs } from "@/lib/legal-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const url = (path: string) => `${site.url}${path}`;

  const core: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: url("/pricing"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: url("/product"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: url("/solutions"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: url("/customers"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: url("/compare"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: url("/security"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: url("/integrations"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: url("/blog"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: url("/academy"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: url("/docs"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: url("/docs/api"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: url("/changelog"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: url("/roi-calculator"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: url("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: url("/careers"), lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: url("/partners"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: url("/press"), lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: url("/contact"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: url("/signup"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  return [
    ...core,
    ...productPages.map((p) => ({ url: url(`/product/${p.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...solutionPages.map((p) => ({ url: url(`/solutions/${p.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...comparePages.map((p) => ({ url: url(`/compare/${p.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...caseStudies.map((c) => ({ url: url(`/customers/${c.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...posts.map((p) => ({ url: url(`/blog/${p.slug}`), lastModified: new Date(p.date), changeFrequency: "monthly" as const, priority: 0.7 })),
    ...courses.flatMap((c) =>
      c.lessons.map((l) => ({ url: url(`/academy/${c.slug}/${l.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
    ),
    ...allDocPages.map((d) => ({ url: url(`/docs/${d.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...legalDocs.map((d) => ({ url: url(`/legal/${d.slug}`), lastModified: new Date(d.updated), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
