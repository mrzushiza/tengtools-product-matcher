import '@shopify/ui-extensions';

//@ts-expect-error generated Shopify extension module declaration
declare module './src/BlockExtension.jsx' {
  const shopify: import('@shopify/ui-extensions/admin.customer-details.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}
