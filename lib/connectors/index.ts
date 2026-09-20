import { ConfluenceConnector } from "./confluence";
import { HelpScoutConnector } from "./helpscout";
import { IntercomConnector } from "./intercom";
import { NotionConnector } from "./notion";
import { ZendeskConnector } from "./zendesk";
import type { HelpCentreConnector } from "./types";

export * from "./types";
export * from "./document";

export type ConnectorVendor = "zendesk" | "intercom" | "helpscout" | "notion" | "confluence";

/** Every vendor, and what a customer has to supply to connect it. */
export const VENDORS: Record<
  ConnectorVendor,
  { label: string; baseUrlExample: string; credentials: string[]; containerLabel: string }
> = {
  zendesk: {
    label: "Zendesk Guide",
    baseUrlExample: "https://acme.zendesk.com",
    credentials: ["email", "token"],
    containerLabel: "Section",
  },
  intercom: {
    label: "Intercom Articles",
    // Not a constant: an EU or AU workspace answers only on its own host,
    // and a token from the wrong region fails as though it were invalid.
    baseUrlExample: "https://api.intercom.io",
    credentials: ["token", "authorId"],
    containerLabel: "Collection",
  },
  helpscout: {
    label: "Help Scout Docs",
    baseUrlExample: "https://docsapi.helpscout.net",
    credentials: ["token"],
    containerLabel: "Collection",
  },
  notion: {
    label: "Notion",
    baseUrlExample: "https://api.notion.com",
    credentials: ["token"],
    containerLabel: "Parent page",
  },
  confluence: {
    label: "Confluence Cloud",
    baseUrlExample: "https://acme.atlassian.net",
    credentials: ["email", "token"],
    containerLabel: "Space",
  },
};

export function getConnector(vendor: ConnectorVendor, fetchImpl?: typeof fetch): HelpCentreConnector {
  switch (vendor) {
    case "zendesk":
      return new ZendeskConnector(fetchImpl);
    case "intercom":
      return new IntercomConnector(fetchImpl);
    case "helpscout":
      return new HelpScoutConnector(fetchImpl);
    case "notion":
      return new NotionConnector(fetchImpl);
    case "confluence":
      return new ConfluenceConnector(fetchImpl);
  }
}
