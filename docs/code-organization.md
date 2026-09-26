# Code organization

The browser still loads classic scripts in the order declared by `index.html`.
This is intentional: existing global bindings, inline handlers, and initialization
timing remain compatible while the source is organized by feature domain.

## Maintained source size

- Prefer 20–40 KB for JavaScript and 10–30 KB for CSS.
- Treat 50 KB as a soft limit, not a reason to split a cohesive class or function.
- Domain files under `modules/` and `css/` should be named for their responsibility.
- Do not add new numbered `features-*`, `part-*`, or A/B buckets.

## Generated entry files

`index.html` is a small document shell. `modules/bootstrap/document-loader.js`
loads ordered local script fragments and replaces the shell with their combined
document. This keeps direct `index.html` double-click (`file://`) compatible;
`html-fragments.json` preserves the maintained source order in `src/html/`.

```sh
npm run build:index
npm run check:index
```

The same command generates `html-fragments.json`, the local fragment scripts,
their runtime manifest, and `asset-manifest.json`. The service worker caches the
loader, runtime manifest, generated fragments, and all local assets for offline use.

Four scope-sensitive classic-script bundles remain generated runtime files.
Their maintained fragments live in `src/js-bundles/` so their original shared
function or IIFE scope is not changed:

- `modules/init-features.js`
- `modules/init-event-bindingsA.js`
- `modules/init-event-bindingsB.js`
- `modules/ai/trigger-response.js`

Use:

```sh
npm run build:bundles
npm run check:bundles
```

Files with the `.jsfrag` extension are ordered source fragments and are not
standalone scripts. Edit them in place and regenerate the runtime bundle.

## Compatibility rules

- Preserve the order of classic script and stylesheet tags.
- Keep existing `window.*` exports until all callers have been migrated.
- Keep DOM ids, storage keys, database schema fields, and message types stable.
- Move CSS rules without reordering them unless the visual effect is verified.
- Update `asset-manifest.json` through `npm run build:index`; do not edit it by hand.
