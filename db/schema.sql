-- ============================================================
-- RepuestosAlToque — Esquema de base de datos (Postgres / Supabase)
-- Derivado de las decisiones de producto. Ver docs/RepuestosAlToque-Modelo-de-Datos.md
-- Reglas: anonimato bilateral · comisión 5% que paga el cliente · split Mercado Pago
--         · flete tercerizado (pata aparte) · onboarding manual desde backoffice.
-- ============================================================

-- ---------- Tipos ----------
create type user_role       as enum ('admin','mechanic','seller','courier');
create type user_status     as enum ('pending','active','suspended');
create type iva_condition   as enum ('responsable_inscripto','monotributo','exento','consumidor_final');
create type urgency         as enum ('ahora','hoy','manana');
create type request_status  as enum ('open','closed','quoted','paid','shipped','delivered','cancelled','expired');
create type quote_status    as enum ('sent','selected','rejected');
create type order_status    as enum ('paid','ready','shipped','delivered','refunded');
create type shipment_status as enum ('pending','picked_up','on_route','delivered');
create type package_size    as enum ('moto','auto','utilitario');
create type part_condition  as enum ('nuevo','usado','reacondicionado');

-- ---------- Usuarios (base) ----------
create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  role             user_role   not null,
  email            text        not null,
  full_name        text,
  phone            text,
  whatsapp         text,
  status           user_status not null default 'pending',
  -- reputación (mecánicos y vendedores)
  rating_avg       numeric(2,1) default 0,
  ratings_count    int          default 0,
  points           int          default 0,
  completed_ops    int          default 0,
  -- gestión / backoffice
  created_at       timestamptz  default now(),
  created_by       uuid references profiles(id),
  notes            text,                       -- interno (solo admins)
  terms_accepted_at timestamptz,
  last_login_at    timestamptz,                -- último ingreso (stats del admin)
  last_seen_at     timestamptz                 -- última actividad ("en línea" en el admin)
);

-- ---------- Zonas de cobertura ----------
-- Ciudades/áreas (bounding box) donde se dan de alta usuarios, editables desde el backoffice.
-- delivery_enabled=false => los pedidos de mecánicos de esa zona se entregan por coordinación
-- interna (sin flete cobrado por la app, sin repartidores; el admin registra los movimientos).
-- stores_enabled=false  => en esa zona solo se dan de alta mecánicos (ej: El Bolsón).
create table zones (
  id               serial primary key,
  slug             text unique not null,          -- 'bariloche' | 'el-bolson' | ...
  name             text not null,
  lat_min double precision not null, lat_max double precision not null,
  lng_min double precision not null, lng_max double precision not null,
  active           boolean default true,
  delivery_enabled boolean default true,
  stores_enabled   boolean default false
);

-- ---------- Mecánico ----------
create table mechanics (
  profile_id  uuid primary key references profiles(id) on delete cascade,
  workshop_name text,
  kind        text default 'taller',           -- 'taller' | 'particular'
  barrio      text,
  address     text,
  lat double precision, lng double precision,
  zone_id     int references zones(id),        -- zona de la dirección (derivada al alta)
  cuit        text
);

-- ---------- Vendedor / casa de repuestos ----------
create table stores (
  profile_id     uuid primary key references profiles(id) on delete cascade,
  trade_name     text not null,                 -- nombre del local
  legal_name     text,                          -- razón social
  cuit           text unique,
  iva_condition  iva_condition,
  owner_name     text,                          -- titular / responsable
  address        text,
  barrio         text,
  lat double precision, lng double precision,
  zone_id        int references zones(id),      -- zona de la dirección (derivada al alta)
  hours          jsonb,                         -- días y horarios de atención
  contact_person text,                          -- quién opera la app
  part_condition part_condition default 'nuevo',
  -- cobros (split Mercado Pago)
  mp_user_id     text,                          -- cuenta MP vinculada (marketplace)
  mp_linked      boolean default false,
  cbu            text,
  mp_alias       text,
  -- facturación
  invoice_type   text,                          -- A / B / C (deriva de IVA)
  afip_pos       text,                          -- punto de venta
  -- verificación / branding
  logo_url            text,
  storefront_photo_url text
);

