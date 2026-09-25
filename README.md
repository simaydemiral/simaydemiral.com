# simaydemiral.com

A plain static site. No framework, no build step. Edit the HTML and CSS directly.

## Files

```
public/index.html   the homepage — edit the text here
public/style.css    all styling; the colours and spacing live in the
                    :root block at the very top
public/404.html     shown for any unknown URL
wrangler.jsonc      Cloudflare config (name, domains). Rarely needs touching.
```

## Editing it

1. Open `public/index.html` in any editor. Change the words. Save.
2. Preview locally:

   ```sh
   npx wrangler dev
   ```

   Then open http://localhost:8787 — it reloads when you save.
3. When you like it, commit and publish:

   ```sh
   git add -A && git commit -m "describe the change"
   npx wrangler deploy
   ```

   Deploys go live in a few seconds.

Anything you dislike is one `git revert` away — commit before each change.

## Colours

Everything is driven by the tokens at the top of `public/style.css`:
`--bg`, `--fg`, `--muted`, `--accent`, `--rule`. Change one value and it
applies everywhere, in both light and dark mode.
