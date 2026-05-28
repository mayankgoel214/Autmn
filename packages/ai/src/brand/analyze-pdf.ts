/**
 * Phase 3b — PDF text extraction via pdf-parse.
 *
 * Phase 3b ships text-only — page thumbnails for image-analysis (also called
 * out in the plan) are a follow-up. The summary generator works fine on text
 * alone for the common SMB case (brochures, catalogues, packaging mocks).
 */

// pdf-parse is CommonJS; dynamic-import to avoid ESM interop edge cases on
// some Node versions and to keep the dep optional until the worker actually
// processes a PDF.
export async function analyzePDF(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const mod = (await import('pdf-parse')) as any;
  const pdfParse = mod.default ?? mod;
  const result = await pdfParse(buffer, { max: 5 });
  const text = (result.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 5000);
  return { text, pages: Math.min(result.numpages ?? 0, 5) };
}
