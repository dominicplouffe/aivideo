import { toHtml, type GuideDocument } from "./document";
import { callVendor, endpoint, requireCredential } from "./http";
import type {
  ArticleContainer, ConnectorContext, HelpCentreConnector, RemoteArticle,
} from "./types";

/**
 * Help Scout Docs.
 *
 * The one that catches people: creating an article returns only its id, not
 * the article. So a create is followed by a fetch — without it the link row
 * would have no URL and no body to hash, and the first sync afterwards would
 * report the article as changed by somebody else.
 *
 * Collections belong to sites, and articles belong to collections. Drafts
 * are the default here too.
 */
export class HelpScoutConnector implements HelpCentreConnector {
  readonly vendor = "helpscout";

  constructor(private readonly fetchImpl?: typeof fetch) {}

  private headers(context: ConnectorContext): Record<string, string> {
    const token = requireCredential(this.vendor, context.credentials.token, "an API key");
    return { Authorization: `Bearer ${token}` };
  }

  async listContainers(context: ConnectorContext): Promise<ArticleContainer[]> {
    const body = await callVendor<{ collections?: { items?: { id: string; name: string }[] } }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/v1/collections?pageSize=100"),
      headers: this.headers(context),
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return (body?.collections?.items ?? []).map((item) => ({ id: item.id, name: item.name }));
  }

  async createArticle(context: ConnectorContext, document: GuideDocument): Promise<RemoteArticle> {
    const collection = requireCredential(
      this.vendor,
      context.containerId ?? undefined,
      "a collection to file the article under",
    );

    const created = await callVendor<{ article?: { id?: string } }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/v1/articles"),
      method: "POST",
      headers: this.headers(context),
      body: {
        collectionId: collection,
        name: document.title,
        text: toHtml(document),
        status: "notpublished",
      },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    const id = created?.article?.id;
    if (!id) {
      return { id: "", title: document.title, html: toHtml(document), url: null, updatedAt: new Date() };
    }

    // A create answers with an id and nothing else, so the article is read
    // back. Otherwise the link row holds no body to compare against, and
    // the next sync reports the article as edited by somebody else.
    return (await this.fetchArticle(context, id)) ?? {
      id,
      title: document.title,
      html: toHtml(document),
      url: null,
      updatedAt: new Date(),
    };
  }

  async updateArticle(
    context: ConnectorContext,
    externalId: string,
    document: GuideDocument,
  ): Promise<RemoteArticle> {
    await callVendor<null>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, `/v1/articles/${encodeURIComponent(externalId)}`),
      method: "PUT",
      headers: this.headers(context),
      body: { name: document.title, text: toHtml(document) },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return (await this.fetchArticle(context, externalId)) ?? {
      id: externalId,
      title: document.title,
      html: toHtml(document),
      url: null,
      updatedAt: new Date(),
    };
  }

  async fetchArticle(context: ConnectorContext, externalId: string): Promise<RemoteArticle | null> {
    const body = await callVendor<{ article?: HelpScoutArticle }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, `/v1/articles/${encodeURIComponent(externalId)}`),
      headers: this.headers(context),
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    const article = body?.article;
    if (!article?.id) return null;

    return {
      id: String(article.id),
      title: article.name ?? "",
      html: article.text ?? "",
      url: article.publicUrl ?? null,
      updatedAt: article.updatedAt ? new Date(article.updatedAt) : null,
      published: article.status === "published",
    };
  }
}

interface HelpScoutArticle {
  id?: string;
  name?: string;
  text?: string;
  publicUrl?: string;
  status?: string;
  updatedAt?: string;
}
