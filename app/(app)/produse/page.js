"use client";

import { useEffect, useState } from "react";
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  money,
  UNIT_LABELS,
} from "@/lib/client";
import {
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  Badge,
  Empty,
  PageHeader,
  useToast,
} from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";

const UNITS = ["bucata", "kg", "litri", "metru"];

// Redimensioneaza imaginea in browser si o transforma in data URL (base64) compact
function fileToResizedDataURL(file, max = 600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const EMPTY = {
  name: "",
  description: "",
  sku: "",
  unit: "bucata",
  price: "",
  warehouse: "",
  quantity: "",
  photo: "",
};

export default function ProductsPage() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  // Incarcari independente: o eroare la produse NU mai blocheaza depozitele
  async function loadProducts() {
    try {
      setList(await apiGet("/api/products"));
    } catch (e) {
      toast(e.message, "error");
    }
  }
  async function loadWarehouses() {
    try {
      setWarehouses(await apiGet("/api/warehouses"));
    } catch {
      /* depozitele lipsa nu blocheaza pagina */
    }
  }
  async function load() {
    await Promise.all([loadProducts(), loadWarehouses()]);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await fileToResizedDataURL(file);
      setForm((f) => ({ ...f, photo: data }));
    } catch {
      toast("Nu am putut incarca imaginea", "error");
    }
  }

  function openCreate() {
    setEditId(null);
    setForm(EMPTY);
    loadWarehouses(); // depozite proaspete (poate ai adaugat unul intre timp)
    setOpen(true);
  }

  function openEdit(p) {
    setEditId(p._id);
    setForm({
      name: p.name || "",
      description: p.description || "",
      sku: p.sku || "",
      unit: p.unit || "bucata",
      price: p.price ?? "",
      warehouse: "",
      quantity: "",
      photo: p.photo || "",
    });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (editId) {
        await apiPatch(`/api/products/${editId}`, {
          name: form.name,
          description: form.description,
          sku: form.sku,
          unit: form.unit,
          price: form.price,
          photo: form.photo,
        });
        toast("Produs actualizat");
      } else {
        await apiPost("/api/products", form);
        toast("Produs adaugat");
      }
      setOpen(false);
      setForm(EMPTY);
      setEditId(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id) {
    if (!confirm("Stergeti produsul?")) return;
    try {
      await apiDelete(`/api/products/${id}`);
      toast("Produs sters");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const filtered = list.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Produse"
        subtitle="Catalogul de produse chimice si echipamente."
        action={
          <Button onClick={openCreate}>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
            Produs nou
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Cauta produs…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <Empty>Niciun produs. Adaugati primul produs in catalog.</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const total = (p.stock || []).reduce(
              (s, x) => s + (x.quantity || 0),
              0
            );
            return (
              <Card key={p._id} className="overflow-hidden">
                <div className="flex h-36 items-center justify-center bg-slate-100">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photo}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Icon
                      name="package"
                      className="h-12 w-12 text-slate-300"
                      strokeWidth={1.3}
                    />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-800">{p.name}</h3>
                    <Badge color={total === 0 ? "red" : "green"}>
                      {total} {UNIT_LABELS[p.unit]}
                    </Badge>
                  </div>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-2 text-sm font-semibold text-indigo-600">
                    {money(p.price)}
                    <span className="font-normal text-slate-400">
                      {" "}
                      / {UNIT_LABELS[p.unit]}
                    </span>
                  </div>

                  {p.stock?.length > 0 && (
                    <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
                      {p.stock.map((s, i) => (
                        <div key={i} className="flex justify-between">
                          <span>{s.warehouse?.name || "Depozit"}</span>
                          <span className="font-medium">{s.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(p)}
                    >
                      <Icon name="edit" className="h-4 w-4" />
                      Editeaza
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(p._id)}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                      Sterge
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Editeaza produs" : "Produs nou"}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Anuleaza
            </Button>
            <Button onClick={save} disabled={loading}>
              {loading
                ? "Se salveaza…"
                : editId
                  ? "Salveaza modificarile"
                  : "Salveaza produs"}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Denumire" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ex: Sampon auto activ 5L"
                required
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Descriere">
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Detalii optionale despre produs"
              />
            </Field>
          </div>

          <Field label="Cod produs (SKU)">
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="optional"
            />
          </Field>

          <Field label="Unitate de masura" required>
            <Select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Pret pe unitate">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="0.00"
            />
          </Field>

          <Field label="Fotografie">
            <input
              type="file"
              accept="image/*"
              onChange={onPhoto}
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-600"
            />
            {form.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.photo}
                alt="preview"
                className="mt-2 h-20 w-20 rounded-lg object-cover"
              />
            )}
          </Field>

          {!editId && (
          <div className="sm:col-span-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-500">
                Stoc initial (optional) — adauga produsul direct intr-un depozit
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Depozit">
                  <Select
                    value={form.warehouse}
                    onChange={(e) =>
                      setForm({ ...form, warehouse: e.target.value })
                    }
                  >
                    <option value="">— alege depozit —</option>
                    {warehouses.map((w) => (
                      <option key={w._id} value={w._id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cantitate">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: e.target.value })
                    }
                    placeholder="0"
                  />
                </Field>
              </div>
              {warehouses.length === 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  Nu exista depozite. Creati intai un depozit.
                </p>
              )}
            </div>
          </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
