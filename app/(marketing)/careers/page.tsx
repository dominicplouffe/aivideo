import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, Badge } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Careers",
  description: "Open roles at DemoRiff across engineering, product, design and go-to-market. Remote-first across 14 countries.",
  alternates: { canonical: "/careers" },
};

const roles = [
  { title: "Senior Video Pipeline Engineer", team: "Engineering", location: "Remote (US / EU)", type: "Full-time", desc: "FFmpeg, GPU encoding, and making a three-minute render finish in ninety seconds." },
  { title: "ML Engineer, Speech", team: "Engineering", location: "Remote (US / EU)", type: "Full-time", desc: "Narration models tuned for product vocabulary, voice cloning, and cross-lingual timbre transfer." },
  { title: "Senior Frontend Engineer, Studio", team: "Engineering", location: "Remote (Global)", type: "Full-time", desc: "The transcript editor and timeline. Hard rendering problems, strong opinions about latency." },
  { title: "Product Designer, Studio", team: "Design", location: "Remote (US / EU)", type: "Full-time", desc: "Designing an editor that a non-editor can use without a tutorial." },
  { title: "Product Manager, Enterprise", team: "Product", location: "San Francisco / Remote", type: "Full-time", desc: "Governance, residency, private rendering and the things security teams ask for." },
  { title: "Solutions Engineer, EMEA", team: "Go-to-market", location: "London / Berlin", type: "Full-time", desc: "Run live recordings against a prospect's product on the first call. Make it look easy." },
  { title: "Content Lead", team: "Marketing", location: "Remote (US)", type: "Full-time", desc: "Own The Riff and Demo Academy. Write things practitioners actually forward." },
  { title: "Security Engineer", team: "Engineering", location: "Remote (US / EU)", type: "Full-time", desc: "Masking detectors, audit infrastructure, and the answers to four hundred questionnaires." },
];

const benefits = [
  { icon: "globe" as const, title: "Remote-first, 14 countries", body: "Hubs in San Francisco, London and Lisbon. Nobody is required to move anywhere." },
  { icon: "clock" as const, title: "Sustainable pace", body: "No on-call heroics for people who did not sign up for on-call. Unlimited leave with a four-week minimum we actually enforce." },
  { icon: "creditCard" as const, title: "Transparent bands", body: "Salary bands published internally and shared in the first conversation. No negotiation advantage for the confident." },
  { icon: "graduation" as const, title: "$3,000 learning budget", body: "Annual, no approval needed, and it rolls over once." },
  { icon: "users" as const, title: "Equity for everyone", body: "Meaningful grants at every level, with a ten-year exercise window." },
  { icon: "lifebuoy" as const, title: "Health, properly", body: "Full medical, dental, vision and mental health cover for you and dependants, wherever you are." },
];

const teams = Array.from(new Set(roles.map((r) => r.team)));

export default function CareersPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="rocket">Careers</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              Help software explain
              <br className="hidden sm:block" /> <span className="text-gradient">itself</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Seventy-two people across fourteen countries, building the tooling that turns a rough
              screen recording into something a company is proud to publish. We are hiring in
              engineering, design, product and go-to-market.
            </p>
          </div>
        </div>
      </section>

      <Section className="py-10 md:py-14">
        <div className="container-page">
          <SectionHeader eyebrow="Open roles" eyebrowIcon="briefcase" align="left" title={`${roles.length} positions open`} className="mb-8" />
          {teams.map((team) => (
            <div key={team} className="mb-10 last:mb-0">
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-[0.875rem] font-semibold text-fg-strong">{team}</h2>
                <span className="h-px flex-1 bg-[var(--line)]" />
              </div>
              <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {roles.filter((r) => r.team === team).map((r) => (
                  <a
                    key={r.title}
                    href={`mailto:careers@demoriff.com?subject=${encodeURIComponent(r.title)}`}
                    className="group flex flex-col gap-2 py-5 transition-colors sm:flex-row sm:items-center sm:gap-6"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[1rem] font-medium text-fg-strong transition-colors group-hover:text-iris-300">
                        {r.title}
                      </p>
                      <p className="mt-1 text-[0.8125rem] leading-snug text-fg-subtle">{r.desc}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone="neutral">{r.location}</Badge>
                      <Badge tone="neutral">{r.type}</Badge>
                      <Icon
                        name="arrowRight"
                        className="size-4 text-fg-faint transition-transform group-hover:translate-x-0.5"
                        strokeWidth={2}
                      />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="raised">
        <div className="container-page">
          <SectionHeader eyebrow="Working here" eyebrowIcon="users" title="What we offer" className="mb-12" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b, i) => (
              <Reveal key={b.title} delay={(i % 3) * 70}>
                <Card className="flex h-full flex-col gap-3 p-6">
                  <Icon name={b.icon} className="size-5 text-iris-400" strokeWidth={1.7} />
                  <h3 className="text-[0.9375rem] font-medium text-fg-strong">{b.title}</h3>
                  <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">{b.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
          <div className="mt-14 flex flex-col items-center gap-4 text-center">
            <h2 className="text-[1.25rem]">Nothing that fits?</h2>
            <p className="max-w-lg text-[0.875rem] leading-relaxed text-fg-subtle">
              Tell us what you would want to work on. We have opened roles for people before, and
              we would rather hear from you early than not at all.
            </p>
            <Button href="mailto:careers@demoriff.com" variant="outline" size="md" className="mt-2">
              careers@demoriff.com
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
