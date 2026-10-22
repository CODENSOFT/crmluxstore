"use client";

// Galeria produsului: editor (formular) + vizualizare (pagina produsului)
import { useRef, useState } from "react";
import { Button, Input, Badge, cx } from "@/app/_components/ui";
import { Modal, useToast } from "@/app/_components/overlay";
import { ImageIcon, UploadSimple, LinkIcon, Trash, Star, ArrowLeft, ArrowRight, CaretLeft, CaretRight, Plus } from "@/app/_components/icons";

export const MAX_PHOTOS = 10;

// Micsoreaza imaginea in browser (max 1200 px, WebP) — fisier mic, se incarca repede, arata clar
function resizeImage(file, max = 1200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/webp", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Sursa unei fotografii pentru afisare: link extern / data URL (nou) / ruta din CRM (salvata) */
export function photoSrc(product, i) {
  const ph = product?.photos?.[i] ?? (i === 0 ? product?.photo : null);
  if (!ph) return null;
  if (/^https?:\/\//.test(ph) || ph.startsWith("data:")) return ph;
  return `/api/products/${product._id}/photo?i=${i}&v=${new Date(product.updatedAt || 0).getTime()}`;
}

/* ---------------- Editor (formularul de produs) ---------------- */
export function GalleryEditor({ photos, onChange }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");
  const left = MAX_PHOTOS - photos.length;

  const addFiles = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return toast("Alegeți imagini (JPG, PNG, WebP)", "error");
    if (list.length > left) toast(`Se pot adăuga cel mult ${MAX_PHOTOS} fotografii — am păstrat primele ${left}`, "error");
    const take = list.slice(0, Math.max(0, left));
    setBusy(take.length);
    const out = [];
    for (const f of take) {
      try {
        out.push(await resizeImage(f));
      } catch {
        toast(`Imaginea „${f.name}” nu a putut fi citită`, "error");
      }
      setBusy((n) => n - 1);
    }
    setBusy(0);
    if (out.length) onChange([...photos, ...out]);
  };
  const addUrl = () => {
    if (!/^https?:\/\//.test(url.trim()) || left <= 0) return;
    onChange([...photos, url.trim()]);
    setUrl("");
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const makeMain = (i) => onChange([photos[i], ...photos.filter((_, k) => k !== i)]);
  const remove = (i) => onChange(photos.filter((_, k) => k !== i));

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files || []); e.target.value = ""; }} />

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
          {photos.map((ph, i) => (
            <div key={`${i}-${ph.slice(-24)}`} className={cx("group relative overflow-hidden rounded-xl border bg-white", i === 0 ? "border-accent ring-1 ring-accent" : "border-line")}>
              <div className="aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph} alt="" className="h-full w-full object-contain p-1.5" />
              </div>
              {i === 0 && (
                <span className="absolute left-1.5 top-1.5">
                  <Badge tone="accent">Principală</Badge>
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-gradient-to-t from-black/60 to-transparent px-1 pb-1.5 pt-6 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
                {i > 0 && <GalleryBtn icon={Star} label="Fă principală" onClick={() => makeMain(i)} />}
                <GalleryBtn icon={ArrowLeft} label="Mută la stânga" onClick={() => move(i, -1)} disabled={i === 0} />
                <GalleryBtn icon={ArrowRight} label="Mută la dreapta" onClick={() => move(i, 1)} disabled={i === photos.length - 1} />
                <GalleryBtn icon={Trash} label="Elimină" danger onClick={() => remove(i)} />
              </div>
            </div>
          ))}
          {left > 0 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-[12.5px] text-fg-3 transition-colors hover:border-accent hover:bg-accent-soft/40 hover:text-accent"
            >
              <Plus size={22} />
              Adaugă
            </button>
          )}
        </div>
      )}

      {photos.length === 0 && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files || []); }}
          className={cx(
            "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            over ? "border-accent bg-accent-soft/50" : "border-line-strong hover:border-accent hover:bg-surface-2"
          )}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <UploadSimple size={24} />
          </span>
          <span className="text-[14px] font-medium text-fg">Trageți fotografiile aici sau alegeți-le de pe calculator</span>
          <span className="text-[12.5px] text-fg-3">JPG, PNG sau WebP · până la {MAX_PHOTOS} fotografii · se micșorează automat</span>
        </button>
      )}

      {photos.length > 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files || []); }}
          className={cx("rounded-xl px-3 py-2 text-[12.5px] text-fg-3 transition-colors", over ? "bg-accent-soft/60 text-accent" : "bg-surface-2/60")}
        >
          {photos.length} / {MAX_PHOTOS} fotografii · prima este cea principală (apare în listă, pe site și în bot). Puteți trage și aici imagini noi.
        </div>
      )}

      {busy > 0 && <p className="text-[12.5px] font-medium text-accent">Se pregătesc {busy} fotografii…</p>}

      {left > 0 && (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUrl())} placeholder="sau lipiți linkul unei imagini (ex: de pe luxstore.md)" prefix={<LinkIcon size={14} />} />
          </div>
          <Button disabled={!/^https?:\/\//.test(url.trim())} onClick={addUrl}>Adaugă linkul</Button>
        </div>
      )}
    </div>
  );
}