-- ---------- Catálogos ----------
create table categories (
  id   serial primary key,
  slug text unique,
  name text not null,
  icon text
);
create table store_categories (
  store_id    uuid references stores(profile_id) on delete cascade,
  category_id int  references categories(id) on delete cascade,
  primary key (store_id, category_id)
);

create table vehicle_brands ( id serial primary key, name text unique not null );
create table vehicle_models (
  id serial primary key,
  brand_id int references vehicle_brands(id) on delete cascade,
  name text not null,
  unique (brand_id, name)
);
create table store_brands (
  store_id uuid references stores(profile_id) on delete cascade,
  brand_id int references vehicle_brands(id) on delete cascade,
  primary key (store_id, brand_id)
);

-- ---------- Fletes tercerizados ----------
create table freight_companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  cuit          text,
  contact_name  text,
  phone         text,
  whatsapp      text,
  vehicle_types package_size[],                 -- {moto,auto,utilitario}
  coverage      jsonb,                           -- zonas que cubre
  payout_info   text,                            -- cómo se le paga el flete
  status        user_status default 'active',
  created_at    timestamptz default now()
);
create table freight_tariffs (
  id         serial primary key,
  company_id uuid references freight_companies(id) on delete cascade,
  zone       text,
  size       package_size,
  price      numeric(12,2)
);

-- ---------- Repartidores (cargados a mano; pueden pertenecer a una empresa de fletes) ----------
create table couriers (
  profile_id         uuid primary key references profiles(id) on delete cascade,
  freight_company_id uuid references freight_companies(id),
  vehicle_type       package_size,               -- moto / auto / utilitario
  plate              text,                        -- patente
  zones              jsonb,                       -- zonas que cubre
  cuit               text
);

-- ---------- Pedidos ----------
create sequence request_code_seq start 1042;
create table requests (
  id            uuid primary key default gen_random_uuid(),
  code          text unique default ('#' || nextval('request_code_seq')),  -- legible
  mechanic_id   uuid not null references profiles(id),
  brand         text,
  model         text,
  year          int,
  vin           text,
  category_id   int references categories(id),
  description   text,
  urgency       urgency not null default 'ahora',
  photo_urls    text[] default '{}',
  -- tipo de comprobante elegido por el mecánico al crear el pedido
  invoice_type        text default 'consumidor_final',  -- 'consumidor_final' | 'factura_a'
  invoice_emisor_name text,                              -- razón social comercio emisor (Factura A)
  invoice_emisor_cuit text,
  invoice_buyer_name  text,                              -- razón social solicitante (Factura A)
  invoice_buyer_cuit  text,
  status        request_status not null default 'open',
  window_seconds int default 600,               -- 10 min
  window_ends_at timestamptz,
  extra_info    text,                            -- respuesta del mecánico a "pedir info"
  created_at    timestamptz default now()
);
create index on requests (status);
create index on requests (mechanic_id);

-- ---------- Pedidos de información (vendedor -> mecánico) ----------
create table info_requests (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid references requests(id) on delete cascade,
  store_id    uuid references profiles(id),
  items       text[],                            -- preguntas predefinidas elegidas
  text        text,                              -- consulta libre
  answered    boolean default false,
  created_at  timestamptz default now()
);

-- ---------- Cotizaciones ----------
create table quotes (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references requests(id) on delete cascade,
  store_id        uuid not null references profiles(id),
  alias           text not null,                 -- visible al mecánico (anónimo)
  option_label    text,                          -- 'A','B'… (varias opciones por comercio)
  part_brand      text,
  price           numeric(12,2) not null,
  warranty        text,
  note            text,
  photo_urls      text[] default '{}'
                  check (coalesce(array_length(photo_urls,1),0) <= 3),  -- máx 3 fotos
  rating_snapshot numeric(2,1),                   -- para ordenar al cerrar la ventana
  status          quote_status not null default 'sent',
  created_at      timestamptz default now()
);
create index on quotes (request_id);
create index on quotes (store_id);

