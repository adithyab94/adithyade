---
title: "A short, plain title"
subtitle: "One or two sentences that say what you found. This also shows on the blog list."
description: "What search engines and link previews show. Optional, falls back to the subtitle-less excerpt."
tags: [robotics]
# Optional: a wide image under the title, also used for link previews.
# hero: /assets/blog/my-post/hero.jpg
# hero_alt: "What the image shows"
# hero_caption: "Caption. *Markdown* works."
# image: /assets/blog/my-post/hero.jpg
links:
  - label: Code
    text: adithyab94/my-repo
    url: https://github.com/adithyab94/my-repo
---

Start with the question, not with "In this post". One short paragraph is enough.

## A section heading

Normal Markdown: **bold**, *italic*, `code`, [links](https://example.com), lists, tables.

| Thing | Number |
|---|---|
| Before | 0% |
| After | 20% |

An image with a caption (put the file in assets/blog/my-post/):

{% include figure.html src="/assets/blog/my-post/photo.jpg" alt="What it shows" caption="What to notice in it." %}

Add size="wide" to let a figure break out of the text column.

A footnote looks like this.[^1]

[^1]: And it lands at the bottom of the post.
