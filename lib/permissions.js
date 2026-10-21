// Drepturile utilizatorilor. Folosit atat pe server (API), cat si in interfata.
//
// Administrator principal (owner, unul singur): tot + gestioneaza administratorii, Setari si Integrari.
// Administrator: are toate drepturile de lucru (comenzi, stoc, catalog, angajati, stergere).
// Angajat (rol "manager"): munca de zi cu zi, fara stergeri —
//   - vede si lucreaza comenzile proprii + comenzile noi de pe site (casuta comuna);
//   - creeaza comenzi (merg la aprobare, daca e activata), inregistreaza plati;
//   - vede si actualizeaza sarcinile proprii;
//   - vede produsele si stocul, inregistreaza receptii de marfa;
//   - adauga clienti si furnizori noi (fara a-i edita sau sterge).
// Orice drept suplimentar il acorda administratorul, individual, din Utilizatori.

export const PERMISSIONS = [
  { key: "orders.all", group: "Comenzi", label: "Vede toate comenzile", description: "Nu doar comenzile proprii și cele noi venite de pe site." },
  { key: "orders.approve", group: "Comenzi", label: "Aprobă și gestionează comenzi", description: "Aprobă / respinge comenzi și modificări, anulează comenzi în lucru, schimbă responsabilul." },
  { key: "products.manage", group: "Catalog", label: "Adaugă și editează produse", description: "Produse noi, prețuri, categorii, import din Excel." },
  { key: "customers.manage", group: "Clienți și furnizori", label: "Editează clienți", description: "Modifică datele și condițiile comerciale ale clienților existenți." },
  { key: "suppliers.manage", group: "Clienți și furnizori", label: "Editează furnizori", description: "Modifică datele furnizorilor existenți." },
  { key: "stock.transfer", group: "Stoc", label: "Transferuri între depozite" },
  { key: "stock.writeoff", group: "Stoc", label: "Casări", description: "Scoaterea din stoc a produselor deteriorate, expirate sau consumate intern." },
  { key: "stock.inventory", group: "Stoc", label: "Inventariere", description: "Creează fișe și numără stocul. Finalizarea (corectarea stocului) rămâne la administrator." },
  { key: "tasks.manage", group: "Echipă", label: "Gestionează sarcinile echipei", description: "Vede toate sarcinile și le atribuie colegilor." },
  { key: "reports.view", group: "Echipă", label: "Rapoarte", description: "Vânzări, produse, clienți, datorii, stoc, casări." },
  { key: "delete", group: "Ștergere", label: "Poate șterge înregistrări", description: "Comenzi, plăți, sarcini și — împreună cu dreptul de editare — produse, clienți, furnizori. Fără acest drept nu se poate șterge nimic." },
];

const KEYS = new Set(PERMISSIONS.map((p) => p.key));

export const ADMIN_ROLES = ["owner", "admin"];
/** Administrator (principal sau obisnuit) */
export const isAdminUser = (user) => ADMIN_ROLES.includes(user?.role);
/** Administratorul principal */
export const isOwner = (user) => user?.role === "owner";

export const permissionLabel = (key) => PERMISSIONS.find((p) => p.key === key)?.label || key;

/** Pastreaza doar cheile cunoscute, fara duplicate. */
export function cleanPermissions(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter((k) => KEYS.has(k)))];
}

/** Are utilizatorul dreptul (sau toate drepturile din lista)? Administratorul are tot. */
export function can(user, perm) {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  const own = user.permissions || [];
  return (Array.isArray(perm) ? perm : [perm]).every((p) => own.includes(p));
}
