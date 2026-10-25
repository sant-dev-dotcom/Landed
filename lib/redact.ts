"use client";

import { findSensitive, pad, type Box, type Finding, type OcrLine } from "./redactRules";
import { judgePixels, judgeText, measurePixels, MIN_SIDE, QUALITY_SIDE, type QualityIssue } from "./imageQuality";

// On-device redaction for document photos: check the photo is clear enough, read the words
// with OCR in the browser, find private details, and paint solid black bars over them before
// the image is sent anywhere.
// The OCR engine and its English model are downloaded once from a CDN; the photo itself is
// never uploaded for this step.

export interface RedactionScan {
  width: number;
  height: number;
  findings: Finding[];
  /** False when OCR couldn't run (offline, old browser): the person covers details by hand. */
  ocrOk: boolean;
  /** Set when the photo is too blurry, dark, washed out or unreadable to use. */
  quality: QualityIssue | null;
}

/** Sharpness, brightness and contrast on a small grayscale copy. */
function pixelIssue(img: HTMLImageElement): QualityIssue | null {
  const scale = Math.min(1, QUALITY_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  canvas.width = canvas.height = 0;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  return judgePixels(measurePixels(gray, w, h));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

/** Find private details in the image. `onProgress` gets 0–1. */
export async function scanForPrivateDetails(dataUrl: string, names: string[], onProgress?: (p: number) => void): Promise<RedactionScan> {
  const img = await loadImage(dataUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  // Reject unusable photos before spending time on OCR.
  const early: QualityIssue | null = Math.max(width, height) < MIN_SIDE ? "unreadable" : pixelIssue(img);
  if (early) return { width, height, findings: [], ocrOk: false, quality: early };
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") onProgress?.(0.3 + m.progress * 0.7);
        else if (typeof m.progress === "number") onProgress?.(Math.min(0.3, m.progress * 0.3));
      },
    });
    try {
      const { data } = await worker.recognize(dataUrl, {}, { blocks: true });
      const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
      // Too little readable text: redaction (and the explanation) can't be trusted.
      const quality = judgeText(words);
      if (quality) return { width, height, findings: [], ocrOk: true, quality };
      const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) =>
        b.paragraphs.flatMap((p) => p.lines.map((l) => ({ words: l.words.map((w) => ({ text: w.text, bbox: w.bbox })) })))
      );
      const findings = findSensitive(lines, names).map((f) => ({ ...f, box: pad(f.box, width, height) }));
      return { width, height, findings, ocrOk: true, quality: null };
    } finally {
      await worker.terminate();
    }
  } catch {
    // OCR unavailable: the sharpness check already passed; the person covers details by hand.
    return { width, height, findings: [], ocrOk: false, quality: null };
  }
}

/** A copy of the image with solid black bars painted over the boxes (image pixels). */
export async function paintRedactions(dataUrl: string, boxes: Box[]): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = "#000";
  for (const b of boxes) ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  const out = canvas.toDataURL("image/jpeg", 0.85);
  canvas.width = canvas.height = 0; // release the bitmap
  return out;
}
