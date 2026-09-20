# The embed runtime

One script tag, on somebody else's page:

```html
<div data-demoriff data-demo="prj_4b91de" data-aspect="16:9"></div>
<script async src="https://demoriff.com/embed.js"></script>
```

This is the only piece of the product that runs on a customer's own site,
which changes what "good" means. A bug here is a slower landing page for
someone who will remove the snippet and blame us — correctly.

## It must not damage the host page

**Zero layout shift — and the reservation is in the markup, not in the
script.** That distinction cost an afternoon. The first version applied
`aspect-ratio` from the runtime, and the test measured a CLS of exactly 0 …
until the suite ran under parallel load, when it measured 0.12. The script
had simply been beating the first paint on an idle machine. However small
and however async a script is, the browser can paint before it runs, and
growing an element from nothing then pushes the whole page down.

So the documented snippet carries `style="aspect-ratio:16/9;width:100%"`,
which reserves the exact height before our script exists. The runtime sets it
too, so an embed pasted without it still works — it shifts once on a slow
connection instead of never working — and warns in the console, because
somebody has to be able to find out why their Core Web Vitals moved.

The test now delays the script by 600ms on purpose, to force the paint-first
case that a fast local run would never reach, and asserts CLS is `0` — not
"small".

**No globals.** Nothing is written to `window`, no prototype is touched, and
the build fails if the bundle contains a `window.x =` assignment. "Our embed
broke their site" is not a support conversation worth having. Two copies of
the snippet on one page are harmless: a mounted element is marked and
skipped.

**Lazy below the fold.** An embed 2,000 pixels down should not compete for
bandwidth with the content the visitor is reading. It mounts 400px before it
scrolls into view, so it is ready when they arrive.

**Embeds added later mount too.** A CMS, a tab switch, a client-side route
change. Without a `MutationObserver` the snippet works on a static page and
mysteriously does not inside the customer's app.

**The size on the pricing page is the build budget.** A number in marketing
copy becomes a lie the first time someone adds a dependency, so
`scripts/build-embed.mjs` fails the build instead. If the runtime needs to
grow, the copy changes in the same commit. It currently builds to about 3.2
KB against a 6 KB ceiling.

## It must not be a liability

No cookies, no `localStorage`, no identifier generated or read — tests assert
all three are untouched after a view. The view beacon carries the demo id and
the **origin** of the referring page, never its path: the URL of a page on
somebody else's site is their data, not ours. `data-analytics="off"` stops
even that.

The consequence is the point: a marketing team can paste this without a
consent banner and without asking their legal team first.

## Two details that cost an afternoon

**The runtime must be served over HTTPS.** A browser blocks an `http://`
script on an `https://` page as mixed content — silently, with no error the
customer will notice. It also blocks a public page from reaching `localhost`
under Private Network Access rules, which is why the live check serves the
host page from another port rather than a fake public hostname.

**The Safari floor is 14.1, not 14.0.** esbuild refuses to emit destructuring
for Safari 14.0 because of a real bug there, and fails the build rather than
shipping something broken. Raising the floor by one point release is the
honest fix; the alternative is writing index-juggling loops to satisfy a
browser from 2020.

## The player

`/embed/[id]` renders the tour with no navigation, no footer and no sign-in
prompt — it is a component on a customer's page, not a page of ours wearing a
costume. Its step titles and narration are **server-rendered**, so they are
in the initial HTML: a demo embedded on a product page is content, and
content that only exists after JavaScript runs is content a search engine may
never see. A test loads it with JavaScript disabled and reads the steps out.

The frame is sandboxed without `allow-top-navigation`. The player is ours and
needs scripts; it does not need the ability to navigate the host page away.
The page itself is `noindex`: indexing the frame would compete with the
customer's own page for the same query.
