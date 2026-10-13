#!/usr/bin/env bash
# Live preview at http://localhost:4000 (rebuilds and reloads the browser when you save a file).
# Needs Docker. Gems are cached in .bundle-cache/ so only the first run is slow.
cd "$(dirname "$0")"
mkdir -p .bundle-cache
exec docker run --rm -it -p 4000:4000 -p 35729:35729 \
  -v "$PWD":/srv/jekyll -v "$PWD/.bundle-cache":/usr/local/bundle -w /srv/jekyll \
  -u "$(id -u):$(id -g)" -e HOME=/tmp ruby:3.3 \
  bash -c "bundle install --quiet && bundle exec jekyll serve --host 0.0.0.0 --livereload --force_polling --drafts"
