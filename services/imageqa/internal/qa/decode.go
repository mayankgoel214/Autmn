// Package qa implements Autmn's deterministic image quality gates.
//
// These run on every candidate the generation pipeline produces, before any
// LLM-based review, to reject output that is blank, blurry, duplicated, or
// simply the input handed back unchanged. They are pure arithmetic over pixel
// buffers — no model calls, no network — which is why they belong in a
// compiled, parallel service rather than on a JavaScript event loop.
package qa

import (
	"bytes"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

// Gray holds a single-channel image as a flat row-major buffer.
type Gray struct {
	Pix    []uint8
	Width  int
	Height int
}

func (g *Gray) at(x, y int) uint8 { return g.Pix[y*g.Width+x] }

// Decode reads any supported encoding and reports the original dimensions,
// which the dimension gate needs before the image is resized.
func Decode(data []byte) (image.Image, int, int, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, 0, 0, fmt.Errorf("decode image: %w", err)
	}
	b := img.Bounds()
	return img, b.Dx(), b.Dy(), nil
}

// ToGraySquare stretches an image to size×size and converts it to luminance.
//
// The stretch is deliberate and matches the original implementation's
// `fit: "fill"`: these metrics compare spatial structure between two images,
// so both must land on an identical grid regardless of aspect ratio.
func ToGraySquare(img image.Image, size int) *Gray {
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	// CatmullRom approximates the resampling libvips applies closely enough
	// that the thresholds calibrated against it still hold.
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Over, nil)

	g := &Gray{Pix: make([]uint8, size*size), Width: size, Height: size}
	for i, p := 0, 0; i < len(g.Pix); i, p = i+1, p+4 {
		g.Pix[i] = luma(dst.Pix[p], dst.Pix[p+1], dst.Pix[p+2])
	}
	return g
}

// RGBSquare crops the centre 60% and stretches it to size×size, keeping colour.
// The centre is where the product sits, so a histogram taken there tracks the
// product's colour rather than the scene's.
func RGBSquare(img image.Image, size int) []uint8 {
	b := img.Bounds()
	cropW, cropH := int(float64(b.Dx())*0.6+0.5), int(float64(b.Dy())*0.6+0.5)
	left := b.Min.X + (b.Dx()-cropW)/2
	top := b.Min.Y + (b.Dy()-cropH)/2

	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img,
		image.Rect(left, top, left+cropW, top+cropH), draw.Over, nil)

	out := make([]uint8, size*size*3)
	for i, p := 0, 0; p < len(dst.Pix); i, p = i+3, p+4 {
		out[i], out[i+1], out[i+2] = dst.Pix[p], dst.Pix[p+1], dst.Pix[p+2]
	}
	return out
}

// luma uses the Rec.709 coefficients, which is what libvips applies when
// converting to its b-w colourspace. Go's own color.GrayModel uses Rec.601 and
// would drift from the reference implementation by a few points per pixel.
func luma(r, g, b uint8) uint8 {
	y := 0.2126*float64(r) + 0.7152*float64(g) + 0.0722*float64(b)
	if y > 255 {
		y = 255
	}
	return uint8(y + 0.5)
}
