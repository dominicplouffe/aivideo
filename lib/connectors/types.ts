import type { GuideDocument } from "./document";

/**
 * Help-centre connectors.
 *
 * Every vendor on the list does the same four things — create an article,
 * update it, read it back, and list the containers new articles can go into
 * — behind four different APIs, four authentication schemes and four content
 * models. One narrow interface, one adapter each, and the sync logic in
 * `sync.ts` never learns a vendor's name.
 *
 * `fetchArticle` returning the body as HTML is the load-bearing part. It is
 * what makes the sync two-way: without reading back what the help centre
 * actually holds, "publish" is a one-way export and every human edit on the
 * far side is destroyed by the next render.
 */

export interface RemoteArticle {
  id: string;
  title: string;
  /** The body as the help centre holds it now, in HTML. */
  html: string;
  url?: string | null;
  updatedAt?: Date | null;
  /** Vendors that distinguish drafts from published articles. */
  published?: boolean;
}

export interface ArticleContainer {
  id: string;
  name: string;
  /** e.g. a Zendesk category, a Confluence space. For a picker. */
  parentName?: string | null;
}

export interface ConnectorCredentials {
  /** An API token, an OAuth access token, or a Basic pair, per vendor. */
  token?: string;
  email?: string;
  /** Zendesk subdomains, Confluence sites, Notion databases. */
  [key: string]: string | undefined;
}

export interface ConnectorContext {
  baseUrl: string;
  credentials: ConnectorCredentials;
  containerId?: string | null;
  fetchImpl?: typeof fetch;
  /** Injectable so the destination check is testable without DNS. */
  resolve?: (hostname: string) => Promise<string[]>;
}

export interface HelpCentreConnector {
  readonly vendor: string;
  /** Containers a new article can be filed under. For the setup screen. */
  listContainers(context: ConnectorContext): Promise<ArticleContainer[]>;
  createArticle(context: ConnectorContext, document: GuideDocument): Promise<RemoteArticle>;
  updateArticle(
    context: ConnectorContext,
    externalId: string,
    document: GuideDocument,
  ): Promise<RemoteArticle>;
  fetchArticle(context: ConnectorContext, externalId: string): Promise<RemoteArticle | null>;
}
