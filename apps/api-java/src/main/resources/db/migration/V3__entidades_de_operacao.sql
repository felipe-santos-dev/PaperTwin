-- As entidades de operação da MP1.
--
-- Oito entidades da seção "Entidades de operação" da LISTA-BASE: turno, bobina
-- jumbo, quebra de folha, troca de gramatura, ronda, nota de manutenção,
-- alteração de setpoint e alarme. Os tipos estão em
-- packages/shared/src/operations.
--
-- Duas decisões valem para todas as tabelas daqui:
--
-- 1. **Listas são tabela filha, não array nem jsonb.** A passagem do turno, os
--    sinais da quebra, os pontos da ronda e as evidências da nota são todos
--    listas ordenadas. Em `text[]` dependeriam de o driver serializar array
--    igual nos dois lados; em `jsonb` perderiam a chave estrangeira — um ponto
--    de ronda aponta para um ativo, e isso é integridade que o banco sabe
--    cobrar.
-- 2. **O que o tipo garante, a restrição repete.** As regras de consistência
--    (`noteStatusIsConsistent`, `reelDispositionIsConsistent`) existem em
--    TypeScript para a interface poder avisar antes de enviar, e aqui para o
--    banco não aceitar o que passar por fora delas. Os valores de cada
--    enumeração estão duplicados nos `check`, e um teste compara as duas
--    listas: mudar a constante sem mudar a migration quebra o teste.

-- Postgres puro, como a 001: nada depende do TimescaleDB, para o mesmo SQL
-- rodar no PGlite embutido e num Postgres gerenciado.

-- ---------------------------------------------------------------- turno

create table if not exists shift (
    id             text             primary key,
    letter         text             not null,
    -- dia em que o turno COMEÇOU, no fuso da planta; o turno C atravessa a
    -- meia-noite e continua pertencendo ao dia anterior
    operation_date date             not null,
    started_at     timestamptz      not null,
    ended_at       timestamptz,
    operator       text             not null,
    production_t   double precision not null,
    efficiency_pct double precision not null,

    constraint shift_letter_valid check (letter in ('A', 'B', 'C')),
    constraint shift_window_ordered check (ended_at is null or ended_at > started_at),
    constraint shift_production_non_negative check (production_t >= 0),
    constraint shift_efficiency_range check (efficiency_pct >= 0 and efficiency_pct <= 100)
);

create index if not exists shift_started_idx on shift (started_at desc);

-- A passagem para o turno seguinte, uma pendência por linha, na ordem escrita.
create table if not exists shift_handover (
    shift_id text    not null references shift (id) on delete cascade,
    sequence integer not null,
    line     text    not null,

    primary key (shift_id, sequence),
    constraint handover_line_not_blank check (btrim(line) <> '')
);

-- ---------------------------------------------------------- bobina jumbo

create table if not exists jumbo_reel (
    number              integer     primary key,
    shift_id            text        not null references shift (id) on delete cascade,
    started_at          timestamptz not null,
    -- tudo abaixo é nulo enquanto a bobina está na Pope: peso e médias só
    -- existem quando ela fecha, e zero mentiria para a tela de Bobinas
    ended_at            timestamptz,
    weight_t            double precision,
    length_m            double precision,
    final_diameter_mm   double precision,
    basis_weight_gsm    double precision,
    moisture_pct        double precision,
    caliper_um          double precision,
    -- dispersão CD (2σ) medida pelo QCS: AI-912, AI-913, AI-915
    cd_basis_weight_gsm double precision,
    cd_moisture_pct     double precision,
    cd_caliper_um       double precision,
    splices             integer     not null,
    disposition         text,
    disposition_reason  text,

    constraint reel_splices_non_negative check (splices >= 0),
    constraint reel_window_ordered check (ended_at is null or ended_at > started_at),
    constraint reel_disposition_valid check (
        disposition is null or disposition in ('aprovada', 'rebaixada', 'segregada')
    ),
    -- ou a dispersão CD está inteira, ou não tem nenhuma parte dela
    constraint reel_cd_spread_complete check (
        (cd_basis_weight_gsm is null and cd_moisture_pct is null and cd_caliper_um is null)
        or (cd_basis_weight_gsm is not null and cd_moisture_pct is not null
            and cd_caliper_um is not null)
    ),
    -- bobina rebaixada ou segregada é obrigada a dizer por quê
    constraint reel_reason_matches_disposition check (
        (disposition is null and disposition_reason is null)
        or disposition = 'aprovada'
        or btrim(coalesce(disposition_reason, '')) <> ''
    )
);

create index if not exists jumbo_reel_shift_idx on jumbo_reel (shift_id);
create index if not exists jumbo_reel_started_idx on jumbo_reel (started_at desc);

-- -------------------------------------------------------- quebra de folha

