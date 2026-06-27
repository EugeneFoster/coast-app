import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();

// Minify server bundles to reduce deployed Worker size on free plans.
config.default = {
  ...config.default,
  minify: true,
};

if (config.middleware?.external === true) {
  config.middleware = {
    ...config.middleware,
    minify: true,
  };
}

export default config;
