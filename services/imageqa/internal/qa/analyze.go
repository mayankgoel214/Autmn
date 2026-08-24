package qa

import (
	"fmt"
	"math"
	"sync"
)

// Thresholds carried over verbatim from the TypeScript implementation these
// checks replace. Changing them changes what ships, so they stay together and
// stay named.
const (
	nccRejectThreshold      = 0.92
	minFillPct              = 12
	minDimension            = 512
	blankStdDevThreshold    = 5
	quadrantSymThreshold    = 0.85
	softnessWarnThreshold   = 200
	colorShiftWarnThreshold = 1.0
)

// Result mirrors the DeterministicResult the pipeline already consumes, so this
// service is a drop-in for the function it replaces.
type Result struct {
	Pass              bool     `json:"pass"`
	FailReason        *string  `json:"failReason"`
	SceneNCC          float64  `json:"sceneNCC"`
	EstimatedFillPct  int      `json:"estimatedFillPct"`
	IsValid           bool     `json:"isValid"`
	IsBlank           bool     `json:"isBlank"`
	LaplacianVariance float64  `json:"laplacianVariance"`
	QuadrantSymmetry  float64  `json:"quadrantSymmetry"`
	ColorDistance     float64  `json:"colorDistance"`
	EdgeDensityRatio  float64  `json:"edgeDensityRatio"`
	Warnings          []string `json:"warnings"`
}

func fail(reason string, r Result) Result {
	r.Pass = false
	r.FailReason = &reason
	return r
}

// Analyze runs every gate over one input/output pair.
//
// Two things differ from the implementation this replaces, and both are the
// reason it exists. First, each image is decoded and resized once and the
// resulting buffer is shared; the original re-derived the same 256×256
// greyscale of the output five separate times, once per metric. Second, the
// independent metrics run concurrently instead of sequentially — they share no
// state, so on a multi-core machine they cost about as much as the slowest one
// rather than the sum.
func Analyze(inputData, outputData []byte, style string) Result {
	result := Result{
		Pass:             true,
		EstimatedFillPct: 50,
		IsValid:          true,
		EdgeDensityRatio: 1,
		Warnings:         []string{},
	}

	outputImg, outW, outH, err := Decode(outputData)
	if err != nil {
		result.IsValid = false
		return fail("output_corrupt", result)
	}
	inputImg, _, _, err := Decode(inputData)
	if err != nil {
		result.IsValid = false
		return fail("output_corrupt", result)
	}

	// ---- Gate A: dimensions, aspect ratio, blankness ----------------------
	if outW < minDimension || outH < minDimension {
		result.IsValid = false
		return fail(fmt.Sprintf("output_too_small:%dx%d", outW, outH), result)
	}

	aspect := float64(outW) / float64(outH)
	if aspect < 0.3 || aspect > 3.5 {
		result.IsValid = false
		return fail(fmt.Sprintf("wrong_aspect_ratio:%dx%d", outW, outH), result)
	}
	if math.Abs(aspect-1.0) > 0.3 {
		// A warning, not a rejection: the models reliably ignore the square
		// instruction, and failing here forced every generation down a slower,
		// costlier fallback tier.
		result.Warnings = append(result.Warnings,
			fmt.Sprintf("Unexpected aspect ratio %dx%d — prompt asked for square.", outW, outH))
	}

	if StdDev(ToGraySquare(outputImg, 8)) < blankStdDevThreshold {
		result.IsBlank = true
		return fail("output_is_blank", result)
	}

	// Decoded and resized once here, then shared by every metric below.
	outGray := ToGraySquare(outputImg, analysisSize)
	inGray := ToGraySquare(inputImg, analysisSize)

	// ---- Gate B: did the scene change at all? -----------------------------
	result.SceneNCC = NCC(inGray.Pix, outGray.Pix)
	if result.SceneNCC > nccRejectThreshold {
		return fail(fmt.Sprintf("no_scene_change:ncc=%.3f", result.SceneNCC), result)
	}

	// ---- Gates C–G: independent, so run them together ---------------------
	var (
		wg              sync.WaitGroup
		fillPct         int
		laplacian       float64
		quadrant        float64
		colorDist       float64
		inEdge, outEdge float64
	)

	run := func(f func()) {
		wg.Add(1)
		go func() { defer wg.Done(); f() }()
	}

	run(func() { fillPct = EstimateFillPct(outGray) })
	run(func() { laplacian = LaplacianVariance(outGray) })
	run(func() { quadrant = QuadrantSymmetry(outGray) })
	run(func() { outEdge = EdgeDensity(outGray) })
	run(func() { inEdge = EdgeDensity(inGray) })
	run(func() {
		colorDist = ColorDistance(
			RGBSquare(inputImg, histogramSize),
			RGBSquare(outputImg, histogramSize),
		)
	})
	wg.Wait()

	result.EstimatedFillPct = fillPct
	result.LaplacianVariance = laplacian
	result.QuadrantSymmetry = quadrant
	result.ColorDistance = colorDist
	if inEdge > 0 {
		result.EdgeDensityRatio = outEdge / inEdge
	}

	// Everything below is advisory. These feed the retry prompt rather than
	// rejecting the image, because a soft or slightly duplicated render still
	// beats paying for another tier of generation.
	if fillPct < minFillPct {
		result.Warnings = append(result.Warnings,
			fmt.Sprintf("Product appears small in frame (fill=%d%%).", fillPct))
	}
	if laplacian < softnessWarnThreshold {
		result.Warnings = append(result.Warnings, fmt.Sprintf(
			"Image appears soft/slightly blurry (sharpness=%d). Generate a SHARPER, more detailed image.",
			int(math.Round(laplacian))))
	}
	if quadrant > quadrantSymThreshold {
		result.Warnings = append(result.Warnings,
			fmt.Sprintf("Possible product duplication detected (quadrant_ncc=%.3f).", quadrant))
	}
	if colorDist > colorShiftWarnThreshold {
		result.Warnings = append(result.Warnings, fmt.Sprintf(
			"Product colors may have shifted (colorDistance=%.2f). Ensure the product's EXACT original colors are preserved.",
			colorDist))
	}
	if result.EdgeDensityRatio < 0.3 && outEdge < 0.05 {
		result.Warnings = append(result.Warnings,
			"Image appears unnaturally smooth/painted. Generate a more PHOTOREALISTIC image with natural texture detail.")
	}
	if result.EdgeDensityRatio > 4.0 {
		result.Warnings = append(result.Warnings,
			"Image has unusual edge artifacts. Generate a cleaner, more natural image.")
	}

	return result
}