create table if not exists web_break (
    id             text        primary key,
    shift_id       text        not null references shift (id) on delete cascade,
    started_at     timestamptz not null,
    ended_at       timestamptz,
    -- onde a folha arrebentou, pela seção do processo
    section        text        not null,
    probable_cause text        not null,

    constraint web_break_window_ordered check (ended_at is null or ended_at >= started_at)
);

create index if not exists web_break_shift_idx on web_break (shift_id);
create index if not exists web_break_started_idx on web_break (started_at desc);

-- Os sinais da janela de 10 min anterior à quebra.
--
-- `lead_time_s` é contado PARA TRÁS a partir da quebra: 540 é nove minutos
-- antes, 0 é no instante dela. Guardar assim, e não como instante absoluto, é
-- o que deixa duas quebras comparáveis lado a lado.
create table if not exists web_break_precursor (
    break_id        text             not null references web_break (id) on delete cascade,
    lead_time_s     integer          not null,
    tag             text             not null,
    description     text             not null,
    value_before    double precision not null,
    value_at_signal double precision not null,

    primary key (break_id, tag, lead_time_s),
    -- a janela é PRECURSOR_WINDOW_S, em @mp1/shared; um teste compara os dois
    constraint precursor_within_window check (lead_time_s between 0 and 600)
);

-- ----------------------------------------------------- troca de gramatura

create table if not exists grade_change (
    id            text             primary key,
    shift_id      text             not null references shift (id) on delete cascade,
    from_gsm      double precision not null,
    to_gsm        double precision not null,
    -- quando o setpoint mudou
    started_at    timestamptz      not null,
    -- quando o QCS voltou à tolerância; nulo enquanto a transição corre
    stabilized_at timestamptz,

    constraint grade_change_is_a_change check (from_gsm <> to_gsm),
    constraint grade_change_weights_positive check (from_gsm > 0 and to_gsm > 0),
    constraint grade_change_ordered check (stabilized_at is null or stabilized_at >= started_at)
);

create index if not exists grade_change_shift_idx on grade_change (shift_id);
create index if not exists grade_change_started_idx on grade_change (started_at desc);

-- As bobinas que pegaram a transição. Quem decide se a bobina foi afetada é
-- quem a inspecionou, então é campo da troca e não um cálculo feito na tela.
create table if not exists grade_change_reel (
    change_id   text    not null references grade_change (id) on delete cascade,
    reel_number integer not null references jumbo_reel (number) on delete cascade,

    primary key (change_id, reel_number)
);

-- ----------------------------------------------------------------- ronda

create table if not exists inspection_round (
    id          text        primary key,
    shift_id    text        not null references shift (id) on delete cascade,
    started_at  timestamptz not null,
    finished_at timestamptz,
    inspector   text        not null,

    constraint round_window_ordered check (finished_at is null or finished_at >= started_at)
);

create index if not exists inspection_round_shift_idx on inspection_round (shift_id);
create index if not exists inspection_round_started_idx on inspection_round (started_at desc);

-- Um ponto da ronda, na ordem em que foi percorrido.
--
-- `online_value` é GUARDADO, não recalculado na hora de mostrar. O historiador
-- devolveria o mesmo número, já que a simulação é determinística, mas o par "o
-- que o campo dizia / o que a tela dizia" é um registro daquele instante: se a
-- regra de agregação mudar, o registro não pode mudar com ela.
create table if not exists round_point (
    round_id     text    not null references inspection_round (id) on delete cascade,
    sequence     integer not null,
    asset_tag    text    not null references asset (tag) on delete cascade,
    field_temp_c double precision,
    noise        text    not null,
    leak         text    not null,
    note         text,
    online_tag   text,
    online_value double precision,

    primary key (round_id, sequence),
    constraint round_point_noise_valid check (noise in ('normal', 'elevado', 'anormal')),
    constraint round_point_leak_valid check (leak in ('nenhum', 'gotejamento', 'jato')),
    -- ou o ponto tem tag online e valor, ou não tem nenhum dos dois
    constraint round_point_online_complete check (
        (online_tag is null and online_value is null)
        or (online_tag is not null and online_value is not null)
    )
);

create index if not exists round_point_asset_idx on round_point (asset_tag);

-- ---------------------------------------------------- nota de manutenção

create table if not exists maintenance_note (
    number            text        primary key,
    asset_tag         text        not null references asset (tag) on delete cascade,
    symptom           text        not null,
    priority          smallint    not null,
    origin            text        not null,
    -- id do alarme ou da ronda que originou; nulo quando veio da operação
    origin_ref        text,
    status            text        not null,
    requires_shutdown boolean     not null,
    created_at        timestamptz not null,
    closed_at         timestamptz,

    constraint note_priority_range check (priority between 1 and 4),
    constraint note_origin_valid check (origin in ('alarme', 'ronda', 'operação')),
    constraint note_status_valid check (
        status in ('aberta', 'planejada', 'em execução', 'encerrada')
    ),
    -- encerrada tem data de encerramento; nenhuma outra situação tem. Os dois
    -- jeitos de a lista de pendências mentir sobre o que falta fazer
    constraint note_closed_matches_status check (
        (status = 'encerrada') = (closed_at is not null)
    ),
    -- origem alarme ou ronda precisa dizer de qual; sem a referência a origem é
    -- só um rótulo, e a tela não consegue levar de volta ao registro
    constraint note_origin_ref_matches_origin check (
        (origin = 'operação') = (origin_ref is null)
    ),
    constraint note_closed_after_created check (closed_at is null or closed_at >= created_at)
);

