"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, formatDate } from "@/lib/client";
import {
  Button,
  Card,
  Field,
  Input,
  PasswordInput,
  Select,
  Modal,
  Badge,
  Empty,
  PageHeader,
  useToast,
} from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";
import { useUser } from "@/app/_components/user";

export default function UsersPage() {
  const me = useUser();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "manager",
  });

  // Editare manager
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "manager",
    password: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    try {
      setUsers(await apiGet("/api/users"));
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (me?.role !== "admin") {
    return (
      <Card className="p-8 text-center text-slate-500">
        Acces permis doar administratorului.
      </Card>
    );
  }

  async function save(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/users", form);
      toast("Manager adaugat");
      setOpen(false);
      setForm({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "manager",
      });
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(u) {
    setEditUser(u);
    setEditForm({
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      role: u.role || "manager",
      password: "",
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
      };
      if (editForm.password) payload.password = editForm.password;
      await apiPatch(`/api/users/${editUser._id}`, payload);
      toast("Manager actualizat");
      setEditUser(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleActive(u) {
    try {
      await apiPatch(`/api/users/${u._id}`, { active: !u.active });
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function remove(id) {
    if (!confirm("Stergeti acest utilizator?")) return;
    try {
      await apiDelete(`/api/users/${id}`);
      toast("Utilizator sters");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Manageri"
        subtitle="Adaugati si gestionati conturile managerilor."
        action={
          <Button onClick={() => setOpen(true)}>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
            Manager nou
          </Button>
        }
      />

      <Card>
        {users.length === 0 ? (
          <Empty>Niciun utilizator.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3">Nume</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Telefon</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Creat</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {u.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {u.phone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={u.role === "admin" ? "blue" : "slate"}>
                        {u.role === "admin" ? "Administrator" : "Manager"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={u.active ? "green" : "red"}>
                        {u.active ? "Activ" : "Inactiv"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u._id !== me.id && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(u)}
                          >
                            <Icon name="edit" className="h-4 w-4" />
                            Editeaza
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive(u)}
                          >
                            {u.active ? "Dezactiveaza" : "Activeaza"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(u._id)}
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Manager nou"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Anuleaza
            </Button>
            <Button onClick={save} disabled={loading}>
              {loading ? "Se salveaza…" : "Creeaza cont"}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Nume complet" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Parola" required>
            <PasswordInput
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Parola pentru manager"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Rol">
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
              </Select>
            </Field>
          </div>
        </form>
      </Modal>

      {/* Modal editare manager */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title={editUser ? `Editeaza: ${editUser.name}` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditUser(null)}>
              Anuleaza
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "Se salveaza…" : "Salveaza"}
            </Button>
          </>
        }
      >
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Nume complet" required>
            <Input
              value={editForm.name}
              onChange={(e) =>
                setEditForm({ ...editForm, name: e.target.value })
              }
              required
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={editForm.email}
              onChange={(e) =>
                setEditForm({ ...editForm, email: e.target.value })
              }
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon">
              <Input
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm({ ...editForm, phone: e.target.value })
                }
              />
            </Field>
            <Field label="Rol">
              <Select
                value={editForm.role}
                onChange={(e) =>
                  setEditForm({ ...editForm, role: e.target.value })
                }
              >
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Parola noua"
            hint="Lasa gol daca nu vrei sa o schimbi"
          >
            <PasswordInput
              value={editForm.password}
              onChange={(e) =>
                setEditForm({ ...editForm, password: e.target.value })
              }
              placeholder="Parola noua (optional)"
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
