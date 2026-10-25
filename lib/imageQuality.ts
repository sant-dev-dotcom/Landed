// Is a document photo good enough to read? Two checks, both on the device:
// 1. pixels: sharpness (variance of the Laplacian), brightness and contrast, before OCR;
// 2. text: how much OCR could read and how sure it was.
// No imports, so the thresholds can be checked with plain Node.

export type QualityIssue = "blurry" | "dark" | "bright" | "unreadable";

export interface PixelMetrics {
  /**
   * Variance of the Laplacian on a ~1000px grayscale copy, divided by the contrast squared,
   * so a dim or washed-out (but sharp) photo isn't mistaken for a blurry one. Low = blurry.
   */
  sharpness: number;
  /** Mean luminance, 0–255. */
  brightness: number;
  /** Standard deviation of luminance. Low = washed out or murky. */
  contrast: number;
}

/** Longest side the pixel check works at, so thresholds don't depend on camera resolution. */
export const QUALITY_SIDE = 1000;

// Tuned on a rendered letter blurred by downscaling 2×, 3×, 4× and 6×, plus dark and washed-out
// copies: at 3× (sharpness 0.46) every private detail was still found; at 4× (0.17) OCR read
// most words but missed the A-number and receipt number, so redaction would silently fail.
// Sharp, dark and washed-out copies scored 2.3–2.8. White paper makes a good document very
// bright (~249) with low overall contrast (~34), so brightness and contrast only reject
// near-black or near-blank images; the text check catches the rest.
const MIN_SHARPNESS = 0.3;
const MIN_BRIGHTNESS = 40;
const MIN_CONTRAST = 3;
/** Smaller photos don't have enough pixels per letter to read. */
export const MIN_SIDE = 600;

/** `gray` is one byte per pixel, row by row. */
export function measurePixels(gray: ArrayLike<number>, width: number, height: number): PixelMetrics {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < width * height; i++) {
    sum += gray[i];
    sumSq += gray[i] * gray[i];
  }
  const n = width * height;
  const brightness = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - brightness * brightness));

  // 4-neighbour Laplacian over the interior.
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      lapSum += v;
      lapSq += v * v;
      count++;
    }
  }
  const lapMean = lapSum / count;
  const lapVariance = lapSq / count - lapMean * lapMean;
  return { sharpness: lapVariance / Math.max(1, contrast * contrast), brightness, contrast };
}

export function judgePixels(m: PixelMetrics): QualityIssue | null {
  if (m.brightness < MIN_BRIGHTNESS) return "dark";
  if (m.contrast < MIN_CONTRAST) return m.brightness > 128 ? "bright" : "dark";
  if (m.sharpness < MIN_SHARPNESS) return "blurry";
  return null;
}

// Text check: a letter has plenty of words, and OCR is fairly sure of most of them.
const MIN_WORDS = 15;
const MIN_CONFIDENT_SHARE = 0.6;
const CONFIDENT = 70;

export function judgeText(words: { text: string; confidence: number }[]): QualityIssue | null {
  const real = words.filter((w) => /[\p{L}\p{N}]{2,}/u.test(w.text));
  if (real.length < MIN_WORDS) return "unreadable";
  const confident = real.filter((w) => w.confidence >= CONFIDENT).length;
  return confident / real.length < MIN_CONFIDENT_SHARE ? "unreadable" : null;
}
