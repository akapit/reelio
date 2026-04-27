alter table profiles
  add column if not exists headline text,
  add column if not exists tagline text,
  add column if not exists watermark_url text,
  add column if not exists instagram_handle text,
  add column if not exists tiktok_handle text,
  add column if not exists youtube_handle text;
