-- ============================================================================
-- 점주 통합 포털(/owner) 로그인 DB + 지점 실제 월세 (2026-11-25)
--
-- 이 마이그레이션은 **새 로그인 표를 만들지 않는다.**
--   점주 로그인 계정 = 기존 `stores` 행 + `pin_hash`(4자리 PIN 해시) 이다.
--   (`20261123233000_store_registry_and_snapshots.sql` + `20261124000000_store_ops_upgrade.sql`)
--   그래야 본사(/admin/stores)·점주 어드민(/store/[code])·발주·매출이 모두 같은 지점을 본다.
--
-- 하는 일
--   1) PIN·로그인(ID·비밀번호) 컬럼이 없던 예전 DB에도 컬럼을 더한다(멱등).
--   2) 6개 지점 행이 없으면 만든다 — /owner 로그인이 DB에 남으려면 행이 있어야 한다.
--   3) 대표가 확인한 실제 월세를 monthly_fixed_cost 에 반영한다(관리비 등 다른 키는 유지).
--   4) 점주 포털 아이디와 초기 비밀번호(123456) 해시를 넣는다(이미 값이 있는 행은 두 손대지 않는다).
--
-- 안전성
--   · 전부 IF NOT EXISTS / ON CONFLICT — 두 번 실행해도 같다.
--   · DELETE · TRUNCATE 없음. 기존 행의 label·status·pin_hash 는 건드리지 않는다.
--   · PIN 원문은 어디에도 저장하지 않는다(앱이 HMAC 해시만 쓴다).
--   · Supabase 키가 없는 환경에서는 앱이 인메모리 레지스트리 + seed-pins.ts 로 그대로 동작한다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PIN·로그인 컬럼(이미 있으면 그대로)
-- ----------------------------------------------------------------------------
alter table public.stores add column if not exists pin_hash text;
alter table public.stores add column if not exists pin_set_at timestamptz;
alter table public.stores add column if not exists pin_enabled boolean not null default false;
alter table public.stores add column if not exists monthly_fixed_cost jsonb not null default '{}'::jsonb;

-- 점주 포털(/owner) 아이디 로그인 — 2026-11-25 대표 확정
--   아이디는 네이버 아이디와 맞추고, 비밀번호 초기값은 123456(해시만 저장).
alter table public.stores add column if not exists login_id text;
alter table public.stores add column if not exists password_hash text;
alter table public.stores add column if not exists password_set_at timestamptz;

-- 아이디는 소문자로 하나만 — 같은 아이디로 두 지점이 열리지 않게 유니크 인덱스(빈 값 제외).
create unique index if not exists stores_login_id_key
  on public.stores (lower(login_id))
  where login_id is not null and login_id <> '';

-- ----------------------------------------------------------------------------
-- 2) 6개 지점 행 + 실제 월세
--    · 없으면 만든다(이름·지역만).
--    · 있으면 monthly_fixed_cost 의 임대료만 새 값으로 덮고 나머지 키는 유지한다.
-- ----------------------------------------------------------------------------
with seeds(store_code, label, short_label, region, fixed) as (
  values
    ('STORE_GNM', '럭키스팟 강남구청역점', '강남구청역점', '서울 강남',
     '{"rent":1700000,"maintenance":120000,"internet":33000,"solution":55000}'::jsonb),
    ('STORE_HYJ', '럭키스팟 한예종점', '한예종점', '서울 성북',
     '{"rent":1700000,"maintenance":200000,"internet":33000,"solution":55000}'::jsonb),
    ('STORE_PTK', '럭키스팟 평택점', '평택점', '경기 평택',
     '{"rent":300000,"maintenance":0,"internet":0,"solution":0}'::jsonb),
    ('STORE_CJ',  '럭키스팟 충주점', '충주점', '충북 충주',
     '{"rent":300000,"maintenance":0,"internet":0,"solution":0}'::jsonb),
    ('STORE_SYU', '럭키스팟 선유로점', '선유로점', '서울 영등포',
     '{"rent":700000,"maintenance":0,"internet":0,"solution":0}'::jsonb),
    ('STORE_YDP', '럭키스팟 영등포시장역점', '영등포시장역점', '서울 영등포',
     '{"rent":800000,"maintenance":0,"internet":0,"solution":0}'::jsonb)
)
insert into public.stores (store_code, label, short_label, region, store_type, status, monthly_fixed_cost)
select store_code, label, short_label, region, '미지정', 'active', fixed from seeds
on conflict (store_code) do update
   set monthly_fixed_cost = coalesce(public.stores.monthly_fixed_cost, '{}'::jsonb) || excluded.monthly_fixed_cost,
       updated_at = now();

-- ----------------------------------------------------------------------------
-- 3) 점주 포털 로그인 아이디·초기 비밀번호(123456) 해시
--    해시 = HMAC-SHA256(key = 'luckyspot-store-login|' || store_code, message = '123456')
--    앱의 login-id.ts 와 같은 값이다. 원문 비밀번호는 어디에도 저장하지 않는다.
--    네이버 계정의 실제 비밀번호도 아니다(아이디만 맞춘 것).
-- ----------------------------------------------------------------------------
update public.stores set login_id = 'luckyspot-gangnam',
       password_hash = 'dfdbf68e7f3f605ac7e6fe3d0ddeba6f8dbbda48abf84ce528e19c8255a45656',
       password_set_at = coalesce(password_set_at, now()), updated_at = now()
 where store_code = 'STORE_GNM' and login_id is null;

update public.stores set login_id = 'luckyspot-hyj',
       password_hash = 'cfc236a29a9006f5f3ccaf90bf73c7fa318b4e786dddcbf13c4e877bcb29eb77',
       password_set_at = coalesce(password_set_at, now()), updated_at = now()
 where store_code = 'STORE_HYJ' and login_id is null;

update public.stores set login_id = 'luckyspot5',
       password_hash = '2e2d8b45e0c7621644a431a02649a137031f1344354cb21c11fe25e1e420f3d3',
       password_set_at = coalesce(password_set_at, now()), updated_at = now()
 where store_code = 'STORE_PTK' and login_id is null;

update public.stores set login_id = 'luckyspot98',
       password_hash = '63c1e343cd0e6cf7b3cfdf05470b12c1b5db8b27077c15fbe2630d20f58e4bdf',
       password_set_at = coalesce(password_set_at, now()), updated_at = now()
 where store_code = 'STORE_CJ' and login_id is null;

update public.stores set login_id = 'luckyspot-seonyu',
       password_hash = '26a6a602bdbe27d442a41af6f1cc8d97dd9b32235a18d07d2bcc4fd75aeb95ab',
       password_set_at = coalesce(password_set_at, now()), updated_at = now()
 where store_code = 'STORE_SYU' and login_id is null;

update public.stores set login_id = 'luckyspot-ydp',
       password_hash = '427433454b3aba5af964a5628ee0fe840d8c5372e931a6790fbbb68c46327388',
       password_set_at = coalesce(password_set_at, now()), updated_at = now()
 where store_code = 'STORE_YDP' and login_id is null;

-- ----------------------------------------------------------------------------
-- 4) 확인 — 6행과 임대료·아이디가 보이면 끝
-- ----------------------------------------------------------------------------
select store_code, label, status, login_id,
       coalesce((monthly_fixed_cost ->> 'rent')::int, 0) as rent,
       password_hash is not null as has_password,
       pin_hash is not null as has_pin,
       pin_enabled
  from public.stores
 where store_code in ('STORE_GNM', 'STORE_HYJ', 'STORE_PTK', 'STORE_CJ', 'STORE_SYU', 'STORE_YDP')
 order by store_code;
