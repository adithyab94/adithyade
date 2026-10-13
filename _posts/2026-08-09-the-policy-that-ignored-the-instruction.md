---
title: "The policy that ignored the instruction"
subtitle: "I fine-tuned a 500M vision-language model into a robot policy. It scored 0%, and the reason turned out to be a property of the data, not a bug in the model."
description: "Fine-tuning SmolVLM2-500M into a LIBERO-Goal policy: why it learned to ignore the instruction, and how weighting the first eight frames of each episode took it from 0% to 20%."
tags: [VLA, LIBERO, SmolVLM2]
links:
  - label: Code
    text: adithyab94/smolvlm2-act
    url: https://github.com/adithyab94/smolvlm2-act
  - label: Report
    text: report.pdf
    url: https://github.com/adithyab94/smolvlm2-act/blob/main/report.pdf
---

LIBERO-Goal is a strange little benchmark. Its ten tasks all happen in the same kitchen, with the same objects sitting in the same places. *Put the bowl on the stove* and *open the middle drawer* start from scenes you could not tell apart. The only thing that changes between tasks is the sentence you hand the robot.

That makes it a good test of whether a vision-language-action model actually reads. So I took [SmolVLM2-500M](https://arxiv.org/abs/2504.05299), a small video-capable VLM, and fine-tuned it into a policy that looks at two camera views, reads one instruction, and outputs a 7-number action: six for moving the hand, one for the gripper.

The first version never completed a single task. This post is about why, because the why was more interesting than the fix.

## The setup

I followed the [OpenVLA](https://arxiv.org/abs/2406.09246) recipe, the same pairing [VLA-0-Smol](https://robot-learning-collective.github.io/vla-0-smol) uses. Each of the 7 action numbers is cut into 256 buckets, each bucket gets its own token, and predicting an action becomes ordinary next-token prediction. The language model *is* the policy. There is no separate controller bolted onto it.

A few choices mattered more than they look:

- **Bucket edges at the 1st and 99th percentiles**, so a handful of extreme actions don't stretch every bucket.
- **Reusing existing vocabulary** (token ids 48896 to 49151) instead of resizing the embedding matrix.
- **LoRA at rank 16**, which trains 56.9M of the 564M weights.
- **No image splitting.** With it, each prompt was 2,268 tokens. Without it, 156. That was the difference between fitting on an 8 GB card and not.
- **bf16 weights with the loss in fp32.** VLA-0-Smol reports fp16 diverging on this setup, and I didn't want to find out.

Training ran in plain PyTorch at batch 4 with 4 accumulation steps, peaking at 5.8 GB.

## It learned the average demonstration

The policy trained cleanly and scored 0%. Watching it, the failure was almost funny: it emitted the same action at every step, whatever it saw and whatever it was told. That action turned out to be the most common bucket in the training set on all six movement dimensions. The model had learned the average demonstration.

The loss said the same thing. A model that ignores its inputs entirely and only learns how often each bucket appears would reach a cross-entropy of 3.44. Run 1 plateaued at 3.40 by step 375 of 2,000. It had captured the bucket frequencies and very little else, so training longer was not going to help.

It wasn't *exactly* nothing, though, and that corrected an earlier conclusion of mine. Taking the probability-weighted average over buckets instead of the top bucket gave 8 different outputs across 8 scenes. The input dependence existed. It was just too weak to move the most likely bucket, so greedy decoding turned a nearly flat model into a perfectly flat one.

Before going further I ruled out the boring explanations. The model can memorise a single batch down to near-zero loss. The adapter loads. Training and evaluation share bucket edges. The simulator renders on the GPU. Nothing was broken in the plumbing.

## Asking the model what it uses

At 0% success, the usual test (give the policy a wrong instruction and see if it behaves differently) tells you nothing, because 0% looks the same either way. So I measured on the training loss instead. Hold the correct action fixed, corrupt one input, and see how much the loss goes up. Every condition sees the same examples in the same order, so batch difficulty cancels out.

Corrupting the camera images hurt about six times more than corrupting the instruction.

On this benchmark that is exactly backwards. The images *cannot* tell the tasks apart at the start, and only the sentence can. It's also not a quirk of small models: robustness studies of LIBERO find much larger VLAs replaying memorised trajectories when the scene or wording changes.[^plus]

## Three fixes that made it worse

I tried three reasonable things: more scene variety from two other LIBERO suites, predicting five actions at a time, and classifier-free guidance on the instruction. All three made the imbalance worse. The worst run ended at 42-to-1 in favour of vision, against 6.4-to-1 before.

The scene-variety failure ended up being the most useful result of the project. I wanted to know whether the new scenes really were "harder", so I built about the crudest task classifier possible: nearest-neighbour matching on 24 × 24 pixel thumbnails of the first frame.

{% include chart.html name="smol-identifiability" caption="A thumbnail lookup names the task from the first frame. On LIBERO-Goal it's below chance. On the two suites I added for variety, the picture gives the answer away." %}

On LIBERO-Goal the probe is below chance, as it should be. On the two suites I'd added, it names the task almost every time. So "more variety" had handed the model 70% more data in which the image answers the question outright. I had been feeding the shortcut.

## When does the picture give the task away?

If the first frame is uninformative on LIBERO-Goal, the next question is how long that lasts. I ran the same probe at every point in the episode.

{% include chart.html name="smol-window" caption="The same pixel probe, run at each frame offset. It sits at chance for the first few frames, then climbs fast once the arm starts moving and its direction reveals the goal." %}

It sits at chance at the start and is well clear of it by about frame eight, once the arm has started moving and its direction says where it's going. Those first eight frames are roughly 7% of a typical episode.

Every run so far had sampled training frames uniformly. Which means about 93% of every batch was made of frames where ignoring the instruction was the *correct* answer. The model wasn't failing to learn. It was learning the data I gave it.

## Changing only the sampler

Run 4 changes one thing. Half of each batch is drawn from the first eight frames of an episode and half is drawn uniformly. Same model, same data, same loss, same schedule.

{% include chart.html name="smol-modality" caption="How much the loss rises when each input is corrupted. In run 4's early frames, damaging the instruction finally costs more than damaging both camera views." %}

Inside that early window, corrupting the instruction now costs more than corrupting both camera views, the first configuration in the project where language is the dominant input. Vision didn't get worse. Both grew, and language grew faster, which is what climbing out of a degenerate solution looks like. Outside the window the ordering is unchanged, because there the image really does answer the question. In the simulator, 60-step rollouts from the same start under the true and a wrong instruction no longer share a single identical step.

## 0% to 20%

| Policy | What changed | Success | 95% interval |
|---|---|---|---|
| Run 1 | uniform frame sampling | 0% | no task completed under any decoding |
| Run 4 | early frames weighted up | **20.0%** (10/50) | 11.2 – 33.0% |
| Run 6 | continuous head instead of tokens | 12.0% (6/50) | 5.6 – 23.8% |

Closed-loop on LIBERO-Goal with the provided harness: 10 tasks × 5 episodes, 300-step cap.

Twenty percent is not a good LIBERO-Goal score, and I don't want to dress it up. VLA-0-Smol reaches 95.6% with the same 500M backbone, but with 100k steps at batch 192, full fine-tuning, action masking and 8-step chunks, against my 20k steps at batch 16 with LoRA and one action at a time. SmolVLA's own ablation puts a single-action policy at 54%,[^smolvla] which is the fairer comparison.

What run 4 can do: turn on the stove, and put the bowl on the stove or on top of the cabinet. What it can't: any drawer task, or anything that needs a precise grasp. The failures run out the full 300 steps instead of going wrong early. The policy never *finishes*, which is the signature of small errors accumulating with nothing to correct them. Five episodes per task is also a small sample (one success reads as 20%), so I trust the pooled number and not the per-task ones.

## What it cost the language model

The token ids I borrowed for action buckets were not spare slots. They are real English word pieces, including "Britain" and "selectivity", and training on actions overwrote them. Worse, the action head is the language model's own output layer, so every training step also reshaped how it predicts ordinary words.

| Model | Perplexity | Leakage into action tokens | Multiple choice |
|---|---|---|---|
| Base SmolVLM2 | 12.7 | 0.0001 | 55% |
| Run 4 (the 20% policy) | 15.5 | 0.002 | 60% |
| Run 3b (trained hardest) | 16,257 | 0.55 | 60% |
| Run 6 (output layer frozen) | 12.8 | 0.0001 | 50% |

The interesting part is that multiple-choice accuracy barely moves even when perplexity explodes. Perplexity is absolute, so losing half the probability mass to action tokens destroys it. Multiple choice only ranks four options, and the leaked mass shifts all four about equally. Fine-tuning damaged the model as a *writer* and largely spared it as a *reader*. (With 20 questions the error bar is about 11 points, so "no damage I can detect" is the honest version.)

Run 6 avoids the problem by using a separate small head and never touching the output layer, and comes back indistinguishable from the base model. A cheaper fix I didn't get to is training only the 256 action rows of the output layer.

## Two smaller results

**State tokens did nothing.** I added the robot's own position to the prompt as numbers. Corrupting them barely changes the loss, the signature of an input the model has learned to skip. The wrist camera is bolted to the gripper, so the image already encodes arm position more precisely than my numbers did.

**A continuous head is faster and closer on average, but less reliable.** Run 6 replaces the 256-bucket classifier with a small network that outputs the 7 numbers directly. It is 1.7× faster and has lower average error, yet scores 12% against 20%. The pooled gap isn't significant, so I re-ran the strongest task with three times the episodes, where it is (p = 0.0022).

The reason isn't accuracy. When two actions are both valid, say passing left or right around an object, their average is the path straight through it. A classifier can commit to either bucket. A regressor has to pick the middle. Tokens buy reliability, not accuracy or speed.

## What I'd do next

Action chunking is the biggest gap to published results and the thing most likely to fix the long-horizon failures. The catch is that chunking dilutes the language signal, which is part of what broke run 3b. So the experiment worth running is chunking *together with* run 4's frame weighting, not either on its own.

The number I care about from this project was never the 20%. It was finding out why the model ignored the instruction, and then watching the same model listen once it was trained on the moments where listening pays off.

[^plus]: Fei et al., [LIBERO-Plus: In-depth Robustness Analysis of Vision-Language-Action Models](https://arxiv.org/abs/2510.13626), 2025.
[^smolvla]: Shukor et al., [SmolVLA: A Vision-Language-Action Model for Affordable and Efficient Robotics](https://arxiv.org/abs/2506.01844), 2025.
