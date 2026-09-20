import { toHtml, type GuideDocument } from "./document";
import { basicAuth, callVendor, endpoint, requireCredential } from "./http";
import type {
  ArticleContainer, ConnectorContext, HelpCentreConnector, RemoteArticle,
} from "./types";

/**
 * Zendesk Guide.
 *
 * Articles live in sections, sections in categories. An article cannot be
 * created without a section, which is why `containerId` is required here and
 * the setup screen makes somebody pick one.
 *
 * Authentication is Basic with `{email}/token:{api_token}` — a shape unique
 * to Zendesk and easy to get subtly wrong, because `{email}:{api_token}`
 * without the `/token` suffix fails with the same 401 as a bad token.
 */
export class ZendeskConnector implements HelpCentreConnector {
  readonly vendor = "zendesk";

  constructor(private readonly fetchImpl?: typeof fetch) {}

  private auth(context: ConnectorContext): Record<string, string> {
    const email = requireCredential(this.vendor, context.credentials.email, "an account email");
    const token = requireCredential(this.vendor, context.credentials.token, "an API token");
    return { Authorization: basicAuth(`${email}/token`, token) };
  }

  private locale(document: GuideDocument): string {
    // Zendesk wants a lowercase locale, and rejects `en-US` with a 422 that
    // says only "locale is not valid".
    return document.locale.toLowerCase();
  }

  async listContainers(context: ConnectorContext): Promise<ArticleContainer[]> {
    const body = await callVendor<{ sections?: { id: number; name: string; category_id?: number }[] }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/api/v2/help_center/sections.json?per_page=100"),
      headers: this.auth(context),
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return (body?.sections ?? []).map((section) => ({
      id: String(section.id),
      name: section.name,
      parentName: section.category_id ? `Category ${section.category_id}` : null,
    }));
  }

  async createArticle(context: ConnectorContext, document: GuideDocument): Promise<RemoteArticle> {
    const section = requireCredential(this.vendor, context.containerId ?? undefined, "a section to file the article under");

    const body = await callVendor<{ article?: ZendeskArticle }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, `/api/v2/help_center/${this.locale(document)}/sections/${section}/articles.json`),
      method: "POST",
      headers: this.auth(context),
      body: {
        article: {
          title: document.title,
          body: toHtml(document),
          locale: this.locale(document),
          // Drafts, deliberately. An automated publish straight to a live
          // help centre is a change nobody reviewed, on a page customers
          // read. Somebody presses publish on the Zendesk side.
          draft: true,
        },
      },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return shape(body?.article);
  }

  async updateArticle(
    context: ConnectorContext,
    externalId: string,
    document: GuideDocument,
  ): Promise<RemoteArticle> {
    // Zendesk splits an article's metadata from its translated body. The
    // body lives on the translation, and PUTting it on the article silently
    // does nothing.
    const body = await callVendor<{ translation?: { title?: string; body?: string } }>({
      vendor: this.vendor,
      url: endpoint(
        context.baseUrl,
        `/api/v2/help_center/articles/${encodeURIComponent(externalId)}/translations/${this.locale(document)}.json`,
      ),
      method: "PUT",
      headers: this.auth(context),
      body: { translation: { title: document.title, body: toHtml(document) } },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return {
      id: externalId,
      title: body?.translation?.title ?? document.title,
      html: body?.translation?.body ?? toHtml(document),
      url: null,
      updatedAt: new Date(),
    };
  }

  async fetchArticle(context: ConnectorContext, externalId: string): Promise<RemoteArticle | null> {
    const body = await callVendor<{ article?: ZendeskArticle }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, `/api/v2/help_center/articles/${encodeURIComponent(externalId)}.json`),
      headers: this.auth(context),
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return body?.article ? shape(body.article) : null;
  }
}

interface ZendeskArticle {
  id?: number;
  title?: string;
  body?: string;
  html_url?: string;
  updated_at?: string;
  draft?: boolean;
}

function shape(article: ZendeskArticle | undefined): RemoteArticle {
  return {
    id: String(article?.id ?? ""),
    title: article?.title ?? "",
    html: article?.body ?? "",
    url: article?.html_url ?? null,
    updatedAt: article?.updated_at ? new Date(article.updated_at) : null,
    published: article?.draft === false,
  };
}