function GalleryBtn({ icon: Icon, label, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx("flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-gray-800 shadow-sm transition-colors disabled:opacity-40", danger ? "hover:bg-red-600 hover:text-white" : "hover:bg-white")}
    >
      <Icon size={14} weight="bold" />
    </button>
  );
}

/* ---------------- Vizualizare (pagina produsului) ---------------- */
export function ProductGallery({ product, onAdd }) {
  const count = product.photos?.length || (product.photo ? 1 : 0);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const cur = Math.min(active, Math.max(0, count - 1));
  if (!count) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center border-b border-line bg-surface-2">
        {onAdd ? (
          <button type="button" onClick={onAdd} className="flex flex-col items-center gap-2 text-[13px] text-fg-3 hover:text-fg">
            <ImageIcon size={36} />
            Adaugă fotografii
          </button>
        ) : (
          <ImageIcon size={36} className="text-fg-4" />
        )}
      </div>
    );
  }
  return (
    <div className="border-b border-line">
      <div className="group relative flex aspect-[4/3] items-center justify-center bg-white">
        <button type="button" onClick={() => setZoom(true)} className="h-full w-full cursor-zoom-in" aria-label="Mărește fotografia">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoSrc(product, cur)} alt={product.name} className="h-full w-full object-contain p-4" />
        </button>
        {count > 1 && (
          <>
            <NavBtn side="left" onClick={() => setActive((cur - 1 + count) % count)} />
            <NavBtn side="right" onClick={() => setActive((cur + 1) % count)} />
            <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11.5px] font-medium text-white">{cur + 1} / {count}</span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto bg-surface px-3 py-2.5">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={cx("h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-white transition-shadow", i === cur ? "border-accent ring-2 ring-accent/40" : "border-line hover:border-line-strong")}
              aria-label={`Fotografia ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(product, i)} alt="" className="h-full w-full object-contain p-0.5" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <Modal open={zoom} onClose={() => setZoom(false)} size="xl" title={product.name}>
        <div className="relative flex items-center justify-center rounded-xl bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoSrc(product, cur)} alt={product.name} className="max-h-[70vh] w-auto object-contain" />
          {count > 1 && (
            <>
              <NavBtn side="left" onClick={() => setActive((cur - 1 + count) % count)} always />
              <NavBtn side="right" onClick={() => setActive((cur + 1) % count)} always />
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function NavBtn({ side, onClick, always }) {
  const Icon = side === "left" ? CaretLeft : CaretRight;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={side === "left" ? "Fotografia anterioară" : "Fotografia următoare"}
      className={cx(
        "absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-md transition-opacity hover:bg-white",
        side === "left" ? "left-2" : "right-2",
        !always && "opacity-0 group-hover:opacity-100 max-sm:opacity-100"
      )}
    >
      <Icon size={18} weight="bold" />
    </button>
  );
}
