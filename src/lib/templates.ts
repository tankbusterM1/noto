/*
 * Note templates for study workflows — offered on an empty note. Each is
 * markdown (parsed to blocks on apply) and is deliberately structured for
 * active recall: every template ends with a 💡 hook, the thing you'll actually
 * grade yourself on when the note comes back in review.
 */

export interface Template {
  name: string
  hint: string
  md: string
}

export const TEMPLATES: Template[] = [
  {
    name: 'concept',
    hint: 'a new idea — SQL joins, backprop, TCP…',
    md: [
      '## What is it?',
      '',
      '',
      '',
      '## Why does it matter?',
      '',
      '',
      '',
      '## How it works',
      '',
      '- ',
      '',
      '## Example',
      '',
      '```',
      '',
      '```',
      '',
      '> 💡 Hook — the one sentence future-me must be able to say',
    ].join('\n'),
  },
  {
    name: 'problem log',
    hint: 'leetcode / debugging war story',
    md: [
      '## Problem',
      '',
      '',
      '',
      '## My approach',
      '',
      '- ',
      '',
      '## Complexity',
      '',
      'time O(?) · space O(?)',
      '',
      '## Code',
      '',
      '```python',
      '',
      '```',
      '',
      '> 💡 Gotcha — what tripped me, so it never trips me again',
    ].join('\n'),
  },
  {
    name: 'paper / article',
    hint: 'ML papers, blog posts, docs',
    md: [
      '## TL;DR',
      '',
      '',
      '',
      '## Method / key idea',
      '',
      '- ',
      '',
      '## Results & limits',
      '',
      '',
      '',
      '## My take',
      '',
      '',
      '',
      '> 💡 One idea worth stealing',
    ].join('\n'),
  },
  {
    name: 'book / video',
    hint: 'lectures, talks, chapters',
    md: [
      '## In one line',
      '',
      '',
      '',
      '## Key ideas',
      '',
      '- ',
      '',
      '## Best quote',
      '',
      '> ',
      '',
      '## Action — what changes for me',
      '',
      '',
      '',
      '> 💡 If I remember one thing from this, it should be…',
    ].join('\n'),
  },
]