-- ---------- Ventas / órdenes ----------
create table orders (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid references requests(id),
  quote_id          uuid references quotes(id),
  mechanic_id       uuid references profiles(id),
  store_id          uuid references profiles(id),
  part_amount       numeric(12,2),
  commission_pct    numeric(4,2) default 5.0,
  commission_amount numeric(12,2),
  freight_amount    numeric(12,2),                 -- null si la entrega es por coordinación interna
  internal_freight  boolean default false,         -- zona sin delivery: entrega coordinada por la app (sin repartidor)
  total             numeric(12,2),
  payer             text default 'client',        -- 'client' (dueño del auto) | 'mechanic'
  status            order_status default 'paid',
  shipment_id       uuid,                          -- envío que la agrupa (consolidación); FK más abajo
  created_at        timestamptz default now()
);

-- ---------- Pagos (Mercado Pago) ----------
create table payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references orders(id),
  provider    text default 'mercadopago',
  mp_payment_id text,
  status      text,
  amount      numeric(12,2),
  split       jsonb,                              -- {seller, commission, freight}
  raw         jsonb,                              -- payload del webhook
  created_at  timestamptz default now()
);

-- ---------- Envíos ----------
-- Un envío puede CONSOLIDAR varias órdenes (pedidos) del mismo mecánico, retirando
-- de varios puntos de venta y entregando en un único destino (el taller).
-- La relación es 1 envío → N órdenes (ver orders.shipment_id).
create table shipments (
  id                 uuid primary key default gen_random_uuid(),
  mechanic_id        uuid references profiles(id),         -- destino (taller)
  freight_company_id uuid references freight_companies(id),
  package_size       package_size,
  status             shipment_status default 'pending',
  picked_up_at       timestamptz,
  delivered_at       timestamptz,
  created_at         timestamptz default now()
);
-- FK diferida: una orden pertenece (opcionalmente) a un envío consolidado.
alter table orders
  add constraint orders_shipment_fk foreign key (shipment_id) references shipments(id);

-- ---------- Calificaciones ----------
create table ratings (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references orders(id),
  from_id    uuid references profiles(id),
  to_id      uuid references profiles(id),
  stars      int check (stars between 1 and 5),
  comment    text,
  created_at timestamptz default now()
);

-- ---------- Publicidad ----------
create table ads (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid references profiles(id),
  brand      text,
  discount   text,
  image_url  text,
  active     boolean default true,
  paid_until date,
  created_at timestamptz default now()
);

-- ---------- Auditoría (4 admins) ----------
create table admin_audit (
  id         bigserial primary key,
  admin_id   uuid references profiles(id),
  action     text,
  entity     text,
  entity_id  text,
  payload    jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- Anonimato: vista pública de cotizaciones (lo único que ve el mecánico
-- antes de pagar). NO expone store_id ni datos de contacto del vendedor.
-- ============================================================
create view quotes_public as
  select id, request_id, alias, option_label, part_brand, price, warranty,
         note, photo_urls, rating_snapshot, status, created_at
  from quotes;

-- ============================================================
-- RLS (Row Level Security) — habilitado en modo "denegar todo" vía
-- db/rls.sql (la app no usa la Data API de Supabase; todo va por Prisma).
-- Re-ejecutar db/rls.sql después de crear tablas nuevas.
-- Lineamientos si algún día el browser consulta datos directo:
--   profiles:   cada uno ve/edita su fila; admins ven todo.
--   requests:   el mecánico ve los suyos; los vendedores ven los 'open'
--               (sin datos de contacto del mecánico, solo barrio).
--   quotes:     el vendedor ve/gestiona las suyas; el mecánico accede a la
--               identidad real del vendedor SOLO si existe una order pagada.
--   orders/payments: dueños (mecánico/vendedor) + admins.
--   admin_*:    solo role = 'admin'.
-- ============================================================
-- alter table profiles enable row level security; (… políticas …)
