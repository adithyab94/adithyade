# adithya.de

Source for [adithya.de](https://adithya.de): a small [Jekyll](https://jekyllrb.com) site hosted on Cloudflare Pages.

## Run it locally

```bash
./serve.sh
```

Then open <http://localhost:4000>. The page reloads when you save a file. `serve.sh` runs Jekyll in Docker,
so you don't need Ruby installed. With Ruby 3.3 you can instead run `bundle install && bundle exec jekyll serve`.

Don't open the `.html` files directly in a browser: they're templates and only look right once built.

## Write a blog post

1. Copy `_drafts/post-template.md` to `_posts/YYYY-MM-DD-slug.md`. The slug becomes the URL: `/blog/slug/`.
2. Fill in `title`, `subtitle`, `tags` and `links` at the top, then write in Markdown.
3. Put images in `assets/blog/<slug>/` and add them with:

   ```liquid
   {% include figure.html src="/assets/blog/slug/photo.jpg" alt="What it shows" caption="What to notice." %}
   ```

   Add `size="wide"` to let a figure break out of the text column.

Drafts in `_drafts/` are never published. Charts in the existing posts are inline SVGs made by
`_scripts/charts.py` and included with `{% include chart.html name="..." %}`.

## Add to Offline

**A roll of film:**

```bash
python3 _scripts/add_roll.py ~/path/to/scans "Roll name" --camera "..." --film "..." --place "..."
```

This resizes the scans into `assets/offline/<roll-name>/` and creates `_offline/<roll-name>.md`, where you can
add a few lines and per-frame captions. The newest roll is the one shown on the light table.

**Writing:** create `_offline/<slug>.md` with `title`, `date`, `kind: writing` and an optional `subtitle`.
Everything lists under Writing, newest first. Add `status: in-progress` to list it under "Still marinating". Personal ideas without a page yet go in
`_data/marinating.yml`.

## Physical-AI notes

Interactive study notes live in `notes/<slug>/` as self-contained pages, listed on `/blog/` from `_data/notes.yml`.
The list sits behind a deliberately easy password. It's only a soft gate, so nothing private goes in a note.

## Deploy

Push to `main`. Cloudflare Pages builds and publishes it with:

| Setting | Value |
|---|---|
| Build command | `bundle exec jekyll build` |
| Build output directory | `_site` |

Ruby is pinned in `.ruby-version` and gem versions in `Gemfile.lock`.

## Where things are

| Path | What |
|---|---|
| `index.html`, `work.html`, `blog/`, `offline/` | The pages |
| `_posts/`, `_offline/` | Blog posts and Offline entries |
| `_layouts/`, `_includes/` | Page templates, header, footer, figures, charts |
| `_data/` | Physical-AI notes list and the marinating list |
| `style.css`, `post.css`, `offline.css` | Site styles, long-form reading, Offline |
| `diorama.js` | The 3D street in the footer |
| `notes/` | Physical-AI notes |
