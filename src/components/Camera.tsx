"use client";

import { Camera as CameraIcon, RotateCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, ErrorNote } from "./ui";

/**
 * In-app selfie camera: live mirrored preview with a face guide, a shutter, and a review step.
 * Crops to a 3:4 portrait around the guide so the face fills most of the frame (what YouCam needs).
 * Falls back to a file upload when the browser has no camera or permission is denied.
 */
export function Camera({ onPhoto, busy }: { onPhoto: (file: File) => void; busy: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "live" | "review" | "error">("idle");
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  useEffect(() => stop, []);

  async function start() {
    setError(null);
    setState("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError("This browser can't open the camera. Upload a photo instead.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }
      setState("live");
    } catch (e) {
      setState("error");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in your browser's address bar, or upload a photo instead."
          : "Couldn't open the camera. Upload a photo instead.",
      );
    }
  }

  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    // Portrait 3:4 crop from the centre of the frame, matching the on-screen guide.
    const h = v.videoHeight;
    const w = Math.min(v.videoWidth, Math.round(h * 0.75));
    const x = Math.round((v.videoWidth - w) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(v, x, 0, w, h, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
        setShot({ file, url: URL.createObjectURL(blob) });
        setState("review");
        stop();
      },
      "image/jpeg",
      0.92,
    );
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    start();
  }

  return (
    <div className="grid gap-4">
      <input
        ref={upload}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPhoto(f);
          e.target.value = "";
        }}
      />

      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-[32px] bg-[#1f1b16]">
        {/* Live preview is mirrored like a mirror; the captured photo is not. */}
        <video
          ref={video}
          playsInline
          muted
          aria-label="Camera preview"
          className={`h-full w-full scale-x-[-1] object-cover ${state === "live" ? "opacity-100" : "opacity-0"}`}
        />
        {state === "review" && shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt="Your selfie" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {state === "live" && (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-[64%] w-[72%] rounded-[50%] border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <p className="pointer-events-none absolute inset-x-0 top-4 text-center text-[14px] font-medium text-white drop-shadow">
              Fit your face in the oval · even light · no glasses
            </p>
          </>
        )}
        {(state === "idle" || state === "starting" || state === "error") && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white/80">
            <div>
              <CameraIcon className="mx-auto h-10 w-10" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 text-[15px]">{state === "starting" ? "Opening your camera…" : "Your camera stays on this device until you take the photo."}</p>
            </div>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/45 text-white" role="status">
            <div className="text-center">
              <span className="mx-auto block h-8 w-8 motion-safe:animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              <p className="mt-3 text-[15px] font-medium">Analyzing your skin…</p>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-sm gap-2">
        {state === "live" ? (
          <button
            onClick={capture}
            aria-label="Take photo"
            className="mx-auto grid h-[72px] w-[72px] place-items-center rounded-full bg-raised ring-4 ring-brand-fill transition enabled:active:scale-95"
          >
            <span className="h-14 w-14 rounded-full bg-brand-fill" />
          </button>
        ) : state === "review" && shot ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={retake} disabled={busy}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Retake
            </Button>
            <Button onClick={() => onPhoto(shot.file)} disabled={busy}>
              Use photo
            </Button>
          </div>
        ) : (
          <Button onClick={start} disabled={state === "starting" || busy}>
            <CameraIcon className="h-5 w-5" aria-hidden /> Open camera
          </Button>
        )}
        <Button variant="link" onClick={() => upload.current?.click()} disabled={busy}>
          <Upload className="h-4 w-4" aria-hidden /> Upload a photo instead
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
