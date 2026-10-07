import type { Metadata } from "next";
import { site } from "@/lib/site";
import { formatPrice, planFor, type Plan } from "@/lib/billing/plans";

/**
 * A public page's metadata: title, description, canonical, and the social
 * tags built from the same values.
 *
 * Next merges metadata shallowly. A page that sets no `openGraph` inherits the
 * root layout's, so every page used to share the homepage's og:url and title;
 * a page that sets one loses the layout's image. Building the whole set here
 * gives each page its own.
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  openGraph,
}: {
  title: string;
  description: string;
  /** The canonical path, starting with "/". */
  path: string;
  /** Use the title as-is, without the " · DemoRiff" template. */
  absoluteTitle?: boolean;
  /** Article fields and the like; merged over the defaults. */
  openGraph?: Metadata["openGraph"];
}): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} · ${site.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: site.name,
      locale: "en_US",
      title: socialTitle,
      description,
      images: [shareImage],
      ...openGraph,
    } as Metadata["openGraph"],
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      creator: site.twitter,
      images: [shareImage],
    },
  };
}

/** `app/opengraph-image.tsx`, named explicitly so pages that set openGraph keep it. */
const shareImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${site.name} — ${site.tagline}`,
};

const organizationId = `${site.url}/#organization`;

/**
 * Who publishes the site, the site itself, and the product with its prices,
 * for the homepage. Prices come from the billing catalogue so they cannot
 * drift from what Checkout charges.
 */
export function siteStructuredData(): Record<string, unknown> {
  const offer = (plan: Plan) => {
    const definition = planFor(plan);
    return {
      "@type": "Offer",
      name: definition.name,
      price: ((definition.priceCents ?? 0) / 100).toFixed(2),
      priceCurrency: "USD",
      description: formatPrice(plan),
      url: `${site.url}/pricing`,
    };
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: site.name,
        url: site.url,
        logo: `${site.url}/icon.svg`,
        email: site.supportEmail,
      },
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        name: site.name,
        url: site.url,
        publisher: { "@id": organizationId },
      },
      {
        "@type": "SoftwareApplication",
        name: site.name,
        url: site.url,
        description: site.description,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        publisher: { "@id": organizationId },
        offers: (["free", "byok", "studio"] as const).map(offer),
      },
    ],
  };
}

/** A blog post, so search engines read its headline, dates and author. */
export function articleStructuredData(post: {
  slug: string;
  title: string;
  dek: string;
  date: string;
  author: { name: string };
}): Record<string, unknown> {
  const url = `${site.url}/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.dek,
    datePublished: post.date,
    url,
    mainEntityOfPage: url,
    image: `${site.url}${shareImage.url}`,
    author: { "@type": "Person", name: post.author.name },
    publisher: { "@type": "Organization", "@id": organizationId, name: site.name },
  };
}

/** A JSON-LD block. `<` is escaped so page text can never close the script tag. */
export function jsonLd(data: Record<string, unknown>): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
