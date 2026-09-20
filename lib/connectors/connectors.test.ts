import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { documentHash, textHash, toHtml, toMarkdown, visibleText, type GuideDocument } from "./document";
import { getConnector } from "./index";
import { decide, documentFor, sealCredentials, syncProject } from "./sync";

/**
 * The claim worth testing is one sentence: a human edit in the help centre
 * is never silently overwritten. Most of this file is that sentence from a
 * different angle, plus the per-vendor request shapes — which are where the
 * bugs actually live, because each API is wrong in its own way.
 */

const RUN = isDatabaseConfigured();
const WS = "33333333-3333-4333-8333-333333333331";

const guide = (over: Partial<GuideDocument> = {}): GuideDocument => ({
  title: "Create a shipment",
  summary: "Three steps, ninety seconds.",
  locale: "en-US",
  steps: [
    { ordinal: 1, title: "Open the shipments page", body: "Click Shipments in the sidebar." },
    { ordinal: 2, title: "Start a new shipment", body: "Press New shipment." },
  ],
  videoUrl: "https://demoriff.com/v/abc",
  updatedAt: new Date("2026-09-20T10:00:00Z"),
  ...over,
});

/* ------------------------------------------------------------- the document */

describe("the guide document", () => {
  it("escapes every piece of customer text it renders", () => {
    const hostile = guide({
      title: '<script>alert(1)</script>',
      steps: [{ ordinal: 1, title: 'Click "Save" & go', body: "<img src=x onerror=alert(1)>" }],
    });

    const html = toHtml(hostile);
    // This text travels into somebody else's site, under their domain. What
    // we send them is our responsibility whether or not they would run it.
    // The test is that no *tag* survives — the escaped text still contains
    // the literal characters `onerror=`, and looking for that substring
    // would be a test that passes for the wrong reason.
    const tags = html.match(/<\/?([a-z][a-z0-9]*)\b/gi) ?? [];
    assert.deepEqual(
      [...new Set(tags.map((tag) => tag.replace(/[<\/]/g, "").toLowerCase()))].sort(),
      ["a", "li", "ol", "p", "strong"],
    );
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&quot;Save&quot; &amp; go/);
    // The title is not in the body at all: it goes to the vendor's own
    // title field, where each adapter sends it as data rather than markup.
    assert.equal(html.includes("alert(1)</script>"), false);
  });

  it("renders the same document as Markdown", () => {
    const markdown = toMarkdown(guide());
    assert.match(markdown, /^# Create a shipment/);
    assert.match(markdown, /1\. \*\*Open the shipments page\*\*/);
    assert.match(markdown, /\[Watch the video\]\(https:\/\/demoriff\.com\/v\/abc\)/);
  });

  it("hashes what a document says, not how it was serialised", () => {
    const base = guide();
    // Re-rendering moves the timestamp on every run. A hash that moved with
    // it would report every project as edited, on every sync, forever.
    assert.equal(documentHash(base), documentHash(guide({ updatedAt: new Date() })));
    assert.notEqual(documentHash(base), documentHash(guide({ title: "Create a delivery" })));
  });

  it("hashes alike across a round trip through somebody else's editor", () => {
    const ours = toHtml(guide());
    // Help centres reflow markup, rewrite entities and wrap articles in
    // templates. Two articles should hash alike when they read alike.
    const theirs = `<div class="article-body">\n  ${ours.replace(/\n/g, "\n  ")}\n</div>`;
    assert.equal(textHash(ours), textHash(theirs));
  });

  it("ignores script and style when reading an article back", () => {
    const wrapped = '<p>Hello</p><script>var a = "Goodbye";</script><style>p{color:red}</style>';
    assert.equal(visibleText(wrapped), "Hello");
  });

  it("drops words the editor cut, because the video no longer says them", () => {
    const document = documentFor(
      { title: "Create a shipment", description: null },
      [
        {
          ordinal: 0,
          title: "Open shipments",
          words: [
            { w: "Click" }, { w: "um", cut: true }, { w: "Shipments" }, { w: "." },
          ],
        },
      ],
      { videoUrl: "https://demoriff.com/v/abc" },
    );

    assert.equal(document.steps[0].body, "Click Shipments.");
    assert.equal(document.steps[0].ordinal, 1);
  });
});

/* -------------------------------------------------------------- the decision */

