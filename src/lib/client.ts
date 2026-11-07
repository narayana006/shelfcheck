"use client";

import type { CheckResult } from "./check";
import type { SkinScan } from "./skin";

export interface SavedCheck {
  id: string;
  checkedAt: string;
  result: CheckResult;
}

const SCANS_KEY = "shelfcheck.scans";
const CHECKS_KEY = "shelfcheck.checks";

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app still works for this session.
  }
}

export const store = {
  scans: () => read<SkinScan>(SCANS_KEY),
  saveScans: (s: SkinScan[]) => write(SCANS_KEY, s),
  checks: () => read<SavedCheck>(CHECKS_KEY),
  saveChecks: (c: SavedCheck[]) => write(CHECKS_KEY, c.slice(0, 30)),
};

/** Downscale a camera photo so uploads are fast and within API limits. */
export async function prepareImage(file: File, maxLongSide = 2048): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxLongSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.9),
  );
}

/** Read a barcode from a photo. Uses the native detector when the browser has one. */
export async function decodeBarcode(file: File): Promise<string | null> {
  const Detector = (globalThis as { BarcodeDetector?: new (o: object) => { detect(s: ImageBitmapSource): Promise<{ rawValue: string }[]> } })
    .BarcodeDetector;
  if (Detector) {
    try {
      const found = await new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }).detect(await createImageBitmap(file));
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch {
      // Fall through to the JS decoder.
    }
  }
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const url = URL.createObjectURL(file);
  try {
    const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    return result.getText();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export const newId = () => Math.random().toString(36).slice(2, 10);
