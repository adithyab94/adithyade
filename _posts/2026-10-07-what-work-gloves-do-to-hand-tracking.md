---
title: "What work gloves do to hand tracking"
subtitle: "Human video is becoming robot training data, and in factories and warehouses the people in that video wear gloves. I measured what that does to 3D hand-pose estimation, and which capture choices actually fix it."
description: "Work gloves break hand detection, bias single-camera depth, and blur finger pose. Extra cameras fix where the hand is, but only a thinner glove fixes what the fingers are doing."
tags: [hand pose, data capture, human video]
image: /assets/blog/glove-gap/fig_pose_examples.jpg
hero: /assets/blog/glove-gap/fig_pose_examples.jpg
hero_alt: "One video frame shown six times with different synthetic gloves, with ground-truth and predicted hand skeletons overlaid."
hero_caption: "The same DexYCB frame with no glove and five synthetic gloves. White is ground truth, orange is WiLoR, blue is MediaPipe. MediaPipe loses the hand as soon as any glove goes on. WiLoR keeps finding it, but its finger pose drifts as the glove gets darker and thicker."
links:
  - label: Code
    text: adithyab94/glove-gap
    url: https://github.com/adithyab94/glove-gap
  - label: Report
    text: glove_gap.pdf
    url: https://github.com/adithyab94/glove-gap/blob/main/report/glove_gap.pdf
---

A lot of recent robot learning starts from people. You film someone doing a task, run a hand-pose estimator over the video, and turn the recovered hand motion into training data for a robot. The hand-pose model sits at the very front of that pipeline, so whatever it gets wrong, everything downstream inherits.

These models are trained and benchmarked almost entirely on bare hands. But the places where you'd most want to collect this kind of data, factories, warehouses, kitchens, are exactly the places where operators wear gloves. I wanted to know two things: what gloves actually break, and which choices at capture time (the glove, the cameras, a quality check) fix it.

## How I tested it

The plan was a two-camera rig at home with real gloves. I didn't have a second camera, so the experiment moved to [DexYCB](https://dex-ycb.github.io/): 19 held-out grasping sequences, each filmed by 8 synchronised cameras, with ground-truth 3D hand joints. Most results use two of those cameras, about a metre apart at 70°.

The gloves are painted on. Inside each frame's hand mask I replace the skin colour with a glove texture, but keep the original brightness as shading, and the ground-truth skeleton never moves. That last part matters: a real thick glove makes the hand *look* bigger without moving the bones, and that's the effect I wanted to isolate.

| Code | Glove |
|---|---|
| G0 | bare hand |
| G1 | thin, bright nitrile |
| G2 | grey knit |
| G3a | dark insulated work glove |
| G3b | G3a with the outline grown 1–4 px, a stand-in for thickness |
| G4 | the same insulated glove, but bright (a colour control) |

{% include figure.html src="/assets/blog/glove-gap/fig_glove_grid.jpg" alt="A grid of video frames showing hands with each synthetic glove condition, across three sequences and two camera views." caption="Every glove condition on three sequences and two cameras." size="wide" %}