describe("deciding who has moved", () => {
  const pushed = "hash-a";

  it("is in sync when neither side has changed", () => {
    assert.equal(decide({ pushedHash: pushed, remoteHash: pushed, liveHash: pushed }), "in_sync");
  });

  it("is local_ahead when only the guide changed", () => {
    assert.equal(decide({ pushedHash: pushed, remoteHash: pushed, liveHash: "hash-b" }), "local_ahead");
  });

  it("is remote_ahead when only the help centre changed", () => {
    assert.equal(decide({ pushedHash: pushed, remoteHash: "hash-c", liveHash: pushed }), "remote_ahead");
  });

  it("is diverged when both did", () => {
    assert.equal(decide({ pushedHash: pushed, remoteHash: "hash-c", liveHash: "hash-b" }), "diverged");
  });

  it("does not treat a remote hash it never recorded as an edit", () => {
    assert.equal(decide({ pushedHash: pushed, remoteHash: null, liveHash: pushed }), "in_sync");
    assert.equal(decide({ pushedHash: null, remoteHash: null, liveHash: pushed }), "unlinked");
  });
});

/* ------------------------------------------------------------- the adapters */

describe("what each vendor is actually sent", () => {
  function recorder(responses: Record<string, unknown>) {
    const calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      calls.push({
        method: init?.method ?? "GET",
        url: href,
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const key = Object.keys(responses).find((pattern) => href.includes(pattern));
      return new Response(JSON.stringify(key ? responses[key] : {}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }

  const PUBLIC_DNS = async () => ["93.184.216.34"];

  const context = (over: Record<string, unknown> = {}) => ({
    baseUrl: "https://acme.example",
    credentials: { email: "ops@acme.com", token: "tok_1", authorId: "991" },
    containerId: "42",
    resolve: PUBLIC_DNS,
    ...over,
  });

  it("authenticates Zendesk with the /token suffix, and writes the body on the translation", async () => {
    const { calls, fetchImpl } = recorder({
      articles: { article: { id: 7, title: "Create a shipment", body: "<p>x</p>", html_url: "https://acme.zendesk.com/a/7" } },
      translations: { translation: { title: "Create a shipment", body: "<p>x</p>" } },
    });
    const connector = getConnector("zendesk", fetchImpl);

    await connector.createArticle(context(), guide());
    // `{email}:{token}` without the suffix fails with the same 401 as a bad
    // token, which is why this is worth a test rather than a comment.
    assert.equal(
      calls[0].headers.Authorization,
      `Basic ${Buffer.from("ops@acme.com/token:tok_1").toString("base64")}`,
    );
    // Lowercase: Zendesk rejects `en-US` with a 422 that says only
    // "locale is not valid".
    assert.match(calls[0].url, /help_center\/en-us\/sections\/42\/articles\.json$/);
    assert.equal((calls[0].body as { article: { draft: boolean } }).article.draft, true);

    await connector.updateArticle(context(), "7", guide());
    // The body lives on the translation. PUTting it on the article
    // silently does nothing.
    assert.match(calls[1].url, /articles\/7\/translations\/en-us\.json$/);
    assert.equal(calls[1].method, "PUT");
  });

  it("pins the Intercom version and reads its timestamps as seconds", async () => {
    const { calls, fetchImpl } = recorder({
      articles: { id: "31", title: "Create a shipment", body: "<p>x</p>", updated_at: 1_789_000_000, state: "draft" },
    });
    const connector = getConnector("intercom", fetchImpl);

    const article = await connector.createArticle(context(), guide());
    assert.equal(calls[0].headers["Intercom-Version"], "2.11");
    assert.equal((calls[0].body as { state: string }).state, "draft");
    // Seconds, not milliseconds. Reading them as milliseconds puts every
    // article in 1970.
    assert.equal(article.updatedAt?.getUTCFullYear(), 2026);
    assert.equal(article.published, false);
  });

  it("reads a Help Scout article back, because a create returns only an id", async () => {
    const { calls, fetchImpl } = recorder({
      "/v1/articles/88": { article: { id: "88", name: "Create a shipment", text: "<p>x</p>", publicUrl: "https://d.example/88" } },
      "/v1/articles": { article: { id: "88" } },
    });

    const article = await getConnector("helpscout", fetchImpl).createArticle(context(), guide());
    assert.equal(calls.length, 2);
    assert.equal(calls[1].method, "GET");
    // Without the read-back there is no body to hash, and the next sync
    // would report an edit that never happened.
    assert.equal(article.html, "<p>x</p>");
    assert.equal(article.url, "https://d.example/88");
  });

  it("clears a Notion page before rewriting it", async () => {
    const { calls, fetchImpl } = recorder({
      "/v1/pages/pg_1": { id: "pg_1", properties: {} },
      "children": { results: [{ id: "blk_1", type: "paragraph", paragraph: { rich_text: [{ plain_text: "old" }] } }] },
    });

    await getConnector("notion", fetchImpl).updateArticle(context(), "pg_1", guide());

    const deletes = calls.filter((call) => call.method === "DELETE");
    // Appending without this grows the page by a full copy of the guide on
    // every sync, which is what every naive Notion integration does.
    assert.equal(deletes.length, 1);
    assert.match(deletes[0].url, /blocks\/blk_1$/);

    const appends = calls.filter((call) => call.method === "PATCH" && call.url.includes("/children"));
    assert.equal(appends.length, 1);
  });

  it("truncates Notion rich text at the documented ceiling", async () => {
    const { calls, fetchImpl } = recorder({ "/v1/pages": { id: "pg_2" } });
    await getConnector("notion", fetchImpl).createArticle(
      context(),
      guide({ summary: "x".repeat(5000) }),
    );

    const children = (calls[0].body as { children: { paragraph?: { rich_text: { text: { content: string } }[] } }[] }).children;
    assert.equal(children[0].paragraph?.rich_text[0].text.content.length, 2000);
  });

  it("reads the Confluence version immediately before writing the next one", async () => {
    const { calls, fetchImpl } = recorder({
      "body-format=storage": { id: "9", title: "Create a shipment", status: "current", version: { number: 4 }, body: { storage: { value: "<p>x</p>" } } },
      "/wiki/api/v2/pages/9": { id: "9", title: "Create a shipment", version: { number: 5, createdAt: "2026-09-20T10:00:00Z" } },
    });

    await getConnector("confluence", fetchImpl).updateArticle(context(), "9", guide());

    assert.equal(calls[0].method, "GET");
    assert.equal(calls[1].method, "PUT");
    // Optimistic locking, not a formality: it is the only reason two syncs
    // racing cannot silently discard each other's write.
    assert.equal((calls[1].body as { version: { number: number } }).version.number, 5);
  });

  it("closes void elements for Confluence storage format", async () => {
    const { calls, fetchImpl } = recorder({ "/wiki/api/v2/pages": { id: "9" } });
    await getConnector("confluence", fetchImpl).createArticle(
      context(),
      guide({ steps: [{ ordinal: 1, title: "Step", body: "", screenshotUrl: "https://d.example/1.png" }] }),
    );

    const value = (calls[0].body as { body: { value: string } }).body.value;
    // Storage format is XHTML. An unclosed <img> is a parse error that
    // rejects the whole page.
    assert.match(value, /<img[^>]* \/>/);
  });

  it("refuses a help centre on the private network", async () => {
    const { fetchImpl } = recorder({});
    // The base URL is a destination somebody else chose, dialled from our
    // network. Same problem as an outbound webhook, same check.
    await assert.rejects(
      () =>
        getConnector("zendesk", fetchImpl).listContainers(
          context({ baseUrl: "http://169.254.169.254" }),
        ),
      /private or loopback|https/,
    );
  });
});

/* ------------------------------------------------------------ the sync loop */

describe("syncing a project", { skip: !RUN }, () => {
  const PUBLIC_DNS = async () => ["93.184.216.34"];
  let remote = { id: "art_1", title: "Create a shipment", html: "", url: "https://acme.example/a/1" };
  let created = 0;
  let updated = 0;

  const connectorFetch = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as { article?: { body?: string; title?: string } }) : undefined;

    if (method === "POST" && href.includes("/articles")) {
      created += 1;
      remote = { ...remote, title: body?.article?.title ?? "", html: body?.article?.body ?? "" };
      return json({ article: { id: remote.id, title: remote.title, body: remote.html, html_url: remote.url } });
    }
    if (method === "PUT") {
      updated += 1;
      const translation = (JSON.parse(String(init?.body)) as { translation: { title: string; body: string } }).translation;
      remote = { ...remote, title: translation.title, html: translation.body };
      return json({ translation });
    }
    return json({ article: { id: remote.id, title: remote.title, body: remote.html, html_url: remote.url } });
  }) as unknown as typeof fetch;

  function json(value: unknown) {
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  before(async () => {
    await eraseWorkspace(WS, "test setup");
  });

  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await closeDb();
  });

  let installation: typeof s.connectorInstallations.$inferSelect;
  let project: { id: string; workspaceId: string };

  beforeEach(async () => {
    await eraseWorkspace(WS, "test reset");
    created = 0;
    updated = 0;
    remote = { id: "art_1", title: "", html: "", url: "https://acme.example/a/1" };

    const db = getDb();
    await db.insert(s.workspaces).values({ id: WS, slug: "connector-test", name: "Connector Test" });
    const [row] = await db
      .insert(s.projects)
      .values({ workspaceId: WS, slug: "create-a-shipment", title: "Create a shipment" })
      .returning();
    project = { id: row.id, workspaceId: WS };

    [installation] = await db
      .insert(s.connectorInstallations)
      .values({
        workspaceId: WS,
        vendor: "zendesk",
        baseUrl: "https://acme.example",
        containerId: "42",
        credentialsSealed: sealCredentials({ email: "ops@acme.com", token: "tok_1" }),
      })
      .returning();
  });

  async function link() {
    const [row] = await getDb()
      .select()
      .from(s.connectorLinks)
      .where(eq(s.connectorLinks.projectId, project.id));
    return row;
  }

  it("creates the article the first time, and does nothing the second", async () => {
    const first = await syncProject(installation, project, guide(), { fetchImpl: connectorFetch, resolve: PUBLIC_DNS });
    assert.deepEqual([first.action, first.state], ["created", "in_sync"]);
    assert.equal(created, 1);

    const second = await syncProject(installation, project, guide(), { fetchImpl: connectorFetch, resolve: PUBLIC_DNS });
    // Nothing changed on either side, so nothing is sent. A sync that
    // rewrites an unchanged article churns the help centre's own revision
    // history and its "recently updated" list.
    assert.deepEqual([second.action, second.state], ["skipped", "in_sync"]);
    assert.equal(updated, 0);
  });

  it("pushes when the guide changed and the article did not", async () => {
    await syncProject(installation, project, guide(), { fetchImpl: connectorFetch, resolve: PUBLIC_DNS });
    const result = await syncProject(
      installation,
      project,
      guide({ steps: [{ ordinal: 1, title: "Open shipments", body: "Click Shipments." }] }),
      { fetchImpl: connectorFetch, resolve: PUBLIC_DNS },
    );

    assert.deepEqual([result.action, result.state], ["updated", "in_sync"]);
    assert.equal(updated, 1);
    assert.match(remote.html, /Click Shipments\./);
  });

  it("holds rather than overwriting an edit made in the help centre", async () => {
    await syncProject(installation, project, guide(), { fetchImpl: connectorFetch, resolve: PUBLIC_DNS });

    // A support lead fixes a sentence on the far side.
    remote = { ...remote, html: remote.html.replace("Click Shipments in the sidebar.", "Choose Shipments from the left nav.") };

    const result = await syncProject(installation, project, guide(), { fetchImpl: connectorFetch, resolve: PUBLIC_DNS });
    assert.deepEqual([result.action, result.state], ["held", "remote_ahead"]);
    assert.equal(updated, 0);
    assert.match(result.reason ?? "", /edited in the help centre/);
    assert.match(remote.html, /left nav/);

    assert.equal((await link()).state, "remote_ahead");
  });

  it("holds when both sides moved, and says which", async () => {
    await syncProject(installation, project, guide(), { fetchImpl: connectorFetch, resolve: PUBLIC_DNS });
    remote = { ...remote, html: `${remote.html}<p>Added by support.</p>` };

    const result = await syncProject(
      installation,
      project,
      guide({ title: "Create a delivery" }),
      { fetchImpl: connectorFetch, resolve: PUBLIC_DNS },
    );

    assert.deepEqual([result.action, result.state], ["held", "diverged"]);
    assert.equal(updated, 0);
    assert.match(result.reason ?? "", /Both/);
  });

  it("overwrites only when somebody explicitly chose to", async () => {
    await syncProject(installation, project, guide(), { fetchImpl: connectorFetch, resolve: PUBLIC_DNS });
    remote = { ...remote, html: `${remote.html}<p>Added by support.</p>` };

    const result = await syncProject(installation, project, guide(), {
      fetchImpl: connectorFetch,
      resolve: PUBLIC_DNS,
      force: true,
      actor: { memberId: null, email: "lead@acme.com" },
    });

    assert.deepEqual([result.action, result.state], ["updated", "in_sync"]);
    assert.equal(remote.html.includes("Added by support"), false);

    // Discarding somebody's edit is a decision, so it is in the log with a
    // name against it.
    const [entry] = await getDb()
      .select()
      .from(s.auditEvents)
      .where(eq(s.auditEvents.action, "connector.edit_overwritten"));
    assert.equal(entry.actorEmail, "lead@acme.com");
  });

  it("seals the vendor credentials rather than storing them", async () => {
    assert.equal(installation.credentialsSealed?.includes("tok_1"), false);
    // And they still reach the vendor: the Basic header the adapter builds
    // is derived from them on every call.
    await syncProject(installation, project, guide(), { fetchImpl: connectorFetch, resolve: PUBLIC_DNS });
    assert.equal(created, 1);
  });
});
