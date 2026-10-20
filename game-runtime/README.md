# Zynox isolated game runtime

This Worker must be deployed as a **separate Cloudflare Worker** with a different origin from the main Zynox site.

From the repository root, deploy using:

```sh
npx wrangler deploy --config game-runtime/wrangler.jsonc
```

The Worker only serves games whose D1 status is approved **and** whose private R2 manifest has approved=true. Neither condition is currently set by the main application. Do not enable approval before reviewing isolation, content policy, and end-to-end testing.

Expected URL format: /g/{game-id}/index.html. Never proxy this through the main application's origin.
