import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/ContactForm";
import { site } from "@/lib/site";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, Card } from "@/components/ui/Primitives";
import { LogoWall } from "@/components/marketing/LogoWall";

export const metadata: Metadata = {
  title: "Contact sales",
  description:
    "Talk to someone who has onboarded a few hundred teams. Security review, procurement, pricing for volume, or an honest opinion about whether this is the right tool for you.",
  alternates: { canonical: "/contact" },
};

const routes = [
  { icon: "briefcase" as const, title: "Sales", body: "Volume pricing, a walkthrough against your product, or a written ROI model.", email: site.salesEmail },
  { icon: "shield" as const, title: "Security & procurement", body: "SOC 2 report, questionnaires, DPA, MSA redlines and BAAs.", email: "security@demoriff.com" },
  { icon: "lifebuoy" as const, title: "Support", body: "Something broken, something confusing, or a render that did not come out right.", email: site.supportEmail },
  { icon: "megaphone" as const, title: "Press & partnerships", body: "Media enquiries, analyst briefings, integration partnerships and reselling.", email: "press@demoriff.com" },
];

export default function ContactPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-10 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="mail">Contact</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              Twenty minutes with someone
              <br className="hidden sm:block" /> who has <span className="text-gradient">done this before</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Not a qualification call. You bring your product, we run a recording of it live, and
              you leave with a finished demo whether or not you buy anything. If it is the wrong
              tool for your problem, we will say so.
            </p>
          </div>
        </div>
      </section>

      <Section className="py-10 md:py-14">
        <div className="container-page">
          <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-14">
            <ContactForm />

            <aside className="flex flex-col gap-4">
              {routes.map((r) => (
                <Card key={r.title} className="flex gap-3.5 p-5">
                  <Icon name={r.icon} className="mt-0.5 size-[1.125rem] shrink-0 text-iris-400" strokeWidth={1.7} />
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium text-fg-strong">{r.title}</p>
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">{r.body}</p>
                    <a
                      href={`mailto:${r.email}`}
                      className="mt-2 inline-block font-mono text-2xs text-iris-300 hover:text-iris-400"
                    >
                      {r.email}
                    </a>
                  </div>
                </Card>
              ))}

              <Card className="p-5">
                <p className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Response times</p>
                <dl className="mt-3 space-y-2 text-[0.8125rem]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-subtle">Sales enquiry</dt>
                    <dd className="text-fg">Same business day</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-subtle">Security questionnaire</dt>
                    <dd className="text-fg">3–5 business days</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-subtle">Support (Team+)</dt>
                    <dd className="text-fg">Under 4 hours</dd>
                  </div>
                </dl>
              </Card>
            </aside>
          </div>

          <div className="mt-16">
            <LogoWall label="Teams we have onboarded" marquee={false} />
          </div>
        </div>
      </Section>
    </>
  );
}
