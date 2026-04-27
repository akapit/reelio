alter table profiles
  add column if not exists language text not null default 'en'
  check (language in ('en', 'he'));
