# Source Attribution & Licenses

This crash course embeds **bounded, unmodified snapshots** of upstream source code
from six official research repositories, each pinned to a specific commit. The full
file list, per-file SHA-256 hashes, and upstream raw URLs are recorded in
[`source-manifest.json`](source-manifest.json). Each upstream `LICENSE` is copied
verbatim into `sources/<model>/LICENSE`.

The snapshots are included for **educational reference only**. Code copyright remains
with the original authors under the licenses below. Model *weights* are governed by
separate licenses and are **not** included here.

| Course | Upstream repository | Pinned commit | Code license | Copyright holder |
|---|---|---|---|---|
| ViT | `google-research/vision_transformer` | `64801f1` | Apache-2.0 | Google LLC |
| CLIP | `openai/CLIP` | `d05afc4` | MIT | OpenAI |
| DINOv2 | `facebookresearch/dinov2` | `7764ea0` | Apache-2.0 | Meta Platforms, Inc. |
| LLaVA | `haotian-liu/LLaVA` | `c121f04` | Apache-2.0 | Haotian Liu |
| OpenVLA | `openvla/openvla` | `c8f03f4` | MIT | Kim, Pertsch, Karamcheti et al. |
| π₀ / π₀.₅ | `Physical-Intelligence/openpi` | `215abfb` | Apache-2.0 | Physical Intelligence |

## Weight / usage license notes

- **DINOv2** backbone weights and **LLaVA** / **OpenVLA** checkpoints inherit
  additional terms from their upstream model cards and any base LLM (e.g. Llama)
  used during training. Consult the upstream repositories before any deployment.
- **π₀.₅** builds on **PaliGemma / Gemma**; Gemma weights carry Google's Gemma
  Terms of Use. The openpi *code* is Apache-2.0.
- **CLIP** and **OpenVLA** code are MIT; the pretrained CLIP weights follow OpenAI's
  model release terms.

## Reproducing the snapshot

```bash
python3 fetch_sources.py        # re-downloads all files at the pinned commits
python3 build_courses.py        # regenerates the hub + six model pages offline
```

`fetch_sources.py` verifies nothing by itself; run a hash check against
`source-manifest.json` to confirm integrity of the copied snapshot.
