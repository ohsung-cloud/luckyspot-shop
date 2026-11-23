-- ============================================================================
-- 점주 OS 4대 고도화 — 스키마 (2026-11-24)
--
--  1) 프린트 복합기 멀티벤더      : stores.print_vendor
--  2) 점주 실마진(예상 순수익)    : stores.monthly_fixed_cost (임대료·관리비·인터넷·솔루션료)
--  3) 교체완료 학습(피드백 루프)  : stores.calibration(jsonb) + calibration_logs(이력)
--  4) 점주 PWA 4자리 PIN          : stores.pin_hash · pin_set_at · pin_enabled
--
-- 안전성
--  * 전부 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — 두 번 실행해도 같다(멱등).
--  * DROP TABLE · DELETE · TRUNCATE 없음. 기존 행은 건드리지 않고, 비어 있는 값만 채운다.
--  * RLS 를 켜고 정책을 만들지 않는다 → 서버(service_role)만 접근.
--  * PIN 원문은 저장하지 않는다. `pin_hash` 는 HMAC-SHA256(앱이 계산)이고,
--    시드 지점은 데모 PIN 0000 의 해시만 넣는다(화면 안내와 같은 값).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) stores 확장 컬럼
-- ----------------------------------------------------------------------------
alter table public.stores add column if not exists print_vendor text not null default 'escalprint';
alter table public.stores add column if not exists monthly_fixed_cost jsonb not null default '{}'::jsonb;
alter table public.stores add column if not exists calibration jsonb not null default '{}'::jsonb;
alter table public.stores add column if not exists pin_hash text;
alter table public.stores add column if not exists pin_set_at timestamptz;
alter table public.stores add column if not exists pin_enabled boolean not null default false;

-- 벤더 값은 셋 중 하나만 (확장 전 데이터는 에스칼프린트로 본다)
alter table public.stores drop constraint if exists stores_print_vendor_check;
alter table public.stores
  add constraint stores_print_vendor_check
  check (print_vendor in ('escalprint', 'yupisoft', 'generic_webhook'));

-- ----------------------------------------------------------------------------
-- 2) 시드 지점 기본값 — 비어 있을 때만 채운다(운영 중 고친 값은 유지)
-- ----------------------------------------------------------------------------
update public.stores
   set monthly_fixed_cost = '{"rent":450000,"maintenance":120000,"internet":33000,"solution":55000}'::jsonb
 where store_code = 'STORE_GNM'
   and (monthly_fixed_cost is null or monthly_fixed_cost = '{}'::jsonb);

update public.stores
   set monthly_fixed_cost = '{"rent":1200000,"maintenance":200000,"internet":33000,"solution":55000}'::jsonb
 where store_code = 'STORE_HYJ'
   and (monthly_fixed_cost is null or monthly_fixed_cost = '{}'::jsonb);

-- 데모 PIN(0000) 해시 — 앱의 화면 안내와 같은 값. 본사에서 재발급하면 덮어써진다.
update public.stores
   set pin_hash = 'a496ce652cf88d82ba5585fe7f1a60695599a2558e14fc7b3eedbd7de9ae5e31',
       pin_set_at = coalesce(pin_set_at, now()),
       pin_enabled = false
 where store_code = 'STORE_GNM' and pin_hash is null;

update public.stores
   set pin_hash = 'cc0a66e60a70bde7af1406b4d8cbf2977ccbbe7bc42784b97efd254af33d0c2e',
       pin_set_at = coalesce(pin_set_at, now()),
       pin_enabled = false
 where store_code = 'STORE_HYJ' and pin_hash is null;

-- ----------------------------------------------------------------------------
-- 3) calibration_logs — 교체완료 1회 = 1행 (학습 근거·감사용)
--
--   factor      : 이 교체로 다시 학습된 계수(0.85~1.25)
--   actual_days : 지난 교체 → 이번 교체 실제 일수
--   expected_days: 그 사이 예측이 말하던 '가득→바닥' 일수
-- ----------------------------------------------------------------------------
create table if not exists public.calibration_logs (
  id bigserial primary key,
  store_code text not null,
  sku text not null,
  replaced_at timestamptz not null,
  previous_replaced_at timestamptz,
  actual_days numeric(6, 2),
  expected_days numeric(6, 2),
  factor numeric(5, 3) not null default 1,
  samples integer not null default 0,
  full_capacity numeric(12, 1),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists calibration_logs_store_idx
  on public.calibration_logs (store_code, replaced_at desc);

create index if not exists calibration_logs_sku_idx
  on public.calibration_logs (store_code, sku, replaced_at desc);

alter table public.calibration_logs enable row level security;

-- ----------------------------------------------------------------------------
-- 4) 확인 쿼리 — 컬럼 6개 · 표 1개 · rls=true 가 보이면 끝
-- ----------------------------------------------------------------------------
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'stores'
   and column_name in ('print_vendor', 'monthly_fixed_cost', 'calibration', 'pin_hash', 'pin_set_at', 'pin_enabled')
 order by column_name;

select
  table_name,
  (select relrowsecurity from pg_class where oid = format('public.%I', table_name)::regclass) as rls
from information_schema.tables
where table_schema = 'public'
  and table_name = 'calibration_logs';
