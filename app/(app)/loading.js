import { Skeleton } from "@/app/_components/ui";

// Se afiseaza imediat la clic pe un link din meniu, cat timp vine pagina noua de la server
// (fara el, pagina veche ramanea „inghetata” pana raspundea serverul). Permite si pre-incarcarea paginilor.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Se încarcă">
      <Skeleton className="h-8 w-56 max-w-full" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72" />
    </div>
  );
}
