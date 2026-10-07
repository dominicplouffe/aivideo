import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { integrations } from "@/lib/marketing-data";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, Badge } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = pageMetadata({
  title: "Integrations",
  description:
    "DemoRiff connects to Slack, Notion, Confluence, Zendesk, Intercom, HubSpot, Salesforce, Figma, GitHub, Linear, Segment, Zapier, Okta and more — plus a public REST API and webhooks.",
  path: "/integrations",
});

const categories = Array.from(new Set(integrations.map((i) => i.category)));

const apiCapabilities = [
  { title: "Render from CI", body: "POST a script and a brand kit, get back a rendered MP4 and a guide. Teams wire this to release tags." },
  { title: "Webhooks on every state change", body: "Recording uploaded, transcription complete, render finished, view threshold crossed, translation published." },
  { title: "Bulk operations", body: "Import a library, apply a brand kit across a collection, queue translations for a whole workspace." },
  { title: "Analytics export", body: "Pull per-second retention and viewer identity into your warehouse on a schedule, or stream via Segment." },
];

export default function IntegrationsPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="puzzle">Integrations</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              It plugs into the stack
              <br className="hidden sm:block" /> you <span className="text-gradient">already run</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              A video nobody can find is a video nobody watches. DemoRiff publishes into your help
              center, syncs engagement to your CRM, renders from your CI, and tells Slack when it is
              ready.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/docs/api" size="md">Read the API docs</Button>
              <Button href="/contact" variant="outline" size="md">Request an integration</Button>
            </div>
          </div>
        </div>
      </section>

      <Section className="py-12 md:py-16">
        <div className="container-page">
          {categories.map((cat, ci) => (
            <div key={cat} className="mb-12 last:mb-0">
              <div className="mb-5 flex items-center gap-3">
                <h2 className="text-[0.875rem] font-semibold text-fg-strong">{cat}</h2>
                <span className="h-px flex-1 bg-[var(--line)]" />
                <span className="font-mono text-2xs text-fg-faint">
                  {integrations.filter((i) => i.category === cat).length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {integrations
                  .filter((i) => i.category === cat)
                  .map((it, i) => (
                    <Reveal key={it.name} delay={(i % 3) * 60}>
                      <Card interactive className="flex h-full items-start gap-3.5 p-5">
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-ink-850 text-iris-400">
                          <Icon name={it.icon} className="size-4" strokeWidth={1.7} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[0.9375rem] font-medium text-fg-strong">{it.name}</p>
                          <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">{it.blurb}</p>
                        </div>
                      </Card>
                    </Reveal>
                  ))}
              </div>
              {ci === 0 ? null : null}
            </div>
          ))}

          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--line-strong)] p-8 text-center">
            <Badge tone="neutral">24 more</Badge>
            <p className="max-w-lg text-[0.875rem] leading-relaxed text-fg-subtle">
              Asana, Jira, ClickUp, Monday, Docebo, Skilljar, Thought Industries, WorkRamp, Front,
              HelpScout, Freshdesk, Gainsight, Marketo, Pardot, Mixpanel, Heap, Snowflake, BigQuery,
              Contentful, Sanity, Ghost, HubSpot CMS, Shopify and Microsoft Teams.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="raised">
        <div className="container-page">
          <SectionHeader
            eyebrow="Developer API"
            eyebrowIcon="code"
            title="Or build exactly what you need"
            description="A REST API over the whole pipeline, webhooks on every state change, and SDKs for TypeScript, Python and Go."
            className="mb-12"
          />
          <div className="grid gap-4 md:grid-cols-2">
            {apiCapabilities.map((a, i) => (
              <Reveal key={a.title} delay={(i % 2) * 70}>
                <Card className="flex h-full flex-col gap-2.5 p-6">
                  <h3 className="text-[1rem] leading-snug">{a.title}</h3>
                  <p className="text-[0.875rem] leading-relaxed text-fg-subtle">{a.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-ink-950">
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-ink-900/70 px-4 py-2.5">
                <span className="font-mono text-2xs text-fg-faint">POST /v1/renders</span>
                <span className="font-mono text-2xs text-mint-400">201 Created</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[0.75rem] leading-relaxed text-fg-muted">
{`curl https://api.demoriff.com/v1/renders \\
  -H "Authorization: Bearer $DEMORIFF_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recording_id": "rec_8f2c1a",
    "brand_kit": "kit_meridian_primary",
    "voice": "avery-warm-us",
    "outputs": ["video", "guide", "interactive", "clips"],
    "locales": ["en-US", "de-DE", "ja-JP"],
    "webhook_url": "https://hooks.meridian.app/demoriff"
  }'`}
              </pre>
            </div>
          </Reveal>

          <div className="mt-8 flex justify-center">
            <Button href="/docs/api" variant="outline" size="md">
              Full API reference
              <Icon name="arrowRight" className="size-4" strokeWidth={2} />
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
