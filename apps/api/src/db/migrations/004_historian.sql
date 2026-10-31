-- O historiador, no modelo do PI.
--
-- Três tabelas: o ponto (uma linha por tag arquivada), o valor bruto e o valor
-- arquivado. Os parâmetros da compressão — exc_dev e comp_dev — vêm coluna por
-- coluna do catálogo da lista base.
--
-- ## Por que o arquivo guarda point_id e não a tag
--
-- São 320 pontos. A tag em texto custa ~12 bytes por linha na tabela e outros
-- tantos na entrada do índice; o arquivo é a maior tabela do banco, e num banco
-- de 0,5 GB isso é cerca de um quarto do espaço disponível. É a mesma razão
-- pela qual o PI tem PointID.
--
-- O id **não** vem de uma sequência: ele é o índice da variável no catálogo,
-- semeado a partir de @mp1/shared. Com uma sequência, a ordem de semeadura
-- decidiria os ids, e o instantâneo do modo de demonstração — gerado numa
-- máquina, servido de outra — apontaria para os pontos errados.
--
-- ## Por que as colunas estão nesta ordem
--
-- `ts` e `value` primeiro, `point_id` e `reason` depois. Declaradas na ordem
-- natural de leitura (point_id, ts, value, reason), o alinhamento de 8 bytes do
-- timestamptz depois de um smallint custaria 6 bytes de enchimento em cada
-- linha — 13 % da maior tabela do banco, sem guardar nada.

create table if not exists historian_point (
    point_id smallint primary key,
    tag      text     not null unique,
    unit     text     not null,
    -- filtro de exceção; nulo = a tag não é comprimida
    exc_dev  double precision,
    -- desvio da porta oscilante; nulo = a tag não é comprimida
    comp_dev double precision,

    constraint historian_point_id_positive check (point_id > 0),
    constraint historian_exc_dev_non_negative check (exc_dev is null or exc_dev >= 0),
    constraint historian_comp_dev_non_negative check (comp_dev is null or comp_dev >= 0)
);

-- O valor bruto: um buffer rolante de minutos, não de dias.
--
-- Um PI de verdade **não guarda isto**. O filtro de exceção roda na coleta,
-- junto do processo, e o que ele descarta não existe em lugar nenhum depois.
-- Esta tabela existe para que se possa *ver* o que o filtro jogou fora — é
-- material de demonstração, não de operação.
--
-- A 1 s, os 320 pontos geram ~19 mil linhas por minuto; uma semana de bruto
-- sozinha passaria de 100 GB. A retenção está em RAW_RETENTION_MINUTES, em
-- @mp1/shared, e quem apaga é pruneHistorian().
create table if not exists historian_raw (
    ts       timestamptz      not null,
    value    double precision not null,
    point_id smallint         not null references historian_point (point_id) on delete cascade,

    primary key (point_id, ts)
);

-- A varredura por tempo em todos os pontos — "o que o processo estava fazendo
-- às 14h07" — não usa a chave primária, que começa pelo ponto. O BRIN cabe aqui
-- porque a tabela é escrita em ordem de ts: cada faixa de páginas guarda só o
-- mínimo e o máximo, o que a deixa com uma fração do tamanho de um btree.
create index if not exists historian_raw_ts_brin
    on historian_raw using brin (ts) with (pages_per_range = 32);

-- O valor arquivado: o que passou pelo filtro de exceção e a porta oscilante
-- não conseguiu explicar por uma reta.
--
-- `reason` é o código da razão, de 1 a 5, na ordem de ARCHIVE_REASONS em
-- @mp1/shared: inicial, porta, intervalo, evento, final. Em texto custaria ~12
-- bytes por linha contra 2. Um teste compara o teto do check com o tamanho da
-- lista.
--
-- Note que **exceção não é razão de arquivamento**: o filtro decide o que é
-- descartado antes do arquivo. O que o arquivo registra é por que a reta não
-- bastou.
create table if not exists historian_archive (
    ts       timestamptz      not null,
    value    double precision not null,
    point_id smallint         not null references historian_point (point_id) on delete cascade,
    reason   smallint         not null,

    primary key (point_id, ts),
    constraint historian_reason_valid check (reason between 1 and 5)
);

create index if not exists historian_archive_ts_brin
    on historian_archive using brin (ts) with (pages_per_range = 32);
