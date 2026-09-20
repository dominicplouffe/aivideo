import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, Badge, IconTile } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { FaqList } from "@/components/marketing/Faq";

export const metadata: Metadata = {
  title: "Trust & Security",
  description:
    "SOC 2 Type II, GDPR, zero model training on customer content, regional processing, private rendering, SSO, SCIM and audit log streaming. How DemoRiff handles your recordings.",
  alternates: { canonical: "/security" },
};

const certifications = [
  { name: "SOC 2 Type II", body: "Audited annually by an independent firm. Report available under NDA.", status: "Current" },
  { name: "ISO 27001", body: "Certified information security management system.", status: "Current" },
  { name: "GDPR", body: "DPA with Standard Contractual Clauses, EU representative appointed.", status: "Compliant" },
  { name: "CCPA / CPRA", body: "Consumer rights honoured for all California residents.", status: "Compliant" },
  { name: "HIPAA", body: "BAA available on Enterprise for covered entities.", status: "Available" },
  { name: "VPAT / WCAG 2.2 AA", body: "Accessibility conformance report for the app and player.", status: "Current" },
];

const pillars: { title: string; icon: IconName; body: string; points: string[] }[] = [
  {
    title: "Your content never trains a model",
    icon: "brain",
    body:
      "Media, transcripts, generated scripts and derived assets are never used to train any model — ours or a subprocessor's. Every model vendor we use operates under a zero-retention agreement, which means your frames are not retained after the inference call returns.",
    points: [
      "Stated in the DPA, not only in marketing material",
      "Applies on every plan, including Free",
      "Zero-retention agreements with every inference subprocessor",
      "No human review of customer content without explicit, per-incident consent",
    ],
  },
  {
    title: "Encrypted, scoped and deletable",
    icon: "lock",
    body:
      "AES-256 at rest, TLS 1.3 in transit, per-workspace key scoping and object-level access control. Deletion is real deletion: media is purged from primary storage, replicas and backups on a documented schedule, and we issue a signed certificate on request.",
    points: [
      "AES-256 at rest with per-workspace key scoping",
      "TLS 1.3 in transit, HSTS enforced, no TLS below 1.2",
      "Signed deletion certificates on request",
      "Configurable retention policies per workspace",
    ],
  },
  {
    title: "You choose where frames are processed",
    icon: "globe",
    body:
      "Pin capture, processing and storage to the United States, the European Union or Australia. On Enterprise, render workers deploy into your own AWS, GCP or Azure account, so media never leaves your perimeter — only the control plane is hosted by us.",
    points: [
      "US, EU and AU processing regions",
      "Private rendering inside your own cloud account (Enterprise)",
      "Regional pinning enforced at the workspace level",
      "No cross-region replication without explicit configuration",
    ],
  },
  {
    title: "Sensitive data masked before render",
    icon: "shield",
    body:
      "A screen recording of your product is a recording of your customers. Built-in detectors mask emails, phone numbers, card numbers, API keys, JWTs and common identifier patterns in-frame. Masking is applied at capture, so raw values never reach storage.",
    points: [
      "Detector, element, region and regex-based masking",
      "Applied at capture — raw values never persist",
      "Workspace policies that individual creators cannot disable",
      "Audit record of every rule applied to every recording",
    ],
  },
  {
    title: "Identity that fits your stack",
    icon: "key",
    body:
      "SAML 2.0 and OIDC single sign-on, SCIM 2.0 provisioning and deprovisioning, enforced domain capture that absorbs personal accounts on your domain, and role-based access control down to individual workspaces.",
    points: [
      "SAML 2.0 and OIDC with any IdP",
      "SCIM 2.0 provisioning, deprovisioning and group sync",
      "Enforced domain capture for shadow-IT consolidation",
      "Roles: owner, admin, creator, reviewer, viewer — per workspace",
    ],
  },
  {
    title: "An audit trail that answers questions",
    icon: "list",
    body:
      "Every view, export, share, permission change, masking rule and agent run is logged with actor, timestamp, IP and resource. Streamable to Splunk, Datadog, S3 or any SIEM over webhook, with a documented schema.",
    points: [
      "Immutable, append-only audit log",
      "Streaming to Splunk, Datadog, S3 or webhook",
      "Documented, versioned event schema",
      "Retained 24 months, configurable up to 7 years",
    ],
  },
];

