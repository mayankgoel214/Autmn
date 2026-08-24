package qa

import (
	"os"
	"path/filepath"
	"testing"
)

func loadPair(tb testing.TB) ([]byte, []byte) {
	tb.Helper()
	base := filepath.Join("..", "..", "..", "..", "apps", "web", "public", "gallery", "earrings")
	in, err := os.ReadFile(filepath.Join(base, "before.jpg"))
	if err != nil {
		tb.Skipf("gallery fixture unavailable: %v", err)
	}
	out, err := os.ReadFile(filepath.Join(base, "after.jpg"))
	if err != nil {
		tb.Skipf("gallery fixture unavailable: %v", err)
	}
	return in, out
}

// Where the time actually goes. Decoding and resampling dominate; the pixel
// metrics themselves are comparatively cheap, which is the opposite of the
// assumption this service was built on.
func BenchmarkDecode(b *testing.B) {
	_, out := loadPair(b)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, _, _, err := Decode(out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkToGraySquare(b *testing.B) {
	_, out := loadPair(b)
	img, _, _, _ := Decode(out)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ToGraySquare(img, analysisSize)
	}
}

func BenchmarkMetricsOnly(b *testing.B) {
	in, out := loadPair(b)
	inImg, _, _, _ := Decode(in)
	outImg, _, _, _ := Decode(out)
	inGray := ToGraySquare(inImg, analysisSize)
	outGray := ToGraySquare(outImg, analysisSize)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		NCC(inGray.Pix, outGray.Pix)
		EstimateFillPct(outGray)
		LaplacianVariance(outGray)
		QuadrantSymmetry(outGray)
		EdgeDensity(outGray)
		EdgeDensity(inGray)
	}
}

func BenchmarkAnalyze(b *testing.B) {
	in, out := loadPair(b)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Analyze(in, out, "")
	}
}
