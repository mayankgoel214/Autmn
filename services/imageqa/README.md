# imageqa — a Go port of the deterministic quality gates

**This service is not in the pipeline, and the benchmark below is why.** It is
kept because the measurement is the useful part.

## What it is

A Go reimplementation of `packages/ai/src/qa/deterministic-checks.ts` — the
gates every generated candidate passes before any vision model is paid to look
at it:

| Metric | Catches |
|---|---|
| Normalized cross-correlation | the model returning the input unchanged |
| Fill estimate | the product rendered too small in frame |
| Laplacian variance | smeared, plastic, out-of-focus output |
| Quadrant symmetry | the product duplicated in mirrored positions |
| Colour histogram distance | the product's own colour drifting |
| Edge density ratio | over-smoothing, or halo artifacts |

All six are pure arithmetic over pixel buffers, which is what made a compiled,
goroutine-parallel version look worth trying.

## What the benchmark showed

Measured over the seven real before/after pairs in `apps/web/public/gallery`,
five samples each, on an Apple M-series machine:

```
node + sharp   40.6 ms/image
go (this)      84.6 ms/image
```

Go was **2x slower**. Profiling the Go build explains it:

```
BenchmarkDecode          12.8 ms/op      JPEG decode, 1280x1280
BenchmarkToGraySquare    15.1 ms/op      resize to 256x256 + greyscale
BenchmarkMetricsOnly      0.85 ms/op     all six metrics combined
```

**The pixel arithmetic is under 1% of the runtime.** This workload is bound by
image decoding and resampling, and that is precisely what libvips — which
`sharp` wraps — exists to do, in hand-tuned SIMD. Pure Go's `image/jpeg` and
`x/image/draw` are not close, and cannot be without CGO, which would throw away
the single static binary that made Go attractive here.

A cheaper resize kernel closes most of the gap (`ApproxBiLinear` is 23x faster
than `CatmullRom` at 15.1 ms → 0.66 ms) but aliases badly on a 5x downscale,
which moves the metric values — the point of the gates is that their thresholds
mean something.

## What was done instead

The profile pointed at the real defect, which was in the TypeScript: each metric
derived its own 256x256 greyscale of the same output image, so the expensive
decode-and-resize ran **five times per call**. Decoding once and sharing the
buffer, and running the independent checks concurrently, made the existing
implementation **57% faster (40.6 → 17.4 ms/image) with byte-identical output**.

That change is in `packages/ai/src/qa/deterministic-checks.ts`. The benchmark
that measured it is `packages/ai/bench/qa-benchmark.mts`.

## Correctness

The port agrees with the original on the verdict — pass/fail matches on all
seven pairs — but the diagnostic values drift, by up to 31% on colour distance
and 20% on quadrant symmetry. That is resampling: `CatmullRom` is not
`lanczos3`, and small differences in the 256x256 greyscale propagate. Had this
shipped, those thresholds would have needed recalibrating against the Go
resampler rather than assumed to carry over.

## Running it

```bash
go test ./...                                          # unit tests
go test ./internal/qa -bench=. -benchtime=20x -run=XXX  # the profile above
go run ./cmd/bench -gallery ../../apps/web/public/gallery
```
