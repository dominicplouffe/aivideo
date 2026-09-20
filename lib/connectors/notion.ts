import { toHtml, type GuideDocument, type GuideStep } from "./document";
import { callVendor, endpoint, requireCredential } from "./http";
import type {
  ArticleContainer, ConnectorContext, HelpCentreConnector, RemoteArticle,
} from "./types";

/**
 * Notion.
 *
 * The odd one out, and the reason `HelpCentreConnector` speaks in HTML but
 * this adapter does not: Notion has no body field. A page is a tree of
 * blocks, and there is no endpoint that accepts HTML or Markdown. So this
 * adapter is the one place that translates the document into blocks, and
 * reads blocks back into something the sync layer can hash.
 *
 * Two constraints that shape the code:
 *
 *  - A page create accepts at most 100 children, and a block's rich text at
 *    most 2000 characters. Both are silent-ish failures — a 400 naming a
 *    path like `children[100]` — so both are enforced here.
 *  - Updating a page cannot replace its content. Blocks are children, and
 *    the only honest update is to delete the ones we wrote and append
 *    fresh. Anything else grows the page on every sync.
 */
export class NotionConnector implements HelpCentreConnector {
  readonly vendor = "notion";

  constructor(private readonly fetchImpl?: typeof fetch) {}

  private headers(context: ConnectorContext): Record<string, string> {
    const token = requireCredential(this.vendor, context.credentials.token, "an integration token");
    return {
      Authorization: `Bearer ${token}`,
      // Required, and Notion rejects a request without it rather than
      // defaulting to the latest.
      "Notion-Version": "2022-06-28",
    };
  }

  async listContainers(context: ConnectorContext): Promise<ArticleContainer[]> {
    const body = await callVendor<{ results?: NotionSearchResult[] }>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/v1/search"),
      method: "POST",
      headers: this.headers(context),
      body: { filter: { value: "page", property: "object" }, page_size: 100 },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    return (body?.results ?? []).map((page) => ({
      id: page.id,
      name: titleOf(page) || "Untitled",
    }));
  }

  async createArticle(context: ConnectorContext, document: GuideDocument): Promise<RemoteArticle> {
    const parent = requireCredential(this.vendor, context.containerId ?? undefined, "a parent page");

    const body = await callVendor<NotionPage>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, "/v1/pages"),
      method: "POST",
      headers: this.headers(context),
      body: {
        parent: { page_id: parent },
        properties: { title: { title: [text(document.title)] } },
        children: blocksFor(document).slice(0, 100),
      },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    // Anything past the hundredth block is appended, because a create
    // refuses more than that outright.
    const overflow = blocksFor(document).slice(100);
    if (body?.id && overflow.length > 0) await this.append(context, body.id, overflow);

