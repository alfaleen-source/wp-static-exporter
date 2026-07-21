# WP Static Exporter

Internal team utility for turning a rendered WordPress landing page into an organized static ZIP containing:

- `index.html`
- `assets/`
- `export-report.html`

The **Repair existing export** tab accepts only an earlier `index.html` plus the original website URL. It returns a small merge patch containing a replacement `index.html`, only newly downloaded files inside `assets/`, the latest `static-overrides.css`, and `MERGE-INSTRUCTIONS.txt`. Merge the patch assets into the old assets folder without deleting its existing files, then replace the old index. This avoids recapturing and redownloading the complete site.

The exporter renders and audits desktop, tablet, and mobile in Chromium, lazy-loads content, localizes images/fonts/stylesheets and CSS backgrounds, removes WordPress runtime scripts, preserves Google/GTM/Analytics/Ads tags, restores every Central CRM placeholder with its original token and loan type, places deduplicated CRM loaders before `</body>`, labels major sections, and generates an audit report.

Standalone packages localize every design dependency the exporter can discover: linked and imported CSS, nested CSS `url(...)` assets, fonts, ordinary and lazy-loaded images, responsive `srcset` sources, video posters, favicons and touch/mask icons, preload design assets, metadata images such as `msapplication-TileImage`, Open Graph/Twitter images, legacy `background` attributes, and SVG image/use references. WordPress discovery metadata, feeds, REST/oEmbed/XML-RPC links, canonical/shortlink/pingback references, obsolete conditional-comment dependencies, unresolved remote assets, external navigation targets, and remote embeds are removed. A generic final attribute audit prevents source-site absolute URLs from hiding in uncommon metadata or builder-specific data attributes. The export stops if any nonessential external dependency remains. Google tracking and CentralCRM loaders are the only intentional runtime exceptions and are reported separately.

Legacy WordPress themes are supported through the same rendered browser session used for capture. In particular, protected Imedica/WPBakery sites that set anti-bot cookies in JavaScript now pass those cookies, the original-site referrer, and a browser user agent to every asset request. Downloaded CSS, images, fonts, and other design files are payload-checked so an HTTP 200 HTML challenge page can never be silently saved as a `.css`, `.jpg`, or `.png` file. The same authenticated download and validation path is used by **Repair Existing Export**.

CSS asset paths are rewritten relative to where they are used: downloaded stylesheets reference sibling files inside `assets/`, while inline `<style>` blocks and `style` attributes reference `assets/...`. HTML-encoded quotes and malformed trailing semicolons in WordPress background URLs are repaired during export. Ultimate Addons full-width row backgrounds are converted from capture-time pixel measurements to responsive `100vw` geometry, with a final `assets/static-overrides.css` safeguard for script-free desktop, tablet, and mobile rendering.

Every package includes the canonical `SCDream1.woff2` through `SCDream9.woff2` files and matching weighted `SCDream` and `S-Core1` through `S-Core9` family declarations. Source references to those Dream fonts are redirected to the bundled fixed filenames. Other remote web-font binaries and Google Fonts/Adobe Typekit stylesheets are omitted from new exports and repair patches.

## Clean up an earlier extracted folder

The **Clean existing export** tab accepts the ZIP from an earlier export and returns a new cleaned ZIP. The original upload is never modified. Small files work directly in local development; deployed files up to 100 MB use Vercel Blob client uploads so they do not hit the platform's 4.5 MB function request limit.

1. Open **Clean existing export**.
2. Choose the old export ZIP, optionally set a package name, and enter the team password.
3. Select **Clean and package export**.
4. Download the result and open `cleanup-report.html` before publishing.

For local batch work, the cleanup command uses the same engine and always writes a **new folder**:

```powershell
npm run cleanup -- "C:\path\to\old-export" "C:\path\to\old-export-cleaned"
```

If the second path is omitted, the output is created beside the input with `-cleaned` appended. The command:

- replaces all downloaded web-font declarations and binaries with the nine canonical `SCDream*.woff2` files;
- preserves mixed stylesheets while removing their old `@font-face` blocks;
- removes font-only stylesheets after replacing them with canonical SCDream declarations;
- removes non-CSS assets only when they are unreachable from HTML, JavaScript, reachable CSS, SVG, and other inspected text dependencies;
- **does not automatically delete uncertain CSS files**. Unreferenced CSS and the assets it may need are retained as review candidates.

Open `cleanup-report.html` in the new folder after every run. It lists every deletion, the exact reason, removed font families, size savings, and CSS files retained for manual review. `cleanup-report.json` contains the same evidence for automation. Because icon libraries sometimes use fonts, visually verify icon glyphs at desktop, tablet, and mobile sizes before publishing.

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
