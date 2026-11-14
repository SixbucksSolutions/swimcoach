# Third-party notices

swimcoach's own code is under the [MIT License](LICENSE). The components below are not; each keeps its
own license, and the full text travels with the component.

## Inter typeface

- **Used for:** all text in the page (`public/index.html`) and the clickable mock (`mocks/index.html`),
  embedded in each as a font file.
- **Copyright:** Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)
- **License:** SIL Open Font License, Version 1.1. Full text:
  [`third_party/inter/LICENSE.txt`](third_party/inter/LICENSE.txt)
- **Version and changes:** v4.1, subset to Latin. Details in
  [`third_party/inter/README.md`](third_party/inter/README.md).

## jose

- **Used for:** verifying Cloudflare Access JWTs in the Worker (`src/access.ts`); bundled into the
  deployed Worker.
- **Copyright:** Copyright (c) 2018 Filip Skokan (https://github.com/panva/jose)
- **License:** MIT. Full text: [`third_party/jose/LICENSE.md`](third_party/jose/LICENSE.md), copied
  unchanged from the npm package.
- **Version and changes:** 6.2.17 from npm, unmodified. The version is pinned in `package.json`.

## Ajv

- **Used for:** checking API answers against the JSON schemas in `contract/schemas/`, in the API
  acceptance suite (`acceptance/api/schema.ts`). Not bundled into the Worker.
- **Copyright:** Copyright (c) 2015-2021 Evgeny Poberezkin (https://github.com/ajv-validator/ajv)
- **License:** MIT. Full text: [`third_party/ajv/LICENSE`](third_party/ajv/LICENSE), copied unchanged
  from the npm package. Its own dependencies (`fast-deep-equal`, `fast-uri`, `json-schema-traverse`,
  `require-from-string`) install with it into `acceptance/node_modules` and carry their own licenses
  there.
- **Version and changes:** 8.20.0 from npm, unmodified. The version is pinned in
  `acceptance/package.json`.
