import { toHtml, type GuideDocument } from "./document";
import { basicAuth, callVendor, endpoint, requireCredential } from "./http";
import type {
  ArticleContainer, ConnectorContext, HelpCentreConnector, RemoteArticle,
} from "./types";

/**
 * Confluence Cloud.
 *
 * Two things dominate this adapter.
 *
 * **Version numbers.** Every update must name the version it is replacing,
 * and Confluence rejects an update whose number is not exactly one higher
 * than the current one. That is not a formality — it is optimistic locking,
 * and it is the only reason two syncs racing cannot silently discard each
 * other's write. So the current version is read immediately before every
 * update rather than remembered from the last one.
 *
 * **Storage format.** Confluence stores its own XHTML dialect, not HTML. It
 * is close enough that ordinary paragraphs and lists pass through, and far
 * enough that an unescaped `&` is a parse error which rejects the whole
 * page.
 */
export class ConfluenceConnector implements HelpCentreConnector {
  readonly vendor = "confluence";

  constructor(private readonly fetchImpl?: typeof fetch) {}

  private headers(context: ConnectorContext): Record<string, string> {
    const email = requireCredential(this.vendor, context.credentials.email, "an account email");
    const token = requireCredential(this.vendor, context.credentials.token, "an API token");
    return { Authorization: basicAuth(email, token) };
  }

  async listContainers(context: ConnectorContext): Promise<ArticleContainer[]> {
    const body = await callVendor<{ results?: { key?: string; id?: string | number; name?: string }[] }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/wiki/api/v2/spaces?limit=100"),
      headers: this.headers(context),
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return (body?.results ?? []).map((space) => ({
      id: String(space.id ?? space.key ?? ""),
      name: space.name ?? space.key ?? "",
    }));
  }

  async createArticle(context: ConnectorContext, document: GuideDocument): Promise<RemoteArticle> {
    const spaceId = requireCredential(this.vendor, context.containerId ?? undefined, "a space to create the page in");

    const body = await callVendor<ConfluencePage>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/wiki/api/v2/pages"),
      method: "POST",
      headers: this.headers(context),
      body: {
        spaceId,
        // Drafts, as everywhere else here: a live documentation page is not
        // a place to put a change nobody reviewed.
        status: "draft",
        title: document.title,
        body: { representation: "storage", value: toStorage(document) },
      },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return shape(body, context.baseUrl, document);
  }

  async updateArticle(
    context: ConnectorContext,
    externalId: string,
    document: GuideDocument,
  ): Promise<RemoteArticle> {
    // Read immediately before the write. A version number cached from the
    // last sync would be stale the moment anybody edited the page, and
    // Confluence would refuse the update — or worse, accept it and discard
    // their edit.
    const current = await this.raw(context, externalId);
    if (!current) {
      throw new Error(`Confluence page ${externalId} no longer exists.`);
    }

    const body = await callVendor<ConfluencePage>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, `/wiki/api/v2/pages/${encodeURIComponent(externalId)}`),
      method: "PUT",
      headers: this.headers(context),
      body: {
        id: externalId,
        status: current.status ?? "current",
        title: document.title,
        body: { representation: "storage", value: toStorage(document) },
        version: {
          number: (current.version?.number ?? 1) + 1,
          message: "Updated from DemoRiff",
        },
      },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return shape(body, context.baseUrl, document);
  }

  async fetchArticle(context: ConnectorContext, externalId: string): Promise<RemoteArticle | null> {
    const page = await this.raw(context, externalId);
    if (!page?.id) return null;

    return {
      id: String(page.id),
      title: page.title ?? "",
      html: page.body?.storage?.value ?? "",
      url: page._links?.webui ? endpoint(context.baseUrl, `/wiki${page._links.webui}`) : null,
      updatedAt: page.version?.createdAt ? new Date(page.version.createdAt) : null,
      published: page.status === "current",
    };
  }

  private async raw(context: ConnectorContext, externalId: string): Promise<ConfluencePage | null> {
    return callVendor<ConfluencePage>({
      vendor: this.vendor,
      url: endpoint(
        context.baseUrl,
        `/wiki/api/v2/pages/${encodeURIComponent(externalId)}?body-format=storage`,
      ),
      headers: this.headers(context),
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });
  }
}

/**
 * Confluence storage format.
 *
 * `toHtml` already escapes every text node, which is most of what is needed
 * — an unescaped `&` in storage format is a parse error that rejects the
 * whole page rather than rendering oddly. What is left is the void
 * elements: storage format is XHTML, so `<img>` must close itself.
 */
function toStorage(document: GuideDocument): string {
  return toHtml(document).replace(/<img([^>]*?)\/?>/g, "<img$1 />");
}

interface ConfluencePage {
  id?: string | number;
  title?: string;
  status?: string;
  version?: { number?: number; createdAt?: string };
  body?: { storage?: { value?: string } };
  _links?: { webui?: string };
}

function shape(page: ConfluencePage | null, baseUrl: string, document: GuideDocument): RemoteArticle {
  return {
    id: String(page?.id ?? ""),
    title: page?.title ?? document.title,
    html: page?.body?.storage?.value ?? toStorage(document),
    url: page?._links?.webui ? endpoint(baseUrl, `/wiki${page._links.webui}`) : null,
    updatedAt: page?.version?.createdAt ? new Date(page.version.createdAt) : new Date(),
    published: page?.status === "current",
  };
}
