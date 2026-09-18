# Shopify theme asset

`tt-match.js` and `page.match.liquid` are the version-controlled storefront
matcher used by the live Shopify page. Deploy them to the live theme as
`assets/tt-match.js` and `templates/page.match.liquid`.

The working preview loads the matching workspace copies from `../theme-assets`
and `../templates`. Keep both pairs identical before release.

`catalogue-corrections.json` records verified catalogue products that are
missing from the generated product master. Item IDs in this file are distinct
products, never aliases for similar or prefix-related IDs.
