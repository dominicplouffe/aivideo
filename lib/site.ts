import type { IconName } from "@/components/ui/Icon";

export const site = {
  name: "DemoRiff",
  domain: "demoriff.com",
  url: "https://demoriff.com",
  tagline: "Studio-grade product demos from a rough screen recording",
  description:
    "DemoRiff turns one raw screen recording into a directed product demo video and a step-by-step written guide, edited as text.",
  twitter: "@demoriff",
  supportEmail: "hello@demoriff.com",
  salesEmail: "sales@demoriff.com",
  founded: 2024,
  hq: "San Francisco, CA",
} as const;

export interface NavItem {
  title: string;
  href: string;
  desc: string;
  icon: IconName;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const nav: {
  product: NavGroup[];
  solutions: NavItem[];
  resources: NavItem[];
} = {
  product: [
    {
      group: "Capture",
      items: [
        { title: "Screen Studio Recorder", href: "/product/recorder", desc: "4K capture with intent tracking baked into every click.", icon: "record" },
        { title: "Import & Re-cut", href: "/product/import", desc: "Bring Loom, Zoom, Gong or MP4 files into the pipeline.", icon: "upload" },
      ],
    },
    {
      group: "Produce",
      items: [
        { title: "AI Video Studio", href: "/product/studio", desc: "Edit video by editing the transcript. Zooms, cuts, b-roll — automatic.", icon: "wand" },
        { title: "Voices & Cloning", href: "/product/voice", desc: "260 studio voices, or a clone of yours from 30 seconds.", icon: "mic" },
        { title: "AI Presenters", href: "/product/avatars", desc: "Put a presenter on screen without booking a studio.", icon: "avatar" },
        { title: "Brand System", href: "/product/brand", desc: "One brand kit applied to every frame your team ships.", icon: "palette" },
      ],
    },
    {
      group: "Publish",
      items: [
        { title: "Interactive Demos", href: "/product/interactive", desc: "Turn the same recording into a clickable product tour.", icon: "cursor" },
        { title: "Docs & Guides", href: "/product/docs", desc: "A written, screenshot-perfect article from the same take.", icon: "doc" },
        { title: "Localization", href: "/product/localization", desc: "34 languages, lip-synced, in one click.", icon: "globe" },
        { title: "Hosting & Analytics", href: "/product/analytics", desc: "Share pages, embeds, CTAs and per-second engagement.", icon: "chart" },
      ],
    },
  ],
  solutions: [
    { title: "Product Marketing", href: "/solutions/product-marketing", desc: "Launch assets in hours, not sprint cycles.", icon: "megaphone" },
    { title: "Sales Engineering", href: "/solutions/sales", desc: "Personalized demos for every deal in the pipeline.", icon: "target" },
    { title: "Customer Education", href: "/solutions/customer-education", desc: "An academy that keeps pace with your release notes.", icon: "graduation" },
    { title: "Customer Support", href: "/solutions/support", desc: "Cut ticket volume with video answers that scale.", icon: "lifebuoy" },
    { title: "Founders & Seed Teams", href: "/solutions/founders", desc: "Look like a category leader before you hire one.", icon: "rocket" },
    { title: "Enterprise & IT", href: "/solutions/enterprise", desc: "SSO, residency, audit trails, private rendering.", icon: "shield" },
  ],
  resources: [
    { title: "The Riff (Blog)", href: "/blog", desc: "Field notes on demand generation through video.", icon: "book" },
    { title: "Demo Academy", href: "/academy", desc: "A free course on demos that actually convert.", icon: "graduation" },
    { title: "Help Center", href: "/docs", desc: "Guides, references and troubleshooting.", icon: "lifebuoy" },
    { title: "Developer API", href: "/docs/api", desc: "Render videos programmatically from your CI.", icon: "code" },
    { title: "Changelog", href: "/changelog", desc: "Everything we shipped, every week.", icon: "lightning" },
    { title: "Integrations", href: "/integrations", desc: "42 tools that plug into the pipeline.", icon: "puzzle" },
    { title: "Trust & Security", href: "/security", desc: "How we handle your recordings, and what is not in place yet.", icon: "shield" },
  ],
};

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

export const footerNav: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "AI Video Studio", href: "/product/studio" },
      { label: "Screen Recorder", href: "/product/recorder" },
      { label: "AI Presenters", href: "/product/avatars" },
      { label: "Voices & Cloning", href: "/product/voice" },
      { label: "Interactive Demos", href: "/product/interactive" },
      { label: "Docs & Guides", href: "/product/docs" },
      { label: "Localization", href: "/product/localization" },
      { label: "Analytics", href: "/product/analytics" },
      { label: "Brand System", href: "/product/brand" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Product Marketing", href: "/solutions/product-marketing" },
      { label: "Sales Engineering", href: "/solutions/sales" },
      { label: "Customer Education", href: "/solutions/customer-education" },
      { label: "Customer Support", href: "/solutions/support" },
      { label: "Founders & Seed Teams", href: "/solutions/founders" },
      { label: "Enterprise & IT", href: "/solutions/enterprise" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "The Riff", href: "/blog" },
      { label: "Demo Academy", href: "/academy" },
      { label: "Help Center", href: "/docs" },
      { label: "Developer API", href: "/docs/api" },
      { label: "Changelog", href: "/changelog" },
      { label: "Integrations", href: "/integrations" },
      { label: "ROI Calculator", href: "/roi-calculator" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "vs. Trupeer", href: "/compare/trupeer" },
      { label: "vs. Descript", href: "/compare/descript" },
      { label: "vs. Creatify", href: "/compare/creatify" },
      { label: "vs. Loom", href: "/compare/loom" },
      { label: "vs. Arcade", href: "/compare/arcade" },
      { label: "vs. Scribe", href: "/compare/scribe" },
      { label: "All comparisons", href: "/compare" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Contact Sales", href: "/contact" },
      { label: "Trust & Security", href: "/security" },
      { label: "Partners", href: "/partners" },
      { label: "Press Kit", href: "/press" },
    ],
  },
];

export const legalNav: { label: string; href: string }[] = [
  { label: "Terms", href: "/legal/terms" },
  { label: "Privacy", href: "/legal/privacy" },
  { label: "DPA", href: "/legal/dpa" },
  { label: "Subprocessors", href: "/legal/subprocessors" },
  { label: "Acceptable Use", href: "/legal/acceptable-use" },
];
