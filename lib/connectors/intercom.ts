import { toHtml, type GuideDocument } from "./document";
import { callVendor, endpoint, requireCredential } from "./http";
import type {
  ArticleContainer, ConnectorContext, HelpCentreConnector, RemoteArticle,
} from "./types";

/**
 * Intercom Articles.
 *
 * Two things here are not obvious from the API reference.
 *
 * The region matters: `api.intercom.io` is the US, and an EU or Australian
 * workspace answers only on `api.eu.intercom.io` or `api.au.intercom.io`. A
 * token from the wrong region returns 401, which reads as "bad token" and
 * sends people to reissue one that was fine. So the base URL is the
 * customer's, not a constant.
 *
 * And an article needs an `author_id` that is a real teammate, so it is part
 * of the stored credentials rather than something we can invent.
 */
export class IntercomConnector implements HelpCentreConnector {
  readonly vendor = "intercom";

  constructor(private readonly fetchImpl?: typeof fetch) {}

  private headers(context: ConnectorContext): Record<string, string> {
    const token = requireCredential(this.vendor, context.credentials.token, "an access token");
    return {
      Authorization: `Bearer ${token}`,
      // Pinned. Intercom changes response shapes between versions, and an
      // unversioned request silently follows whatever is current.
      "Intercom-Version": "2.11",
    };
  }

  async listContainers(context: ConnectorContext): Promise<ArticleContainer[]> {
    const body = await callVendor<{ data?: { id: string; name: string }[] }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/help_center/collections?per_page=100"),
      headers: this.headers(context),
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return (body?.data ?? []).map((collection) => ({ id: collection.id, name: collection.name }));
  }

  async createArticle(context: ConnectorContext, document: GuideDocument): Promise<RemoteArticle> {
    const authorId = requireCredential(this.vendor, context.credentials.authorId, "an author id");

    const body = await callVendor<IntercomArticle>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/articles"),
      method: "POST",
      headers: this.headers(context),
      body: {
        title: document.title,
        description: document.summary ?? undefined,
        body: toHtml(document),
        author_id: Number(authorId),
        // Never published automatically. See the note in the Zendesk
        // adapter: a live help-centre page is not a place to put a change
        // nobody reviewed.
        state: "draft",
        parent_id: context.containerId ? Number(context.containerId) : undefined,
        parent_type: context.containerId ? "collection" : undefined,
      },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return shape(body);
  }

  async updateArticle(
    context: ConnectorContext,
    externalId: string,
    document: GuideDocument,
  ): Promise<RemoteArticle> {
    const body = await callVendor<IntercomArticle>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, `/articles/${encodeURIComponent(externalId)}`),
      method: "PUT",
      headers: this.headers(context),
      body: { title: document.title, body: toHtml(document) },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return shape(body);
  }

  async fetchArticle(context: ConnectorContext, externalId: string): Promise<RemoteArticle | null> {
    const body = await callVendor<IntercomArticle>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, `/articles/${encodeURIComponent(externalId)}`),
      headers: this.headers(context),
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return body?.id ? shape(body) : null;
  }
}

interface IntercomArticle {
  id?: string | number;
  title?: string;
  body?: string;
  url?: string;
  state?: string;
  updated_at?: number;
}

function shape(article: IntercomArticle | null): RemoteArticle {
  return {
    id: String(article?.id ?? ""),
    title: article?.title ?? "",
    html: article?.body ?? "",
    url: article?.url ?? null,
    // Intercom sends seconds, and reading them as milliseconds puts every
    // article in 1970.
    updatedAt: article?.updated_at ? new Date(article.updated_at * 1000) : null,
    published: article?.state === "published",
  };
}
