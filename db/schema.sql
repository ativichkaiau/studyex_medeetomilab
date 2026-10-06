-- ============================================================
-- studyex_medeetomilab — future backend path (graph-over-relational).
-- v1 ships frontend-only (localStorage). Adopt this when you
-- outgrow the browser: Postgres now, migrate to Neo4j only if
-- traversal depth demands it. JSON `props` keeps types flexible.
-- ============================================================

create table projects (
  id            text primary key,
  name          text not null,
  code          text not null,
  domain        text,
  central_hypothesis text,
  pre_registered  boolean not null default false,
  primary_endpoint text,
  created_at    timestamptz not null default now()
);

create table nodes (
  id         text primary key,
  project_id text not null references projects(id) on delete cascade,
  type       text not null,          -- Gene | Variant | EpigeneticMark | ...
  label      text not null,
  sublabel   text,
  x          real,
  y          real,
  props      jsonb not null default '{}'
);
create index nodes_project_idx on nodes(project_id);
create index nodes_type_idx on nodes(type);

create table edges (
  id         text primary key,
  project_id text not null references projects(id) on delete cascade,
  src        text not null references nodes(id) on delete cascade,
  dst        text not null references nodes(id) on delete cascade,
  rel        text not null,          -- encodes | regulates | deposited_on | ...
  evidence   text,                   -- none | predicted | correlational | causal | established
  strength   real,                   -- 0..1
  tested_by  text[] default '{}',    -- assay node ids
  props      jsonb not null default '{}'
);
create index edges_project_idx on edges(project_id);
create index edges_src_idx on edges(src);
create index edges_dst_idx on edges(dst);

-- type-specific detail tables (each row extends a node) ----------

create table hypotheses (
  node_id            text primary key references nodes(id) on delete cascade,
  statement          text not null,
  prediction_direction text,         -- positive | negative | none
  prediction_effect  text,
  falsification      text,
  status             text not null default 'draft',
  requires_tissue    text
);

create table hypothesis_papers (
  hypothesis_id text references hypotheses(node_id) on delete cascade,
  paper_id      text references nodes(id) on delete cascade,
  primary key (hypothesis_id, paper_id)
);

create table assays (
  node_id     text primary key references nodes(id) on delete cascade,
  method      text not null,
  measures    text,
  cell_type   text,
  controls    text,
  sample_n    int,
  phase       int,
  effort      text,                  -- low | med | high
  genome_wide boolean default false,
  status      text not null default 'design'
);

create table papers (
  node_id text primary key references nodes(id) on delete cascade,
  pmid    text,
  doi     text,
  title   text not null,
  year    int,
  stance  text                        -- supports | refutes | background
);

-- instabilities are computed by the sensor rules; only manual
-- overrides (acknowledged / resolved) are persisted.
create table instability_overrides (
  project_id     text not null references projects(id) on delete cascade,
  instability_id text not null,
  status         text not null,       -- acknowledged | resolved
  primary key (project_id, instability_id)
);
