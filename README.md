# BJORK UI

Production-ready interface pieces, primitive components, shader studies, and product UI fragments packaged as a shadcn-compatible registry.

Live site: [ui.isaiahbjork.com](https://ui.isaiahbjork.com)

Registry:

```txt
https://ui.isaiahbjork.com/registry.json
https://ui.isaiahbjork.com/{name}.json
```

The `/r/*` registry URLs are also supported for backwards compatibility.

## Install

Add the registry namespace:

```bash
npx shadcn@latest registry add @bjork-ui=https://ui.isaiahbjork.com/{name}.json
```

Install a component:

```bash
npx shadcn@latest add @bjork-ui/message-dock
```

You can also install directly from a URL:

```bash
npx shadcn@latest add https://ui.isaiahbjork.com/message-dock.json
```

## Development

Install dependencies:

```bash
npm install
```

Run the local site:

```bash
npm run dev -- -p 3001
```

Build the site:

```bash
npm run build
```

## Registry

Generate and validate the registry:

```bash
npm run registry:validate
```

Build the public registry files:

```bash
npm run registry:build
```

The registry source is generated from `lib/bjork-gallery.ts` and written to:

- `registry.json`
- `public/r/registry.json`
- `public/r/{name}.json`

## Notes

BJORK UI is an independent registry. It is not affiliated with or endorsed by shadcn/ui.

## License

MIT