    return { id: body?.id ?? "", title: document.title, html: toHtml(document), url: body?.url ?? null };
  }

  async updateArticle(
    context: ConnectorContext,
    externalId: string,
    document: GuideDocument,
  ): Promise<RemoteArticle> {
    await callVendor<NotionPage>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, `/v1/pages/${encodeURIComponent(externalId)}`),
      method: "PATCH",
      headers: this.headers(context),
      body: { properties: { title: { title: [text(document.title)] } } },
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });

    // Cleared before it is rewritten. Appending without this grows the page
    // by a full copy of the guide on every sync, which is the behaviour
    // every naive Notion integration ships with.
    const existing = await this.children(context, externalId);
    for (const block of existing) {
      await callVendor<null>({
        vendor: this.vendor,
        url: endpoint(context.baseUrl, `/v1/blocks/${encodeURIComponent(block.id)}`),
        method: "DELETE",
        headers: this.headers(context),
        fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
      });
    }

    await this.append(context, externalId, blocksFor(document));

    return { id: externalId, title: document.title, html: toHtml(document), url: null, updatedAt: new Date() };
  }

  async fetchArticle(context: ConnectorContext, externalId: string): Promise<RemoteArticle | null> {
    const page = await callVendor<NotionPage>({
      vendor: this.vendor,
      url: endpoint(context.baseUrl, `/v1/pages/${encodeURIComponent(externalId)}`),
      headers: this.headers(context),
      fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
    });
    if (!page?.id) return null;

    const blocks = await this.children(context, externalId);

    // Rendered back to HTML rather than compared as blocks, so the sync
    // layer has one representation to hash whichever vendor it is talking
    // to. Only the text matters to that comparison.
    const html = blocks.map(renderBlock).filter(Boolean).join("\n");

    return {
      id: page.id,
      title: titleOf(page as NotionSearchResult),
      html,
      url: page.url ?? null,
      updatedAt: page.last_edited_time ? new Date(page.last_edited_time) : null,
    };
  }

  private async append(context: ConnectorContext, pageId: string, blocks: unknown[]): Promise<void> {
    // A hundred at a time, because that is the documented ceiling.
    for (let i = 0; i < blocks.length; i += 100) {
      await callVendor<null>({
        vendor: this.vendor,
        url: endpoint(context.baseUrl, `/v1/blocks/${encodeURIComponent(pageId)}/children`),
        method: "PATCH",
        headers: this.headers(context),
        body: { children: blocks.slice(i, i + 100) },
        fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
      });
    }
  }

  private async children(context: ConnectorContext, pageId: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;

    do {
      const url = new URL(endpoint(context.baseUrl, `/v1/blocks/${encodeURIComponent(pageId)}/children`));
      url.searchParams.set("page_size", "100");
      if (cursor) url.searchParams.set("start_cursor", cursor);

      const body = await callVendor<{ results?: NotionBlock[]; next_cursor?: string | null; has_more?: boolean }>({
        vendor: this.vendor,
        url: url.toString(),
        headers: this.headers(context),
        fetchImpl: context.fetchImpl ?? this.fetchImpl,
      resolve: context.resolve,
      });

      blocks.push(...(body?.results ?? []));
      cursor = body?.has_more ? (body.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return blocks;
  }
}

/* ---------------------------------------------------------------- blocks */

/** Notion refuses rich text longer than this, per block. */
const RICH_TEXT_LIMIT = 2000;

function text(value: string) {
  return { type: "text", text: { content: value.slice(0, RICH_TEXT_LIMIT) } };
}

function paragraph(value: string) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: [text(value)] } };
}

function blocksFor(document: GuideDocument): unknown[] {
  const blocks: unknown[] = [];

  if (document.summary) blocks.push(paragraph(document.summary));
  if (document.videoUrl) {
    blocks.push({
      object: "block",
      type: "bookmark",
      bookmark: { url: document.videoUrl, caption: [text("Watch the video")] },
    });
  }

  for (const step of document.steps) blocks.push(...stepBlocks(step));
  return blocks;
}

function stepBlocks(step: GuideStep): unknown[] {
  const blocks: unknown[] = [
    {
      object: "block",
      type: "numbered_list_item",
      numbered_list_item: { rich_text: [text(step.title)] },
    },
  ];

  if (step.body) blocks.push(paragraph(step.body));
  if (step.screenshotUrl) {
    blocks.push({
      object: "block",
      type: "image",
      image: { type: "external", external: { url: step.screenshotUrl } },
    });
  }

  return blocks;
}

function renderBlock(block: NotionBlock): string {
  const kind = block.type;
  const content = block[kind] as { rich_text?: { plain_text?: string }[] } | undefined;
  const plain = (content?.rich_text ?? []).map((run) => run.plain_text ?? "").join("");
  if (!plain) return "";

  if (kind === "numbered_list_item" || kind === "bulleted_list_item") return `<li>${plain}</li>`;
  if (kind?.startsWith("heading")) return `<h2>${plain}</h2>`;
  return `<p>${plain}</p>`;
}

interface NotionPage {
  id?: string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
}

interface NotionSearchResult extends NotionPage {
  id: string;
}

interface NotionBlock {
  id: string;
  type: string;
  [key: string]: unknown;
}

function titleOf(page: NotionSearchResult): string {
  const properties = (page.properties ?? {}) as Record<string, { title?: { plain_text?: string }[] }>;
  for (const property of Object.values(properties)) {
    if (Array.isArray(property?.title)) {
      return property.title.map((run) => run.plain_text ?? "").join("");
    }
  }
  return "";
}
