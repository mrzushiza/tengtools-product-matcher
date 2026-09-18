import '@shopify/ui-extensions';

//@ts-expect-error Shopify injects the target-specific API type at extension runtime.
declare module './src/BlockExtension.jsx' {
  const shopify: import('@shopify/ui-extensions/admin.customer-details.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}
