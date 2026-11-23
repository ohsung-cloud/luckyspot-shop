-- ============================================================================
-- 매장 · 점주 어드민 · 포털 스냅샷 스키마 (2026-11-23)
--
-- 목적
--  1) 매장이 생길 때마다 `/admin/stores`에서 등록하고, 점주 전용 `/store/[코드]`
--     어드민과 접근 코드를 발급한다. 그 원본을 영구 저장한다.
--  2) POS/포털 수집 원본 스냅샷을 그대로 보관해 교차예측의 증빙으로 남긴다.
--
-- 안전성
--  * 전부 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — 두 번 실행해도 같다(멱등).
--  * DELETE · TRUNCATE · DROP 문장은 없다. 기존 `stores` 테이블이 있으면
--    필요한 컬럼만 더한다(기존 발주 폼의 컬럼을 건드리지 않는다).
--  * RLS를 켜고 정책을 만들지 않는다 → 서버(service_role)만 접근한다.
--  * 비밀번호 컬럼은 만들지 않는다. 점주 접근 코드는 SHA-256 해시만 저장한다.
--    포털 비밀번호는 GitHub Actions Secrets에만 둔다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 공통: updated_at 자동 갱신 (특허 1호 마이그레이션과 같은 함수 이름)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- 1) stores — 매장 기본정보 + 다중사업자 설정 + 경보 기준일
-- ----------------------------------------------------------------------------
create table if not exists public.stores (
  store_code text primary key,
  label text not null,
  short_label text,
  region text,
  address text,
  owner_name text,
  phone text,
  store_type text not null default '미지정',
  status text not null default 'active',
  is_active boolean not null default true,
  coffee_entity_name text,
  coffee_business_no text,
  print_entity_name text,
  print_business_no text,
  loyalsuns_store_id text,
  escalprint_branch text,
  bean_alert_days integer not null default 4,
  toner_alert_days integer not null default 5,
  paper_alert_days integer not null default 4,
  admin_code_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 발주 폼이 쓰던 stores 테이블이 있어도 앱이 필요로 하는 컬럼만 더한다.
alter table public.stores add column if not exists short_label text;
alter table public.stores add column if not exists store_type text not null default '미지정';
alter table public.stores add column if not exists status text not null default 'active';
alter table public.stores add column if not exists coffee_entity_name text;
alter table public.stores add column if not exists coffee_business_no text;
alter table public.stores add column if not exists print_entity_name text;
alter table public.stores add column if not exists print_business_no text;
alter table public.stores add column if not exists loyalsuns_store_id text;
alter table public.stores add column if not exists escalprint_branch text;
alter table public.stores add column if not exists bean_alert_days integer not null default 4;
alter table public.stores add column if not exists toner_alert_days integer not null default 5;
alter table public.stores add column if not exists paper_alert_days integer not null default 4;
alter table public.stores add column if not exists admin_code_set_at timestamptz;

alter table public.stores enable row level security;

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

-- 기준 지점 2곳(이미 수집·리포트가 도는 매장). 운영 중 값이 있으면 덮어쓰지 않는다.
insert into public.stores (store_code, label, short_label, region, store_type, status, is_active)
values
  ('STORE_GNM', '럭키스팟 강남구청역점', '강남구청역점', '서울 강남', '1평 샵인샵', 'active', true),
  ('STORE_HYJ', '럭키스팟 한예종점', '한예종점', '서울 성북', '미지정', 'active', true)
on conflict (store_code) do nothing;


-- ----------------------------------------------------------------------------
-- 2) store_admins — 점주 어드민 접근 코드(해시)와 초대 상태
--
--   invite_code_hash : 접근 코드 원문은 저장하지 않는다(SHA-256).
--   role             : owner(점주) · manager(추후) — 한 매장 한 역할에 하나만.
-- ----------------------------------------------------------------------------
create table if not exists public.store_admins (
  id uuid primary key default gen_random_uuid(),
  store_code text not null references public.stores(store_code) on delete cascade,
  role text not null default 'owner',
  name text,
  invite_code_hash text not null,
  status text not null default 'active',
  invited_at timestamptz not null default now(),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_code, role)
);

alter table public.store_admins enable row level security;

drop trigger if exists store_admins_set_updated_at on public.store_admins;
create trigger store_admins_set_updated_at
before update on public.store_admins
for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 3) pos_snapshots — 포털 수집 원본 (특허 증빙용)
--
--   payload : 수집기가 읽은 원본 JSON 그대로(에스칼프린트 장비·매출 / 로얄선즈 머신·매출)
--   derived : 앱이 해석한 파생값(토너 g, 용지 매, 하루 출력 매수 등)
--   같은 (지점·출처·수집시각)은 한 건만 — 재수집해도 중복이 쌓이지 않는다.
-- ----------------------------------------------------------------------------
create table if not exists public.pos_snapshots (
  id bigserial primary key,
  store_code text not null,
  source text not null,
  captured_at timestamptz not null,
  payload jsonb not null,
  derived jsonb,
  created_at timestamptz not null default now(),
  unique (store_code, source, captured_at)
);

create index if not exists pos_snapshots_store_captured_idx
  on public.pos_snapshots (store_code, captured_at desc);

alter table public.pos_snapshots enable row level security;


-- ----------------------------------------------------------------------------
-- 확인 쿼리 — 표 3개 · rls = true 가 보이면 끝
-- ----------------------------------------------------------------------------
select
  table_name,
  (select relrowsecurity from pg_class where oid = format('public.%I', table_name)::regclass) as rls
from information_schema.tables
where table_schema = 'public'
  and table_name in ('stores', 'store_admins', 'pos_snapshots')
order by table_name;