const practices = [
  { label: "Penetration testing", value: "Annual third-party test plus continuous automated scanning. Summary report available." },
  { label: "Vulnerability disclosure", value: "Public programme at demoriff.com/security/disclosure with a 90-day coordinated window." },
  { label: "Uptime", value: "99.98% trailing twelve months. 99.9% SLA on Enterprise. Public status page." },
  { label: "Backups", value: "Continuous replication, point-in-time recovery to 35 days, quarterly restore drills." },
  { label: "Business continuity", value: "Multi-region failover with a 4-hour RTO and 15-minute RPO." },
  { label: "Employee access", value: "Least privilege, hardware-key MFA, quarterly access review, no standing production access." },
  { label: "Subprocessors", value: "Published list with 30-day change notification and an Enterprise objection window." },
  { label: "Incident response", value: "Documented plan, tabletop exercises twice yearly, 72-hour customer notification commitment." },
];

const faqs = [
  {
    q: "Do you use customer recordings to improve your models?",
    a: "No. Not on any plan, not in aggregate, not anonymised. Our contract says so in terms your legal team can rely on, rather than a general clause about improving our services. Every third-party model we call operates under a zero-retention agreement, meaning your content is not retained after the inference call completes.",
  },
  {
    q: "Which subprocessors have access to our media?",
    a: "The complete list, with the function each performs and the region it operates in, is published at demoriff.com/legal/subprocessors. Material changes are notified thirty days in advance, and Enterprise customers have a contractual right to object.",
  },
  {
    q: "Can we run this entirely inside our own cloud?",
    a: "On Enterprise, render workers deploy into your AWS, GCP or Azure account. Media is captured, processed and stored entirely within your perimeter. The control plane — project metadata, permissions, the editing interface — remains hosted by us and never receives the media itself.",
  },
  {
    q: "How quickly can you complete a security questionnaire?",
    a: "We maintain a completed CAIQ, SIG Lite and a standard questionnaire response pack, which we can send the same day. Custom questionnaires typically turn around in three to five business days. Median time from first security contact to approval across our Enterprise customers is seven days.",
  },
  {
    q: "What happens to our data if we leave?",
    a: "You can export everything — media, transcripts, guides, analytics — through the app or the API at any time, including after cancellation during a 90-day grace period. On request we delete everything and issue a signed certificate confirming purge from primary storage, replicas and backups.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="shield">Trust center</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              Your recordings contain
              <br className="hidden sm:block" /> your <span className="text-gradient">customers</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              A screen recording of your product is, by definition, a recording of real data. Most
              tools in this category were built for creators and retrofitted for companies. This one
              was built the other way round.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/contact?topic=security" size="md">Request the SOC 2 report</Button>
              <Button href="/legal/dpa" variant="outline" size="md">Read the DPA</Button>
            </div>
          </div>

          <Reveal delay={120}>
            <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {certifications.map((c) => (
                <div key={c.name} className="flex items-start gap-3 rounded-xl border border-[var(--line)] p-4">
                  <Icon name="check" className="mt-0.5 size-4 shrink-0 text-mint-400" strokeWidth={2.4} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[0.875rem] font-medium text-fg-strong">{c.name}</p>
                      <Badge tone="mint">{c.status}</Badge>
                    </div>
                    <p className="mt-1 text-[0.75rem] leading-snug text-fg-subtle">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <Section tone="raised">
        <div className="container-page">
          <SectionHeader
            eyebrow="Commitments"
            eyebrowIcon="lock"
            title="Six things we will not do with your content"
            className="mb-12"
          />
          <div className="grid gap-4 md:grid-cols-2">
            {pillars.map((p, i) => (
              <Reveal key={p.title} delay={(i % 2) * 70}>
                <Card className="flex h-full flex-col gap-4 p-6">
                  <IconTile name={p.icon} tone="mint" />
                  <h3 className="text-[1.0625rem] leading-snug">{p.title}</h3>
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

      <Section>
        <div className="container-page">
          <SectionHeader
            eyebrow="Operations"
            eyebrowIcon="settings"
            align="left"
            title="How we run the service"
            className="mb-10"
          />
          <dl className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {practices.map((p) => (
              <div key={p.label} className="grid gap-1 py-4 sm:grid-cols-[15rem_1fr] sm:gap-6">
                <dt className="text-[0.875rem] font-medium text-fg">{p.label}</dt>
                <dd className="text-[0.875rem] leading-relaxed text-fg-subtle">{p.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section tone="raised">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[20rem_1fr] lg:gap-16">
            <div>
              <SectionHeader eyebrow="Questions" eyebrowIcon="info" align="left" title="What security teams ask" />
              <p className="mt-6 text-[0.875rem] leading-relaxed text-fg-subtle">
                Need a questionnaire completed, a pen test summary, or a call with our security
                team? All three are routine and none of them require a sales process.
              </p>
              <Button href="/contact?topic=security" variant="outline" size="sm" className="mt-4">
                Contact security
              </Button>
            </div>
            <FaqList items={faqs} />
          </div>
        </div>
      </Section>
    </>
  );
}
