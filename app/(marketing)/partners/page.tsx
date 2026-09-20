import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, IconTile } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Partners",
  description:
    "Agency, technology and reseller partnerships with DemoRiff — margins, co-marketing, and a certification programme for practitioners.",
  alternates: { canonical: "/partners" },
};

const programmes = [
  {
    icon: "briefcase" as const,
    title: "Agency partners",
    body:
      "Product marketing and demand-gen agencies who produce video for SaaS clients. Manage every client workspace from one console, keep 25% recurring margin, and stop losing the production retainer to a tool the client bought themselves.",
    points: ["25% recurring margin", "Multi-client console", "Co-branded client share pages", "Priority migration support"],
  },
  {
    icon: "puzzle" as const,
    title: "Technology partners",
    body:
      "Help centers, LMS platforms, CRMs and CMSs whose users need video and documentation. Build on the public API, get listed in the integrations directory, and we will co-market the launch.",
    points: ["Public REST API and webhooks", "Directory listing and launch post", "Joint solution briefs", "Dedicated partner engineer"],
  },
  {
    icon: "globe" as const,
    title: "Resellers & distributors",
    body:
      "Regional resellers serving markets where local contracting, invoicing and language support matter. Full deal registration, regional pricing, and localized enablement material.",
    points: ["Deal registration and protection", "Regional pricing and invoicing", "Localized enablement", "Named channel manager"],
  },
];

const benefits = [
  { title: "Real margins, not referral fees", body: "Recurring revenue share on every account for as long as it renews, not a one-time bounty." },
  { title: "Certification that means something", body: "A practitioner course and exam covering the pipeline, brand governance and demo strategy. Certified partners are listed publicly." },
  { title: "Co-marketing budget", body: "Joint webinars, case studies and conference presence, funded proportionally to committed pipeline." },
  { title: "Product influence", body: "A quarterly partner council that sees the roadmap early and changes it more often than you would expect." },
];

export default function PartnersPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="puzzle">Partners</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              Build a practice on
              <br className="hidden sm:block" /> <span className="text-gradient">production velocity</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              The agencies doing best with DemoRiff stopped selling production hours and started
              selling a content operation. Three programmes, real margins, and a certification your
              clients can look up.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/contact?topic=partners" size="md">Apply to partner</Button>
              <Button href="/docs/api" variant="outline" size="md">Read the API docs</Button>
            </div>
          </div>
        </div>
      </section>

      <Section className="py-10 md:py-14">
        <div className="container-page">
          <div className="grid gap-4 lg:grid-cols-3">
            {programmes.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <Card className="flex h-full flex-col gap-4 p-6">
                  <IconTile name={p.icon} tone={(["iris", "cyan", "mint"] as const)[i]} />
                  <h2 className="text-[1.0625rem] leading-snug">{p.title}</h2>
                  <p className="text-[0.875rem] leading-relaxed text-fg-subtle">{p.body}</p>
                  <ul className="mt-auto flex flex-col gap-2 border-t border-[var(--line)] pt-4">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2.5 text-[0.8125rem] text-fg-muted">
                        <Icon name="check" className="mt-0.5 size-3.5 shrink-0 text-mint-400" strokeWidth={2.4} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <Section tone="raised">
        <div className="container-page">
          <SectionHeader eyebrow="Why partner" eyebrowIcon="trending" title="What you get either way" className="mb-12" />
          <div className="grid gap-4 sm:grid-cols-2">
            {benefits.map((b, i) => (
              <Reveal key={b.title} delay={(i % 2) * 70}>
                <Card className="flex h-full flex-col gap-2.5 p-6">
                  <h3 className="text-[1rem] leading-snug">{b.title}</h3>
                  <p className="text-[0.875rem] leading-relaxed text-fg-subtle">{b.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
