-- A nota sugerida, e a origem `tendência` na nota.
--
-- ## Por que uma tabela, e não uma situação nova em `maintenance_note`
--
-- A chave da nota é o número, e a sugestão **não tem número**: ela só ganha um
-- `NM-…` quando alguém confirma. Dispensar é o caso comum — a maior parte das
-- tendências que passam da régua é para ser olhada, não para virar ordem de
-- serviço — e uma sugestão dispensada não pode gastar sequência de nota.
--
-- Então a sugestão tem chave própria: o mancal e o início da janela da
-- tendência. O `id` é derivado dos dois (`SG-<segundos>-<mancal>`), o que faz
-- a retomada reescrever a mesma linha em vez de empilhar sugestões iguais.
--
-- ## A linha é a auditoria
--
-- `decided_at`, `decided_by` e `reason` ficam na própria linha, e a linha fica
-- para sempre: uma sugestão dispensada é o registro de que alguém olhou a
-- tendência e disse não, com o motivo. É o mesmo desenho da alteração de
-- setpoint — a diferença é que lá cada escrita é um evento novo, e aqui cada
-- episódio de degradação é uma linha com uma decisão.

-- ------------------------------------------------ a origem nova na nota

-- `tendência` é a origem da nota que nasceu de uma sugestão. O `origin_ref`
-- dela aponta para a sugestão, e a restrição que já existia
-- (`note_origin_ref_matches_origin`) continua valendo sem mudança: só a
-- operação escreve nota sem referência.
alter table maintenance_note drop constraint if exists note_origin_valid;

alter table maintenance_note
    add constraint note_origin_valid
    check (origin in ('alarme', 'ronda', 'operação', 'tendência'));

-- ---------------------------------------------------------- a sugestão

create table if not exists note_suggestion (
    -- `SG-<segundos do início da tendência>-<mancal>`: derivado da chave
    id                text        primary key,
    asset_tag         text        not null references asset (tag) on delete cascade,
    -- início da janela que a regressão usou; a outra metade da chave
    trend_start       timestamptz not null,
    -- qual medição projeta cruzar o limite primeiro
    measure           text        not null,
    symptom           text        not null,
    priority          smallint    not null,
    requires_shutdown boolean     not null,
    -- dias até a projeção cruzar; zero quando já cruzou
    days_to_limit     double precision not null,
    -- inclinação da tendência, na unidade da medição por dia
    per_day           double precision not null,
    -- valor atual: a média da última janela da série
    level             double precision not null,
    limit_value       double precision not null,
    samples           integer     not null,
    -- A evidência vai em `jsonb`, e não em tabela filha. Ela não é consultada:
    -- a tela lê a lista inteira e desenha os links. Uma `suggestion_evidence`
    -- normalizada significaria a mesma restrição de `kind` escrita em dois
    -- lugares — que é exatamente a divergência que o teste das enumerações
    -- existe para pegar. Na confirmação a lista é copiada para
    -- `note_evidence`, onde a restrição vale.
    evidence          jsonb       not null,
    -- quando a conta foi feita
    computed_at       timestamptz not null,
    status            text        not null,
    decided_at        timestamptz,
    decided_by        text,
    -- motivo: obrigatório na dispensa
    reason            text,
    -- a nota que saiu da confirmação
    note_number       text        references maintenance_note (number) on delete set null,

    -- a chave de verdade, a que o Felipe fixou: mancal + início da tendência
    constraint suggestion_key unique (asset_tag, trend_start),
    constraint suggestion_measure_valid check (measure in ('vibração', 'temperatura')),
    constraint suggestion_status_valid check (
        status in ('sugerida', 'confirmada', 'dispensada')
    ),
    constraint suggestion_priority_range check (priority between 1 and 4),
    constraint suggestion_days_not_negative check (days_to_limit >= 0),
    constraint suggestion_evidence_is_array check (jsonb_typeof(evidence) = 'array'),
    -- quem está em pé não tem decisão; quem saiu de pé tem
    constraint suggestion_decided_matches_status check (
        (status = 'sugerida') = (decided_at is null)
    ),
    constraint suggestion_decided_by_matches_decision check (
        (decided_at is null) = (decided_by is null)
    ),
    -- dispensar sem motivo é o jeito de a auditoria não servir para nada
    constraint suggestion_dismissal_has_reason check (
        status <> 'dispensada' or (reason is not null and length(btrim(reason)) > 0)
    ),
    -- confirmada tem nota; nenhuma outra situação tem
    constraint suggestion_note_matches_status check (
        (status = 'confirmada') = (note_number is not null)
    ),
    constraint suggestion_decided_after_computed check (
        decided_at is null or decided_at >= computed_at
    )
);

create index if not exists note_suggestion_status_idx on note_suggestion (status);
create index if not exists note_suggestion_asset_idx on note_suggestion (asset_tag);
create index if not exists note_suggestion_decided_idx on note_suggestion (decided_at desc);
