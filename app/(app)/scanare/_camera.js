"use client";

// Scanarea cu camera telefonului / tabletei (BarcodeDetector — Chrome pe Android, Edge, Safari 17+ pe macOS).
// Unde browserul nu are detectorul, se folosește un scaner USB/Bluetooth sau se tastează codul.
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/app/_components/overlay";
import { Alert, Button } from "@/app/_components/ui";
import { WarningCircle } from "@/app/_components/icons";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code", "data_matrix"];

export const cameraSupported = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

export function CameraScanner({ open, onClose, onCode }) {
  if (!open) return null;
  return <CameraBody onClose={onClose} onCode={onCode} />;
}

function CameraBody({ onClose, onCode }) {
  const video = useRef(null);
  const [error, setError] = useState(cameraSupported() ? null : "unsupported");
  const [last, setLast] = useState(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!cameraSupported()) return;
    let stream = null;
    let timer = null;
    let stopped = false;
    const seen = new Map(); // acelasi cod nu se repeta mai des de 1,5 s
    (async () => {
      try {
        const supported = (await window.BarcodeDetector.getSupportedFormats?.()) || FORMATS;
        const detector = new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) return;
        const v = video.current;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2) {
              const found = await detector.detect(v);
              const now = Date.now();
              for (const b of found) {
                const code = String(b.rawValue || "").trim();
                if (!code || now - (seen.get(code) || 0) < 1500) continue;
                seen.set(code, now);
                setLast(code);
                onCodeRef.current(code);
              }
            }
          } catch {
            /* cadru nereusit — continuam */
          }
          timer = setTimeout(tick, 180);
        };
        tick();
      } catch (e) {
        if (!stopped) setError(e?.name === "NotAllowedError" ? "denied" : e?.message || "error");
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Modal open onClose={onClose} title="Scanare cu camera" description="Îndreptați camera spre codul de bare. Fiecare cod citit se adaugă automat." size="md" footer={<Button variant="primary" onClick={onClose}>Gata</Button>}>
      {error ? (
        <Alert tone="warn" icon={WarningCircle} title={error === "unsupported" ? "Browserul nu poate citi coduri din cameră" : error === "denied" ? "Accesul la cameră a fost refuzat" : "Camera nu a putut fi pornită"}>
          {error === "unsupported"
            ? "Folosiți Chrome pe Android sau un scaner USB / Bluetooth (funcționează în orice browser). Codul se poate și tasta manual."
            : error === "denied"
              ? "Permiteți accesul la cameră din setările browserului pentru acest site și încercați din nou."
              : String(error)}
        </Alert>
      ) : (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-bad/80 shadow-[0_0_12px_rgba(255,0,0,.6)]" />
          </div>
          <div className="text-center text-[13px] text-fg-3">{last ? <>Ultimul cod: <span className="font-mono text-fg">{last}</span></> : "Se caută un cod…"}</div>
        </div>
      )}
    </Modal>
  );
}
