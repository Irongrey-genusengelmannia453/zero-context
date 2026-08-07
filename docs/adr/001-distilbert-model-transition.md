# ADR 001: Transition to DistilBERT for Neural Redaction

## Status
Accepted

## Context
The extension previously used `Xenova/bert-base-NER` (~400MB) for Layer 3 NER redactions. This model caused massive latency spikes on cold starts (due to size) and high inference latency (~8 seconds per block of text) when running entirely client-side via WASM. This latency created a terrible user experience, and the size frequently triggered caching bottlenecks.

## Decision
We transitioned to `Xenova/distilbert-base-multilingual-cased-ner-hrl` with `quantized: true`. 
DistilBERT is a distilled version of BERT that retains 97% of its language understanding capabilities while being 40% smaller and 60% faster. By enabling native `q8` quantization, we shrank the memory footprint further.

## Consequences
- **Positive:** Initial download time drastically reduced. Inference time dropped from ~8,000ms to ~80-1,500ms (depending on cache/warmup state).
- **Positive:** Works effectively for High Resource Languages (HRL), accurately capturing PER, LOC, and ORG tags just like BERT.
- **Negative:** Minor loss in accuracy for extreme edge cases, which is acceptable in a fast-paced chat UI context.
