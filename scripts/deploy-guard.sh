#!/bin/sh
# Wrangler runs this before every build. `wrangler dev` passes straight through.
# A deploy from a laptop is stopped: its copy of the Dispatch goes stale once
# GitHub is publishing it, and it could also ship unfinished local files.
[ "$WRANGLER_COMMAND" = "deploy" ] || exit 0
[ "$DISPATCH_PIPELINE" = "1" ] && exit 0
echo "Deploys go through GitHub now: push to main and the site updates itself." >&2
echo "Emergency override: DISPATCH_PIPELINE=1 npx wrangler deploy" >&2
exit 1
