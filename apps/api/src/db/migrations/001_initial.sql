-- Esquema inicial do gêmeo digital da MP1.
--
-- Postgres puro: nada aqui depende do TimescaleDB, para o mesmo SQL rodar no
-- PGlite embutido (desenvolvimento e testes) e num Postgres gerenciado.

-- Ativos da máquina. A fonte da verdade é packages/shared/src/machine/mp1.ts;
-- esta tabela é semeada a partir dele e nunca editada à mão.
create table if not exists asset (
    tag           text primary key,
    kind          text             not null,
    label         text             not null,
    section       text             not null,
    position_x    double precision not null,
    position_y    double precision not null,
    position_z    double precision not null,
    radius_m      double precision,
    length_m      double precision,
    side          text,
    parent_tag    text references asset (tag),
    drive_group   text,
    -- classe da ISO 20816-3; nulo nos ativos que não têm medição
    iso_group     text,
    iso_support   text,
    -- 'validated' ou 'assumed': de onde vem a existência deste ativo
    source        text             not null,

    constraint asset_side_valid check (side is null or side in ('LA', 'LC')),
    constraint asset_source_valid check (source in ('validated', 'assumed')),
    -- ou o ativo tem a classe ISO inteira, ou não tem nenhuma parte dela
    constraint asset_iso_complete check (
        (iso_group is null and iso_support is null)
        or (iso_group is not null and iso_support is not null)
    )
);

create index if not exists asset_section_idx on asset (section);
create index if not exists asset_parent_idx on asset (parent_tag);

-- Série temporal de vibração, uma linha por mancal por instante de medição.
create table if not exists vibration_reading (
    asset_tag   text             not null references asset (tag) on delete cascade,
    ts          timestamptz      not null,
    rms_mm_s    double precision not null,
    temp_c      double precision not null,
    envelope_ge double precision not null,

    primary key (asset_tag, ts),

    constraint vibration_rms_non_negative check (rms_mm_s >= 0),
    constraint vibration_envelope_non_negative check (envelope_ge >= 0)
);

-- A chave primária já serve às consultas por ativo e janela, que são a maioria.
--
-- O BRIN cobre a varredura por tempo em toda a máquina — "o que aconteceu entre
-- 14h e 15h" — e cabe aqui porque a tabela é escrita em ordem de ts: cada faixa
-- de páginas guarda só o mínimo e o máximo, o que a deixa com uma fração do
-- tamanho de um btree equivalente.
create index if not exists vibration_reading_ts_brin
    on vibration_reading using brin (ts) with (pages_per_range = 32);
