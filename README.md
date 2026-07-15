# WP Static Exporter

Internal team utility for turning a rendered WordPress landing page into an organized static ZIP containing:

- `index.html`
- `assets/`
- `export-report.html`

The exporter renders and audits desktop, tablet, and mobile in Chromium, lazy-loads content, localizes images/fonts/stylesheets and CSS backgrounds, removes WordPress runtime scripts, preserves Google/GTM/Analytics/Ads tags, restores every Central CRM placeholder with its original token and loan type, places deduplicated CRM loaders before `</body>`, labels major sections, and generates an audit report.

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
