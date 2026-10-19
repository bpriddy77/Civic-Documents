-- =====================================================================
-- 1300 - Site search
--
-- A search box for the city's whole public website: the pages built in
-- GoHighLevel, the PDFs posted on them, and the agendas, minutes and
-- other records this system already holds.
--
-- Two feeders write into one index:
--
--   direct  - meetings and their documents, written from their own
--             tables the moment they are published. No crawl latency:
--             a document is findable the second the clerk posts it.
--
--   crawled - everything else on the city's site, discovered nightly
--             from sitemap.xml.
--
-- The direct feeder is the reason this is worth building rather than
-- pointing residents at Google. Google will not have indexed an agenda
-- posted an hour ago, and for a small city's site it may not have
-- indexed anything at all.
--
-- Search itself is PostgreSQL's own full-text search. For a city site
-- -- tens of pages, hundreds of documents -- a GIN index over a
-- tsvector answers in single-digit milliseconds, and it is one fewer
-- service to run, pay for, and have go down.
-- =====================================================================

do $$ begin
  create type public.search_source as enum ('page', 'pdf', 'meeting', 'document');
exception when duplicate_object then null;
end $$;

create table if not exists public.search_documents (
  id              uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities (id) on delete cascade,

  -- Where a resident lands when they click the result. Unique per
  -- municipality: one row per address, updated in place, so repeated
  -- crawls never accumulate duplicates of the same page.
  url             text not null check (length(url) between 1 and 2048),

  title           text not null check (length(btrim(title)) between 1 and 500),
  source          public.search_source not null,
  body            text not null default '',

  -- What produced this row, so the direct feeder can find and update
  -- its own entries without touching anything the crawler owns.
  entity_type     text,
  entity_id       uuid,

  -- Skips re-indexing a page whose content has not changed, which keeps
  -- a nightly crawl cheap and leaves indexed_at meaningful.
  content_hash    text,

  -- An image-only PDF extracts to nothing. It is indexed as an empty
  -- body so the title is still findable, and flagged so the admin can
  -- see that the document is unreadable -- to this search, and equally
  -- to a resident using a screen reader.
  text_layer      boolean not null default true,

  indexed_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),

  -- A page removed from the site stops appearing in results but is kept
  -- for one more crawl, so a sitemap that is briefly wrong does not
  -- silently empty the index.
  removed_at      timestamptz,

  search          tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (municipality_id, url)
);

create index if not exists search_documents_fts_idx
  on public.search_documents using gin (search);

create index if not exists search_documents_tenant_idx
  on public.search_documents (municipality_id, removed_at);

create index if not exists search_documents_entity_idx
  on public.search_documents (municipality_id, entity_type, entity_id);

comment on table public.search_documents is
  'Search index for a municipality''s public website. Public content only: nothing here is written for an unpublished meeting or a document that is not live.';

-- ---------------------------------------------------------------------
-- Crawl runs
--
-- Kept so the admin can answer "is search up to date?" without anyone
-- reading a log file, and so a crawl that quietly started failing three
-- weeks ago is visible rather than inferred from stale results.
-- ---------------------------------------------------------------------
create table if not exists public.search_crawls (
  id              uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities (id) on delete cascade,

  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                  check (status in ('running', 'succeeded', 'failed')),

  urls_found      integer not null default 0,
  pages_indexed   integer not null default 0,
  pdfs_indexed    integer not null default 0,
  unchanged       integer not null default 0,
  removed         integer not null default 0,

  -- Pages that could not be fetched, and PDFs with no text layer. These
  -- are the actionable output of a crawl, not an error log.
  warnings        jsonb not null default '[]'::jsonb,
  error_message   text
);

create index if not exists search_crawls_tenant_idx
  on public.search_crawls (municipality_id, started_at desc);

-- ---------------------------------------------------------------------
-- Access
--
-- Reading is public, because everything indexed is already a public
-- page on a public website. It is gated per municipality anyway: a city
-- that has not enabled the feature returns nothing, so the index cannot
-- be queried before the city has agreed to publish it.
--
-- Writing is service-role only. The crawler runs as a scheduled job
-- with no user session, and nothing a browser can reach may write to
-- the index -- an index residents trust is one no visitor can edit.
-- ---------------------------------------------------------------------
alter table public.search_documents enable row level security;
alter table public.search_crawls    enable row level security;

