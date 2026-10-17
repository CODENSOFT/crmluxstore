// Schema bazei de date Postgres (Supabase). Se aplica automat la prima conexiune
// (idempotent, versionat in schema_meta). La modificari: cresteti SCHEMA_VERSION
// si adaugati instructiuni idempotente (create ... if not exists / alter ... add column if not exists).
export const SCHEMA_VERSION = "2026.10.1";

const TS = `created_at timestamptz not null default now(), updated_at timestamptz not null default now()`;
const ID = `id uuid primary key default gen_random_uuid()`;

export const SCHEMA_SQL = `
create table if not exists schema_meta (key text primary key, value text);

create table if not exists users (
  ${ID},
  name text not null,
  email text not null,
  password_hash text not null,
  role text not null default 'manager' check (role in ('admin', 'manager')),
  phone text,
  position text,
  active boolean not null default true,
  last_login_at timestamptz,
  ${TS}
);
create unique index if not exists users_email_key on users (lower(email));

create table if not exists warehouses (
  ${ID},
  name text not null,
  code text,
  type text not null default 'warehouse',
  address text,
  note text,
  is_default boolean not null default false,
  sync_to_site boolean not null default true,
  active boolean not null default true,
  external_id text,
  ${TS}
);
create index if not exists warehouses_external_idx on warehouses (external_id);

create table if not exists categories (
  ${ID},
  name text not null,
  slug text,
  parent_id uuid references categories (id) on delete set null,
  sort integer not null default 0,
  color text,
  active boolean not null default true,
  external_id text,
  woo_id bigint,
  ${TS}
);
create index if not exists categories_external_idx on categories (external_id);

create table if not exists products (
  ${ID},
  name text not null,
  description text,
  photo text,
  sku text,
  barcode text,
  category_id uuid references categories (id) on delete set null,
  brand text,
  packaging text,
  unit text not null default 'bucata',
  price numeric(14, 2) not null default 0,
  wholesale_price numeric(14, 2),
  cost_price numeric(14, 4),
  vat_rate numeric(5, 2),
  min_stock numeric(14, 4),
  is_composite boolean not null default false,
  components jsonb not null default '[]',
  tags text[] not null default '{}',
  active boolean not null default true,
  external_id text,
  woo_id bigint,
  woo_parent_id bigint,
  source text not null default 'crm',
  ${TS}
);
create index if not exists products_name_idx on products (lower(name));
create index if not exists products_sku_idx on products (lower(sku));
create index if not exists products_barcode_idx on products (barcode);
create index if not exists products_category_idx on products (category_id);
create index if not exists products_external_idx on products (external_id);
create index if not exists products_woo_idx on products (woo_id);
create index if not exists products_updated_idx on products (updated_at);

-- Stocul pe depozit: un rand per (produs, depozit). Modificat DOAR prin lib/stock.js (cu registru).
create table if not exists stock (
  product_id uuid not null references products (id) on delete cascade,
  warehouse_id uuid not null references warehouses (id) on delete cascade,
  quantity numeric(14, 4) not null default 0,
  primary key (product_id, warehouse_id)
);
create index if not exists stock_warehouse_idx on stock (warehouse_id);

create table if not exists customers (
  ${ID},
  number text unique,
  type text not null default 'individual',
  name text not null,
  contact_person text,
  phone text,
  phone_norm text,
  phone2 text,
  email text,
  idno text,
  vat_code text,
  iban text,
  bank text,
  legal_address text,
  city text,
  address text,
  segment text not null default 'retail',
  price_type text not null default 'retail',
  discount numeric(5, 2) not null default 0,
  payment_term_days integer not null default 0,
  source text,
  tags text[] not null default '{}',
  note text,
  manager_id uuid references users (id) on delete set null,
  active boolean not null default true,
  orders_count integer not null default 0,
  total_spent numeric(14, 2) not null default 0,
  balance numeric(14, 2) not null default 0,
  last_order_at timestamptz,
  external_id text,
  woo_customer_id bigint,
  ${TS}
);
create index if not exists customers_name_idx on customers (lower(name));
create index if not exists customers_phone_idx on customers (phone_norm);
create index if not exists customers_email_idx on customers (lower(email));
create index if not exists customers_idno_idx on customers (idno);
create index if not exists customers_external_idx on customers (external_id);
create index if not exists customers_spent_idx on customers (total_spent desc);
create index if not exists customers_updated_idx on customers (updated_at);

create table if not exists orders (
  ${ID},
  number text not null unique,
  status text not null default 'new',
  channel text not null default 'store',
  customer_id uuid references customers (id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_email text,
  price_type text not null default 'retail',
  subtotal numeric(14, 2) not null default 0,
  vat_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  delivery jsonb not null default '{}',
  payment_method text not null default 'cash',
  paid_amount numeric(14, 2) not null default 0,
  payment_status text not null default 'unpaid',
  due_date timestamptz,
  invoice jsonb not null default '{}',
  responsible_id uuid references users (id) on delete set null,
  created_by_id uuid references users (id) on delete set null,
  approved_by_id uuid references users (id) on delete set null,
  note text,
  internal_note text,
  cancel_reason text,
  stock_applied boolean not null default false,
  completed_at timestamptz,
  pending_edit jsonb,
  external_source text,
  external_id text,
  external_number text,
  export1c jsonb not null default '{}',
  ${TS}
);
create unique index if not exists orders_external_key on orders (external_source, external_id) where external_id is not null;
create index if not exists orders_status_idx on orders (status, created_at desc);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_customer_idx on orders (customer_id, created_at desc);
create index if not exists orders_responsible_idx on orders (responsible_id);
create index if not exists orders_creator_idx on orders (created_by_id);
create index if not exists orders_payment_idx on orders (payment_status);
create index if not exists orders_updated_idx on orders (updated_at);

create table if not exists order_items (
  ${ID},
  order_id uuid not null references orders (id) on delete cascade,
  position integer not null default 0,
  product_id uuid references products (id) on delete set null,
  product_name text,
  sku text,
  warehouse_id uuid references warehouses (id) on delete set null,
  quantity numeric(14, 4) not null,
  unit text,
  unit_price numeric(14, 2) not null default 0,
  discount numeric(5, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  vat_rate numeric(5, 2) not null default 0,
  cost_price numeric(14, 4)
);
create index if not exists order_items_order_idx on order_items (order_id, position);
create index if not exists order_items_product_idx on order_items (product_id);

create table if not exists payments (
  ${ID},
  order_id uuid not null references orders (id) on delete cascade,
  amount numeric(14, 2) not null,
  method text not null default 'cash',
  date timestamptz not null default now(),
  note text,
  reference text,
  created_by_id uuid references users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists payments_order_idx on payments (order_id);

create table if not exists suppliers (
  ${ID},
  name text not null,
  contact_person text,
  phone text,
  email text,
  website text,
  address text,
  country text,
  idno text,
  iban text,
  payment_term_days integer not null default 0,
  brands text[] not null default '{}',
  note text,
  active boolean not null default true,
  external_id text,
  ${TS}
);
create index if not exists suppliers_external_idx on suppliers (external_id);

create table if not exists arrivals (
  ${ID},
  number text unique,
  warehouse_id uuid references warehouses (id) on delete set null,
  supplier_id uuid references suppliers (id) on delete set null,
  supplier text,
  supplier_invoice text,
  supplier_invoice_date timestamptz,
  items jsonb not null default '[]',
  total numeric(14, 2) not null default 0,
  note text,
  created_by_id uuid references users (id) on delete set null,
  external_id text,
  source text not null default 'crm',
  ${TS}
);
create unique index if not exists arrivals_external_key on arrivals (external_id) where external_id is not null;
create index if not exists arrivals_created_idx on arrivals (created_at desc);
create index if not exists arrivals_supplier_idx on arrivals (supplier_id);

create table if not exists transfers (
  ${ID},
  number text unique,
  from_warehouse_id uuid references warehouses (id) on delete set null,
  to_warehouse_id uuid references warehouses (id) on delete set null,
  items jsonb not null default '[]',
  note text,
  created_by_id uuid references users (id) on delete set null,
  ${TS}
);
create index if not exists transfers_created_idx on transfers (created_at desc);

create table if not exists writeoffs (
  ${ID},
  number text unique,
  warehouse_id uuid references warehouses (id) on delete set null,
  reason_code text not null default 'other',
  reason text,
  items jsonb not null default '[]',
  total_cost numeric(14, 2) not null default 0,
  created_by_id uuid references users (id) on delete set null,
  ${TS}
);
create index if not exists writeoffs_created_idx on writeoffs (created_at desc);

create table if not exists inventory_counts (
  ${ID},
  number text unique,
  warehouse_id uuid references warehouses (id) on delete set null,
  status text not null default 'draft',
  items jsonb not null default '[]',
  note text,
  created_by_id uuid references users (id) on delete set null,
  completed_by_id uuid references users (id) on delete set null,
  completed_at timestamptz,
  summary jsonb,
  ${TS}
);
create index if not exists inventory_created_idx on inventory_counts (created_at desc);

-- Registrul de stoc: fiecare miscare, cu soldul dupa operatiune
create table if not exists stock_movements (
  ${ID},
  seq bigserial,
  product_id uuid references products (id) on delete cascade,
  product_name text,
  sku text,
  warehouse_id uuid references warehouses (id) on delete cascade,
  quantity numeric(14, 4) not null,
  balance_after numeric(14, 4),
  type text not null,
  unit_cost numeric(14, 4),
  ref_type text,
  ref_id uuid,
  ref_number text,
  user_id uuid references users (id) on delete set null,
  user_name text,
  note text,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists movements_product_idx on stock_movements (product_id, created_at desc);
create index if not exists movements_warehouse_idx on stock_movements (warehouse_id, created_at desc);
create index if not exists movements_created_idx on stock_movements (created_at, seq);
create index if not exists movements_ref_idx on stock_movements (ref_id);

create table if not exists tasks (
  ${ID},
  title text not null,
  description text,
  assigned_to_id uuid references users (id) on delete cascade,
  created_by_id uuid references users (id) on delete set null,
  due_date timestamptz,
  priority text not null default 'normal',
  status text not null default 'todo',
  customer_id uuid references customers (id) on delete set null,
  order_id uuid references orders (id) on delete set null,
  completed_at timestamptz,
  ${TS}
);
create index if not exists tasks_assignee_idx on tasks (assigned_to_id, status);
create index if not exists tasks_customer_idx on tasks (customer_id);

create table if not exists settings (
  id integer primary key default 1 check (id = 1),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  ${ID},
  recipient_id uuid not null references users (id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text,
  link text,
  order_id uuid references orders (id) on delete set null,
  meta jsonb,
  read boolean not null default false,
  ${TS}
);
create index if not exists notifications_recipient_idx on notifications (recipient_id, read, created_at desc);

create table if not exists audit_logs (
  ${ID},
  action text not null,
  category text,
  entity_id uuid,
  entity_name text,
  order_id uuid,
  order_number text,
  user_id uuid,
  user_name text,
  user_role text,
  details text,
  created_at timestamptz not null default now()
);
create index if not exists audit_category_idx on audit_logs (category, created_at desc);
create index if not exists audit_order_idx on audit_logs (order_id, created_at desc);
create index if not exists audit_created_idx on audit_logs (created_at desc);

create table if not exists counters (key text primary key, seq integer not null default 0);

create table if not exists api_keys (
  ${ID},
  name text not null,
  kind text not null default 'generic',
  prefix text not null,
  hash text not null unique,
  scopes text[] not null default '{read,write}',
  active boolean not null default true,
  last_used_at timestamptz,
  last_used_ip text,
  usage_count integer not null default 0,
  created_by_id uuid references users (id) on delete set null,
  ${TS}
);

create table if not exists webhooks (
  ${ID},
  name text not null,
  url text not null,
  events text[] not null default '{*}',
  secret text not null,
  active boolean not null default true,
  last_status text,
  last_http_status integer,
  last_error text,
  last_delivery_at timestamptz,
  failures integer not null default 0,
  created_by_id uuid references users (id) on delete set null,
  ${TS}
);

create table if not exists webhook_deliveries (
  ${ID},
  webhook_id uuid references webhooks (id) on delete cascade,
  event text,
  delivery_id text,
  status text,
  http_status integer,
  error text,
  duration_ms integer,
  attempts integer not null default 1,
  payload_preview text,
  created_at timestamptz not null default now()
);
create index if not exists deliveries_webhook_idx on webhook_deliveries (webhook_id, created_at desc);

create table if not exists integration_logs (
  ${ID},
  source text,
  direction text,
  action text,
  status text not null default 'ok',
  message text,
  count integer,
  ref text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists integration_logs_idx on integration_logs (source, created_at desc);

-- updated_at automat
create or replace function set_updated_at() returns trigger language plpgsql as $f$
begin
  new.updated_at = now();
  return new;
end
$f$;

do $do$
declare t text;
begin
  foreach t in array array['users','warehouses','categories','products','customers','orders','suppliers','arrivals',
    'transfers','writeoffs','inventory_counts','tasks','notifications','api_keys','webhooks','settings'] loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
end
$do$;

-- Securitate Supabase: tabelele NU sunt accesibile prin API-ul public (anon / authenticated).
-- Aplicatia se conecteaza direct la Postgres (rolul proprietar), deci RLS nu o afecteaza.
do $do$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
    execute 'revoke all on all functions in schema public from anon, authenticated';
  end if;
end
$do$;

insert into settings (id, data) values (1, '{}') on conflict (id) do nothing;
`;