create index if not exists maintenance_note_status_idx on maintenance_note (status);
create index if not exists maintenance_note_asset_idx on maintenance_note (asset_tag);
create index if not exists maintenance_note_created_idx on maintenance_note (created_at desc);

-- Evidência não é arquivo: é referência ao que o gêmeo já tem — uma janela de
-- tendência, um alarme, um ponto de ronda, uma medição. O gêmeo não guarda foto
-- nem anexo, nem teria onde nos 0,5 GB do banco gratuito.
create table if not exists note_evidence (
    note_number text    not null references maintenance_note (number) on delete cascade,
    sequence    integer not null,
    kind        text    not null,
    ref         text    not null,
    label       text    not null,

    primary key (note_number, sequence),
    constraint evidence_kind_valid check (kind in ('tendência', 'alarme', 'ronda', 'medição'))
);

-- ------------------------------------------------ alteração de setpoint

-- A auditoria da única escrita que o gêmeo aceita. Os cinco campos da
-- LISTA-BASE juntos: malha, valor anterior e novo, quem, quando, motivo.
--
-- O valor anterior é gravado pelo servidor a partir do que estava valendo, e
-- não enviado por quem escreve — quem escreve não tem como saber se alguém
-- mexeu entre a leitura da tela e o clique.
--
-- Valor igual ao anterior é aceito: reafirmar um setpoint é coisa que se faz, e
-- a tentativa também é registro de auditoria.
create table if not exists setpoint_change (
    id             text             primary key,
    tag            text             not null,
    previous_value double precision not null,
    new_value      double precision not null,
    unit           text             not null,
    changed_by     text             not null,
    changed_at     timestamptz      not null,
    reason         text             not null,

    constraint setpoint_reason_not_blank check (btrim(reason) <> ''),
    constraint setpoint_author_not_blank check (btrim(changed_by) <> '')
);

create index if not exists setpoint_change_tag_idx on setpoint_change (tag, changed_at desc);
create index if not exists setpoint_change_at_idx on setpoint_change (changed_at desc);

-- --------------------------------------------------------------- alarme

-- O engavetamento fica em `shelved_until`, e não como quarto estado: um alarme
-- pode ser engavetado enquanto ativo e, quando a gaveta vence, tem de voltar ao
-- estado em que estava. Com o engavetamento como estado, esse estado anterior
-- se perderia e o alarme voltaria pedindo reconhecimento de algo já
-- reconhecido.
create table if not exists alarm (
    id              text             primary key,
    tag             text             not null,
    -- `limit` é palavra reservada no SQL
    limit_level     text             not null,
    -- valor do limite no momento do disparo, copiado do catálogo
    threshold       double precision not null,
    priority        text             not null,
    state           text             not null,
    raised_at       timestamptz      not null,
    -- pior valor atingido desde o disparo
    peak_value      double precision not null,
    acknowledged_at timestamptz,
    acknowledged_by text,
    cleared_at      timestamptz,
    shelved_until   timestamptz,
    shelved_by      text,

    constraint alarm_limit_valid check (limit_level in ('LL', 'L', 'H', 'HH')),
    constraint alarm_priority_valid check (
        priority in ('baixa', 'média', 'alta', 'crítica')
    ),
    constraint alarm_state_valid check (state in ('ativo', 'reconhecido', 'normalizado')),
    constraint alarm_ack_complete check (
        (acknowledged_at is null) = (acknowledged_by is null)
    ),
    constraint alarm_shelve_complete check ((shelved_until is null) = (shelved_by is null)),
    -- só um alarme normalizado tem hora de normalização
    constraint alarm_cleared_matches_state check (
        (state = 'normalizado') = (cleared_at is not null)
    ),
    constraint alarm_ack_after_raised check (
        acknowledged_at is null or acknowledged_at >= raised_at
    ),
    constraint alarm_cleared_after_raised check (cleared_at is null or cleared_at >= raised_at)
);

-- A janela de inundação da ISA-18.2 varre por hora de disparo em toda a
-- máquina, então o índice é por `raised_at` e não por tag.
create index if not exists alarm_raised_idx on alarm (raised_at desc);
create index if not exists alarm_state_idx on alarm (state);
create index if not exists alarm_tag_idx on alarm (tag, raised_at desc);
