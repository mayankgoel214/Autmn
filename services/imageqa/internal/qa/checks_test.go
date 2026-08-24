package qa

import (
	"image"
	"image/color"
	"math"
	"testing"
)

// solid builds a uniform image — no structure at any scale.
func solid(size int, v uint8) *Gray {
	g := &Gray{Pix: make([]uint8, size*size), Width: size, Height: size}
	for i := range g.Pix {
		g.Pix[i] = v
	}
	return g
}

// checker builds a block pattern, giving edges and variance at a known scale.
func checker(size, block int, lo, hi uint8) *Gray {
	g := &Gray{Pix: make([]uint8, size*size), Width: size, Height: size}
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if (x/block+y/block)%2 == 0 {
				g.Pix[y*size+x] = lo
			} else {
				g.Pix[y*size+x] = hi
			}
		}
	}
	return g
}

func TestNCCIdenticalIsOne(t *testing.T) {
	g := checker(analysisSize, 32, 20, 230)
	if got := NCC(g.Pix, g.Pix); math.Abs(got-1) > 1e-9 {
		t.Fatalf("NCC of a buffer against itself = %v, want 1", got)
	}
}

func TestNCCInvertedIsZero(t *testing.T) {
	// Perfect negative correlation clamps to 0 rather than going negative,
	// because the gate only cares about "too similar", never "opposite".
	a := checker(analysisSize, 32, 20, 230)
	b := checker(analysisSize, 32, 230, 20)
	if got := NCC(a.Pix, b.Pix); got != 0 {
		t.Fatalf("NCC of a pattern against its inverse = %v, want 0", got)
	}
}

func TestNCCFlatBuffersTreatedAsIdentical(t *testing.T) {
	// Two flat images have zero variance, so correlation is undefined. Reporting
	// 1 is the safe reading: it means "no scene change", which rejects.
	if got := NCC(solid(64, 100).Pix, solid(64, 200).Pix); got != 1 {
		t.Fatalf("NCC of two flat buffers = %v, want 1", got)
	}
}

func TestNCCMismatchedLengths(t *testing.T) {
	if got := NCC(make([]uint8, 10), make([]uint8, 20)); got != 0 {
		t.Fatalf("NCC of mismatched buffers = %v, want 0", got)
	}
}

func TestStdDevFlatIsZero(t *testing.T) {
	if got := StdDev(solid(64, 128)); got != 0 {
		t.Fatalf("StdDev of a flat image = %v, want 0", got)
	}
}

func TestEstimateFillEmptyVsBusy(t *testing.T) {
	if got := EstimateFillPct(solid(analysisSize, 128)); got != 0 {
		t.Fatalf("fill of a flat frame = %d%%, want 0", got)
	}
	// Blocks smaller than a grid cell put variance in every cell.
	if got := EstimateFillPct(checker(analysisSize, 16, 20, 230)); got != 100 {
		t.Fatalf("fill of a fully patterned frame = %d%%, want 100", got)
	}
}

func TestLaplacianVarianceRisesWithDetail(t *testing.T) {
	flat := LaplacianVariance(solid(analysisSize, 128))
	fine := LaplacianVariance(checker(analysisSize, 2, 20, 230))
	coarse := LaplacianVariance(checker(analysisSize, 64, 20, 230))

	if flat != 0 {
		t.Fatalf("Laplacian variance of a flat frame = %v, want 0", flat)
	}
	if fine <= coarse {
		t.Fatalf("fine detail (%v) should score above coarse (%v)", fine, coarse)
	}
}

func TestQuadrantSymmetryDetectsMirroring(t *testing.T) {
	// A checkerboard whose block size divides the half-frame evenly makes the
	// diagonal quadrants identical — the duplication signature this gate exists
	// to catch.
	if got := QuadrantSymmetry(checker(analysisSize, 32, 20, 230)); got < 0.99 {
		t.Fatalf("quadrant symmetry of a symmetric pattern = %v, want ~1", got)
	}
}

func TestEdgeDensityBounds(t *testing.T) {
	if got := EdgeDensity(solid(analysisSize, 128)); got != 0 {
		t.Fatalf("edge density of a flat frame = %v, want 0", got)
	}
	dense := EdgeDensity(checker(analysisSize, 2, 0, 255))
	if dense <= 0 || dense > 1 {
		t.Fatalf("edge density = %v, want a fraction in (0,1]", dense)
	}
}

func TestColorDistanceIdenticalIsZero(t *testing.T) {
	buf := make([]uint8, histogramSize*histogramSize*3)
	for i := range buf {
		buf[i] = uint8(i % 256)
	}
	if got := ColorDistance(buf, buf); got != 0 {
		t.Fatalf("colour distance of a buffer against itself = %v, want 0", got)
	}
}

func TestColorDistanceSeparatesChannels(t *testing.T) {
	red := make([]uint8, histogramSize*histogramSize*3)
	blue := make([]uint8, histogramSize*histogramSize*3)
	for i := 0; i < len(red); i += 3 {
		red[i] = 240
		blue[i+2] = 240
	}
	if got := ColorDistance(red, blue); got < 1 {
		t.Fatalf("colour distance between red and blue fields = %v, want a large value", got)
	}
}

func TestToGraySquareUsesRec709(t *testing.T) {
	// Pure green is the channel the two luma standards disagree on most:
	// Rec.709 weights it 0.7152, Rec.601 weights it 0.587.
	src := image.NewRGBA(image.Rect(0, 0, 4, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			src.Set(x, y, color.RGBA{R: 0, G: 255, B: 0, A: 255})
		}
	}
	got := ToGraySquare(src, 4).Pix[0]
	rec709 := uint8(math.Round(0.7152 * 255))
	rec601 := uint8(math.Round(0.587 * 255))
	if got != rec709 {
		t.Fatalf("green luma = %d, want %d (Rec.709); Rec.601 would give %d",
			got, rec709, rec601)
	}
}

func TestDecodeRejectsGarbage(t *testing.T) {
	if _, _, _, err := Decode([]byte("not an image")); err == nil {
		t.Fatal("expected an error decoding garbage")
	}
}