grant select on public.search_documents to anon, authenticated;
grant select on public.search_crawls to authenticated;

drop policy if exists search_documents_public_read on public.search_documents;
create policy search_documents_public_read on public.search_documents
  for select to anon
  using (
    removed_at is null
    and exists (
      select 1 from public.municipalities m
       where m.id = search_documents.municipality_id
         and m.active
         and coalesce((m.configuration ->> 'search_enabled')::boolean, false)
    )
  );

drop policy if exists search_documents_member_read on public.search_documents;
create policy search_documents_member_read on public.search_documents
  for select to authenticated
  using (public.is_super_admin() or municipality_id = public.current_municipality_id());

drop policy if exists search_crawls_member_read on public.search_crawls;
create policy search_crawls_member_read on public.search_crawls
  for select to authenticated
  using (public.is_super_admin() or municipality_id = public.current_municipality_id());

-- ---------------------------------------------------------------------
-- The query
--
-- A function rather than a view so the ranking, the snippet and the
-- gate live in one place the API cannot accidentally diverge from.
--
-- `websearch_to_tsquery` is deliberate: it understands what a resident
-- actually types -- quoted phrases, OR, a leading minus -- and, unlike
-- `to_tsquery`, it cannot be made to raise a syntax error by a stray
-- apostrophe or bracket. Search must never show an error page.
-- ---------------------------------------------------------------------
create or replace function public.search_site(
  p_municipality_slug text,
  p_query             text,
  p_limit             integer default 20,
  p_offset            integer default 0
) returns table (
  url      text,
  title    text,
  source   public.search_source,
  snippet  text,
  rank     real,
  total    bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tenant as (
    select m.id
      from public.municipalities m
     where m.slug = p_municipality_slug
       and m.active
       and coalesce((m.configuration ->> 'search_enabled')::boolean, false)
  ),
  q as (select websearch_to_tsquery('english', coalesce(p_query, '')) as tsq),
  hits as (
    select d.url, d.title, d.source, d.body,
           -- Textual relevance, with a light tiebreaker by type.
           --
           -- Where two results are about equally relevant, the readable
           -- page is marginally more useful than the PDF: someone asking
           -- what the water deposit is wants the page that says $150
           -- before the ordinance authorising the charge.
           --
           -- Deliberately light. A strong textual match on a document
           -- still beats a weak one on a page, which is correct --
           -- searching an ordinance by name must return the ordinance.
           -- This only settles near-ties, it does not reorder results.
           ts_rank(d.search, q.tsq) * case d.source
             when 'page'     then 1.00
             when 'meeting'  then 0.95
             when 'document' then 0.90
             when 'pdf'      then 0.85
           end as rank
      from public.search_documents d
      join tenant t on t.id = d.municipality_id
     cross join q
     where d.removed_at is null
       and q.tsq is not null
       and d.search @@ q.tsq
  )
  select h.url, h.title, h.source,
         -- Highlights are marked with sentinels, not with <mark> tags.
         --
         -- The snippet is built from text crawled off a web page, and
         -- the widget has to render the highlight as markup. If the
         -- markers were real tags, the widget would have to inject the
         -- snippet as HTML -- and any page whose visible text contains
         -- "<script>" would then run it in a resident's browser on the
         -- city's own domain.
         --
         -- With sentinels the widget escapes the whole snippet first
         -- and swaps these two tokens for <mark> afterwards, so nothing
         -- that came off a page can ever become markup.
         ts_headline('english', h.body, q.tsq,
           'StartSel=[[hl]], StopSel=[[/hl]], MaxWords=30, MinWords=12, MaxFragments=1, FragmentDelimiter= … ')
           as snippet,
         h.rank,
         count(*) over () as total
    from hits h
   cross join q
   order by h.rank desc, h.title
   limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.search_site(text, text, integer, integer)
  to anon, authenticated;

insert into public.schema_version (version, notes)
values ('1.11.0', 'Site search: crawled pages and PDFs plus directly indexed records.')
on conflict (version) do update
  set applied_at = now(), notes = excluded.notes;
