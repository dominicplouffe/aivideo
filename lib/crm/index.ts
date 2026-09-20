import { callVendor, endpoint } from "@/lib/connectors/http";
import { ProviderError } from "@/lib/providers/errors";

/**
 * Pushing a known viewer into a CRM.
 *
 * The narrowest possible surface: find or create a contact, and attach one
 * note saying what they watched. Deliberately not a sync — a CRM is the
 * customer's system of record for their pipeline, and a demo tool that
 * writes lifecycle stages or owner fields into it is a demo tool their
 * revenue operations team removes.
 *
 * What we send is what we know and they gave us: an address, and the fact
 * that they watched a specific demo for a specific length of time. Never the
 * anonymous sessions, because those are not attributable to anybody and
 * pretending otherwise in somebody's CRM would be inventing data.
 */

export type CrmVendor = "hubspot" | "salesforce" | "pipedrive";

export interface CrmContext {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  resolve?: (hostname: string) => Promise<string[]>;
}

export interface CrmContactInput {
  email: string;
  name?: string | null;
  company?: string | null;
}

export interface CrmEngagement {
  /** What they watched. */
  title: string;
  watchedSeconds: number;
  assetSeconds: number;
  reachedEnd: boolean;
  url?: string | null;
  at: Date;
}

export interface CrmConnector {
  readonly vendor: CrmVendor;
  upsertContact(context: CrmContext, contact: CrmContactInput): Promise<{ id: string }>;
  logEngagement(context: CrmContext, contactId: string, engagement: CrmEngagement): Promise<void>;
}

/** Minutes and seconds, because "watched 142s" reads like a log line. */
export function describeEngagement(engagement: CrmEngagement): string {
  const share = engagement.assetSeconds > 0
    ? Math.round((engagement.watchedSeconds / engagement.assetSeconds) * 100)
    : 0;
  const minutes = Math.floor(engagement.watchedSeconds / 60);
  const seconds = engagement.watchedSeconds % 60;
  const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return [
    `Watched "${engagement.title}" for ${duration} (${share}% of it)`,
    engagement.reachedEnd ? " and reached the end" : "",
    engagement.url ? `.\n${engagement.url}` : ".",
  ].join("");
}

/**
 * HubSpot.
 *
 * Two calls. `upsert` is a search-then-create rather than the batch upsert
 * endpoint, because the batch one requires a property to be configured as a
 * unique identifier on the customer's portal and fails with a 400 that says
 * nothing useful when it is not.
 */
export class HubSpotCrm implements CrmConnector {
  readonly vendor = "hubspot" as const;

  async upsertContact(context: CrmContext, contact: CrmContactInput): Promise<{ id: string }> {
    const found = await callVendor<{ results?: { id: string }[] }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/crm/v3/objects/contacts/search"),
      method: "POST",
      headers: { Authorization: `Bearer ${context.token}` },
      body: {
        filterGroups: [
          { filters: [{ propertyName: "email", operator: "EQ", value: contact.email }] },
        ],
        limit: 1,
      },
      fetchImpl: context.fetchImpl,
      resolve: context.resolve,
    });

    const existing = found?.results?.[0]?.id;
    if (existing) return { id: existing };

    const [firstname, ...rest] = (contact.name ?? "").split(" ");
    const created = await callVendor<{ id?: string }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/crm/v3/objects/contacts"),
      method: "POST",
      headers: { Authorization: `Bearer ${context.token}` },
      body: {
        properties: {
          email: contact.email,
          // Only what they gave us. Nothing inferred, nothing enriched.
          ...(firstname ? { firstname } : {}),
          ...(rest.length > 0 ? { lastname: rest.join(" ") } : {}),
          ...(contact.company ? { company: contact.company } : {}),
        },
      },
      fetchImpl: context.fetchImpl,
      resolve: context.resolve,
    });

    if (!created?.id) {
      throw new ProviderError("HubSpot created no contact and returned no id.", {
        provider: this.vendor,
        retryable: true,
      });
    }
    return { id: created.id };
  }

  async logEngagement(
    context: CrmContext,
    contactId: string,
    engagement: CrmEngagement,
  ): Promise<void> {
    await callVendor<unknown>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/crm/v3/objects/notes"),
      method: "POST",
      headers: { Authorization: `Bearer ${context.token}` },
      body: {
        properties: {
          hs_timestamp: engagement.at.getTime(),
          hs_note_body: describeEngagement(engagement),
        },
        associations: [
          {
            to: { id: contactId },
            // 202 is HubSpot's "note to contact" association type. A wrong
            // id here creates an orphaned note nobody ever sees.
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
          },
        ],
      },
      fetchImpl: context.fetchImpl,
      resolve: context.resolve,
    });
  }
}

export function getCrm(vendor: CrmVendor): CrmConnector {
  switch (vendor) {
    case "hubspot":
      return new HubSpotCrm();
    default:
      throw new ProviderError(`No adapter for ${vendor} yet.`, {
        provider: vendor,
        retryable: false,
      });
  }
}