I ran three hand-pose models: MediaPipe Hands, [WiLoR](https://github.com/rolpotamias/WiLoR) and [HaMeR](https://github.com/geopavlakos/hamer). Because painted gloves are only an approximation, I also checked detection on 83 real photos of bare and gloved hands. Every number below is a mean over sequences, with a 95% bootstrap interval over sequences behind it.

## Real gloves break detection, and painted ones undersell it

On the real photos, both models find every bare hand. With worn gloves, WiLoR finds 52–65% of them and MediaPipe 7–13%. The range comes from how strictly a predicted box has to match the annotated one, and glove boxes often include the cuff, which makes strict matching harsher than it should be.

{% include figure.html src="/assets/blog/glove-gap/fig_real_detection.jpg" alt="Eight photos of gloved hands with annotated and predicted boxes. Top row: WiLoR detections. Bottom row: misses." caption="Real gloved hands. White is the annotated box, orange is WiLoR, blue is MediaPipe. Top: WiLoR hits. Bottom: misses. Several of the misses do have a skeleton on the hand but fail the box match because the annotation includes the cuff. Photos from the [Roboflow gloves and bare hands dataset](https://universe.roboflow.com/1234-vcsmu/gloves-and-bare-hands-detection-ziyvj), CC BY 4.0." %}

Comparing that with the painted gloves was the first useful surprise.

{% include chart.html name="glove-detection" caption="How much detection drops once gloves go on. Painted gloves predict MediaPipe's collapse well, but badly underestimate how often WiLoR loses real gloved hands." %}

For MediaPipe the synthetic and real drops agree: it simply stops seeing hands. For WiLoR they don't. Painted gloves cost it almost nothing, while real ones cost 35–48 points. Box size doesn't explain it away (the glove photos are mostly close-ups, which should be the easy case), and cropping doesn't rescue MediaPipe either. So the rest of this post measures pose on frames where a hand *was* found, and WiLoR's synthetic detection rates should be read as optimistic.

## A bigger-looking hand is a closer hand

A single camera has no direct way to know how far away a hand is. It has to infer depth from how big the hand looks. A glove changes how big the hand looks.

{% include chart.html name="glove-depth" caption="Single-camera WiLoR's error in wrist depth, by glove. Insulated gloves pull the hand towards the camera; thickening the outline by four pixels pulls it 12 cm." %}

The dark insulated glove puts the hand 45 mm too close. Grow its outline by four pixels and that becomes 124 mm, roughly 20 mm per pixel of extra silhouette. A bright colour removes the bias for HaMeR but not for WiLoR, so it's a property of the model rather than something you can rely on. The rule I'd write into any capture spec: when operators wear gloves, never take hand *position* from a single RGB camera.

## Cameras fix where the hand is, not what the fingers do

The obvious fix is more cameras. With two calibrated views you can triangulate the hand instead of guessing its depth. To compare fixes I use the share of the glove-induced error that each one removes: 100% means the glove no longer hurts at all.

{% include chart.html name="glove-recovery" caption="Share of the single-camera glove damage each fix removes, across the grey knit, dark insulated and thickened gloves. A second camera mostly fixes position. Only a thinner glove fixes the fingers." %}

A second camera removes 72–88% of the position error, and very little of the finger-pose error: 3–49%, depending on the glove. Going to eight cameras pushes position a bit further (83–93%) and does nothing new for the fingers. Swapping the work glove for thin nitrile, on the other hand, removes 73–92% of the finger error.

I first assumed this was about colour, since the nitrile glove is bright and the work glove is dark. That's why G4 exists: the *same* insulated glove, painted bright. It detects 3 points better than the dark version and its finger pose doesn't improve at all. Holding colour fixed instead, thin nitrile beats the insulated glove by 12.8 mm of finger error. It's thinness, and the finger shading and creases it preserves, that does the work.

One more result I didn't expect: for finger pose, a single camera's learned hand model beats triangulating two views (8.8 mm vs 12.3 mm bare). Triangulation is great at *where*, and a model with a strong prior on hand shape is better at *how*.

## A quality gate flags batches, not episodes

In a real pipeline you'd want an automatic check that throws out bad data. A natural one is two-view reprojection error: a frame is valid if the two cameras agree to within 3.1 px (the bare-hand 95th percentile), and an episode passes if at least 80% of its frames are valid.

{% include chart.html name="glove-gate" caption="Share of episodes that pass a two-view reprojection check, by glove." %}

At the level of a glove type, it works: 95% of bare episodes pass and only 5% of dark insulated ones. But *within* one glove type, the fraction of valid frames doesn't predict which episodes have worse pose (\|ρ\| ≤ 0.36, p > 0.1). So it's a good alarm for "this batch of data is out of the model's domain" and a poor tool for picking individual episodes.

## What I'd put in a capture spec

- **Use a ViT/MANO-class model** like WiLoR or HaMeR, not MediaPipe. MediaPipe's detection goes from 93% to 6% or less with any glove.
- **Choose thin, form-fitting nitrile gloves.** Colour matters much less than thickness. Each extra pixel of outline costs about 0.4 mm of pose error.
- **Capture with two or more calibrated views,** roughly a metre apart at around 70°, or use RGB-D, for anything that depends on hand position.
- **Gate per batch:** reprojection under 3.1 px on at least 80% of frames, and investigate a batch when fewer than about 75% of its episodes pass.

## What I got wrong along the way

Some of the findings above are corrections of earlier ones, and I think that's worth saying out loud.

My notes originally credited glove *colour* as the lever. The G4 control was added specifically to test that, and it showed the opposite. The real-glove drop for WiLoR was first reported as 48 points, until looking at example images showed skeletons sitting on hands that failed the match only because the annotated boxes include the cuff. It's now a range. My first sequence selection came entirely from the split HaMeR was trained on, which I caught before running inference. And the first render re-seeded the glove texture every frame, which would have made every gloved hand look jittery.

## Limits

The gloves are 2D image edits: no real 3D thickness, no folds or seams. For WiLoR they clearly underestimate the real detection drop. It's one subject handling lab objects on a table, not a warehouse floor. The models may have seen this subject in training, so trust the *relative* drop from bare to gloved more than the absolute numbers. And the real-glove check is detection only, on 83 photos.

What I'm fairly confident about is the shape of it: gloves hurt detection more than synthetic tests suggest, they bias single-camera depth in a predictable direction, extra cameras fix position but not fingers, and if you control the glove, choose thin.

---

*DexYCB (Chao et al., CVPR 2021) is CC BY-NC 4.0; frames shown here are for non-commercial research illustration. Real glove photos are from the Roboflow Universe "Gloves and bare hands detection" dataset, CC BY 4.0. All code, figures and numbers are in the [repository](https://github.com/adithyab94/glove-gap), and `make all` reproduces every number from cached predictions.*
