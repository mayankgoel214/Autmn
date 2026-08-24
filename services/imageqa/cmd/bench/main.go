// Command bench runs the Go quality gates over the same gallery pairs the
// TypeScript baseline uses, reporting both the metric values and the timing so
// the two can be compared directly rather than by assertion.
//
//	go run ./cmd/bench -gallery ../../apps/web/public/gallery
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/mayankgoel214/autmn/services/imageqa/internal/qa"
)

type entry struct {
	MedianMs          float64 `json:"medianMs"`
	Pass              bool    `json:"pass"`
	FailReason        *string `json:"failReason"`
	SceneNCC          float64 `json:"sceneNCC"`
	EstimatedFillPct  int     `json:"estimatedFillPct"`
	LaplacianVariance float64 `json:"laplacianVariance"`
	QuadrantSymmetry  float64 `json:"quadrantSymmetry"`
	ColorDistance     float64 `json:"colorDistance"`
	EdgeDensityRatio  float64 `json:"edgeDensityRatio"`
	Warnings          int     `json:"warnings"`
}

func main() {
	gallery := flag.String("gallery", "../../apps/web/public/gallery", "directory of before/after pairs")
	runs := flag.Int("runs", 5, "samples per image")
	flag.Parse()

	dirs, err := os.ReadDir(*gallery)
	if err != nil {
		fmt.Fprintln(os.Stderr, "read gallery:", err)
		os.Exit(1)
	}

	var names []string
	for _, d := range dirs {
		if d.IsDir() {
			names = append(names, d.Name())
		}
	}
	sort.Strings(names)

	results := map[string]entry{}
	var total float64

	for _, name := range names {
		input, err := os.ReadFile(filepath.Join(*gallery, name, "before.jpg"))
		if err != nil {
			fmt.Fprintln(os.Stderr, "read input:", err)
			os.Exit(1)
		}
		output, err := os.ReadFile(filepath.Join(*gallery, name, "after.jpg"))
		if err != nil {
			fmt.Fprintln(os.Stderr, "read output:", err)
			os.Exit(1)
		}

		qa.Analyze(input, output, "") // warm-up, matching the baseline harness

		samples := make([]float64, 0, *runs)
		var last qa.Result
		for i := 0; i < *runs; i++ {
			start := time.Now()
			last = qa.Analyze(input, output, "")
			samples = append(samples, float64(time.Since(start).Microseconds())/1000)
		}
		sort.Float64s(samples)
		median := samples[len(samples)/2]
		total += median

		results[name] = entry{
			MedianMs:          round(median, 1),
			Pass:              last.Pass,
			FailReason:        last.FailReason,
			SceneNCC:          round(last.SceneNCC, 4),
			EstimatedFillPct:  last.EstimatedFillPct,
			LaplacianVariance: round(last.LaplacianVariance, 2),
			QuadrantSymmetry:  round(last.QuadrantSymmetry, 4),
			ColorDistance:     round(last.ColorDistance, 4),
			EdgeDensityRatio:  round(last.EdgeDensityRatio, 4),
			Warnings:          len(last.Warnings),
		}
	}

	out, _ := json.MarshalIndent(map[string]any{
		"implementation": "go (imageqa service)",
		"runsPerImage":   *runs,
		"pairs":          len(names),
		"totalMedianMs":  round(total, 1),
		"meanPerImageMs": round(total/float64(len(names)), 1),
		"results":        results,
	}, "", "  ")
	fmt.Println(string(out))
}

func round(v float64, places int) float64 {
	p := 1.0
	for i := 0; i < places; i++ {
		p *= 10
	}
	return float64(int64(v*p+0.5)) / p
}
