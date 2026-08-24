package qa

import "math"

// Sizes the reference implementation calibrated its thresholds against.
const (
	analysisSize  = 256 // grid for structural metrics
	histogramSize = 128 // grid for the centre-crop colour histogram
)

// NCC is the normalized cross-correlation of two equally sized buffers,
// clamped to [0,1]. 1 means identical structure.
//
// It is what catches a model handing back the input image unchanged, which is
// the single most common way a generation silently fails.
func NCC(a, b []uint8) float64 {
	n := len(a)
	if n == 0 || n != len(b) {
		return 0
	}

	var sumA, sumB float64
	for i := 0; i < n; i++ {
		sumA += float64(a[i])
		sumB += float64(b[i])
	}
	meanA, meanB := sumA/float64(n), sumB/float64(n)

	var dot, normA, normB float64
	for i := 0; i < n; i++ {
		da := float64(a[i]) - meanA
		db := float64(b[i]) - meanB
		dot += da * db
		normA += da * da
		normB += db * db
	}

	denom := math.Sqrt(normA) * math.Sqrt(normB)
	if denom == 0 {
		return 1 // both flat, therefore identical
	}
	return math.Max(0, dot/denom)
}

// EstimateFillPct reports roughly how much of the frame carries content, as a
// percentage. The frame is divided into a 4×4 grid and a cell counts as filled
// when it has either tonal variance or edge energy — a product on a seamless
// backdrop leaves most cells empty.
func EstimateFillPct(g *Gray) int {
	const grid = 4
	cell := g.Width / grid

	active := 0
	for gy := 0; gy < grid; gy++ {
		for gx := 0; gx < grid; gx++ {
			var sum, sumSq, edgeSum float64
			var count, edgeCount int

			for y := gy * cell; y < (gy+1)*cell; y++ {
				for x := gx * cell; x < (gx+1)*cell; x++ {
					v := float64(g.at(x, y))
					sum += v
					sumSq += v * v
					count++

					if x < (gx+1)*cell-1 && y < (gy+1)*cell-1 {
						edgeSum += math.Abs(v-float64(g.at(x+1, y))) +
							math.Abs(v-float64(g.at(x, y+1)))
						edgeCount++
					}
				}
			}

			mean := sum / float64(count)
			variance := sumSq/float64(count) - mean*mean
			avgEdge := 0.0
			if edgeCount > 0 {
				avgEdge = edgeSum / float64(edgeCount)
			}
			if variance > 15 || avgEdge > 8 {
				active++
			}
		}
	}
	return int(math.Round(float64(active) / float64(grid*grid) * 100))
}

// LaplacianVariance measures focus. A 4-neighbour Laplacian responds to local
// intensity change, so its variance collapses on output that has been smeared
// into plastic smoothness — under about 50 the image is unusable.
func LaplacianVariance(g *Gray) float64 {
	var sum, sumSq float64
	count := 0
	for y := 1; y < g.Height-1; y++ {
		for x := 1; x < g.Width-1; x++ {
			lap := 4*float64(g.at(x, y)) -
				float64(g.at(x, y-1)) - float64(g.at(x, y+1)) -
				float64(g.at(x-1, y)) - float64(g.at(x+1, y))
			sum += lap
			sumSq += lap * lap
			count++
		}
	}
	mean := sum / float64(count)
	return sumSq/float64(count) - mean*mean
}

// QuadrantSymmetry correlates the diagonally opposite quarters of the frame.
// Image models asked for one product sometimes render two in mirrored
// positions; that duplication shows up here as correlation above ~0.85, and it
// is detectable without spending a vision call.
func QuadrantSymmetry(g *Gray) float64 {
	half := g.Width / 2
	quad := func(qx, qy int) []uint8 {
		out := make([]uint8, half*half)
		for y := 0; y < half; y++ {
			copy(out[y*half:(y+1)*half],
				g.Pix[(qy*half+y)*g.Width+qx*half:(qy*half+y)*g.Width+qx*half+half])
		}
		return out
	}
	topLeft, topRight := quad(0, 0), quad(1, 0)
	bottomLeft, bottomRight := quad(0, 1), quad(1, 1)

	return math.Max(NCC(topLeft, bottomRight), NCC(topRight, bottomLeft))
}

// ColorDistance is the chi-squared distance between 8-bin per-channel
// histograms of the two centre crops. It rises when the product's own colour
// has drifted, which matters because a silver bangle returned in gold is a
// different product, not a different photograph.
func ColorDistance(inputRGB, outputRGB []uint8) float64 {
	const bins = 8
	inHist := make([]float64, bins*3)
	outHist := make([]float64, bins*3)
	pixels := histogramSize * histogramSize

	for i := 0; i < pixels*3; i += 3 {
		for c := 0; c < 3; c++ {
			inHist[c*bins+min(bins-1, int(inputRGB[i+c])/32)]++
			outHist[c*bins+min(bins-1, int(outputRGB[i+c])/32)]++
		}
	}

	var chiSq float64
	for i := range inHist {
		inHist[i] /= float64(pixels)
		outHist[i] /= float64(pixels)
		if denom := inHist[i] + outHist[i]; denom > 0 {
			d := inHist[i] - outHist[i]
			chiSq += d * d / denom
		}
	}
	return chiSq
}

// EdgeDensity is the fraction of pixels whose gradient magnitude clears a fixed
// threshold. Compared against the input it separates output that has been
// over-smoothed from output ringing with halo artifacts.
func EdgeDensity(g *Gray) float64 {
	const threshold = 30.0
	edges := 0
	for y := 1; y < g.Height-1; y++ {
		for x := 1; x < g.Width-1; x++ {
			gx := float64(g.at(x+1, y)) - float64(g.at(x-1, y))
			gy := float64(g.at(x, y+1)) - float64(g.at(x, y-1))
			if math.Hypot(gx, gy) > threshold {
				edges++
			}
		}
	}
	return float64(edges) / float64((g.Width-2)*(g.Height-2))
}

// StdDev over the whole frame; near zero means a blank or corrupt render.
func StdDev(g *Gray) float64 {
	var sum, sumSq float64
	n := float64(len(g.Pix))
	for _, v := range g.Pix {
		sum += float64(v)
		sumSq += float64(v) * float64(v)
	}
	mean := sum / n
	return math.Sqrt(math.Max(0, sumSq/n-mean*mean))
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
