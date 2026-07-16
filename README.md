# WP Static Exporter

Internal team utility for turning a rendered WordPress landing page into an organized static ZIP containing:

- `index.html`
- `assets/`
- `export-report.html`

The **Repair existing export** tab accepts only an earlier `index.html` plus the original website URL. It returns a small merge patch containing a replacement `index.html`, only newly downloaded files inside `assets/`, the latest `static-overrides.css`, and `MERGE-INSTRUCTIONS.txt`. Merge the patch assets into the old assets folder without deleting its existing files, then replace the old index. This avoids recapturing and redownloading the complete site.

The exporter renders and audits desktop, tablet, and mobile in Chromium, lazy-loads content, localizes images/fonts/stylesheets and CSS backgrounds, removes WordPress runtime scripts, preserves Google/GTM/Analytics/Ads tags, restores every Central CRM placeholder with its original token and loan type, places deduplicated CRM loaders before `</body>`, labels major sections, and generates an audit report.

Standalone packages localize every design dependency the exporter can discover: linked and imported CSS, nested CSS `url(...)` assets, fonts, ordinary and lazy-loaded images, responsive `srcset` sources, video posters, favicons and touch/mask icons, preload design assets, metadata images such as `msapplication-TileImage`, Open Graph/Twitter images, legacy `background` attributes, and SVG image/use references. WordPress discovery metadata, feeds, REST/oEmbed/XML-RPC links, canonical/shortlink/pingback references, obsolete conditional-comment dependencies, unresolved remote assets, external navigation targets, and remote embeds are removed. A generic final attribute audit prevents source-site absolute URLs from hiding in uncommon metadata or builder-specific data attributes. The export stops if any nonessential external dependency remains. Google tracking and CentralCRM loaders are the only intentional runtime exceptions and are reported separately.

CSS asset paths are rewritten relative to where they are used: downloaded stylesheets reference sibling files inside `assets/`, while inline `<style>` blocks and `style` attributes reference `assets/...`. HTML-encoded quotes and malformed trailing semicolons in WordPress background URLs are repaired during export. Ultimate Addons full-width row backgrounds are converted from capture-time pixel measurements to responsive `100vw` geometry, with a final `assets/static-overrides.css` safeguard for script-free desktop, tablet, and mobile rendering.

Every package includes the canonical `SCDream1.woff2` through `SCDream9.woff2` files and matching `S-Core1` through `S-Core9` family declarations. Source references to those Dream fonts are redirected to the bundled fixed filenames instead of downloading new hashed copies.

JavaScript-driven WordPress counters are materialized at their final `data-counter-value`. Ultimate Addons horizontal carousels are converted to responsive CSS scroll-snap layouts, removing frozen Slick widths and transforms. Central CRM placeholders use repeatable `data-crm-token` attributes, and pages with multiple unique tokens receive one deduplicated batch loader at the bottom.

## Local setup

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `EXPORTER_PASSWORD` in `.env.local`. Without `BLOB_READ_WRITE_TOKEN`, local downloads work only when the generated ZIP is below Vercel's direct-response limit.

## Vercel setup

1. Import this repository into Vercel.
2. Add an `EXPORTER_PASSWORD` environment variable for Production, Preview, and Development.
3. Create a Vercel Blob store and connect it to the project. Vercel supplies `BLOB_READ_WRITE_TOKEN` automatically.
4. Deploy. The API route is configured for a 300-second maximum duration.

## Operating limits

- One page per export
- 450 downloaded assets
- 18 MB per asset
- 90 MB uncompressed downloaded assets
- Public HTTP/HTTPS sources only
- Private, loopback, link-local, and credential-bearing URLs are blocked
- Export stops instead of producing a package when responsive CRM token placement differs between desktop, tablet, and mobile captures

Only export sites you own or are authorized to reproduce. Review `export-report.html` and visually check desktop, tablet, and mobile layouts before publishing an exported site.
