"use client";

import NextLink from "next/link";

// Link-ul aplicatiei: fara pre-incarcare automata. Paginile CRM-ului sunt dinamice (sesiune), iar
// pre-incarcarea fiecarui link vizibil trimitea zeci de cereri la server la fiecare pagina deschisa
// (meniul + panoul), exact cand pagina avea nevoie de date. La clic apare imediat app/(app)/loading.js.
export default function Link({ prefetch = false, ...props }) {
  return <NextLink prefetch={prefetch} {...props} />;
}
