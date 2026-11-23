-- O ensaio de laboratório como evento.
--
-- Até aqui o laboratório era dado fixo no front: uma tabela de resultados
-- plausíveis com o selo de ilustrativo. O que faltava é o que distingue um
-- ensaio de um número numa tela — ele acontece num instante, numa amostra
-- cortada de uma bobina, e o laudo só fica pronto depois.
--
-- ## Os dois instantes são o ponto
--
-- `sampled_at` é quando a amostra foi cortada (o fim da bobina) e
-- `reported_at` é quando o laudo ficou pronto. Entre os dois o papel já foi
-- enrolado, e entre um laudo e o próximo a operação está sem medida nenhuma. É
-- esse buraco que o sensor virtual preenche, e sem os dois instantes gravados
-- ele não teria como saber onde o buraco está.
--
-- ## Por que a chave é derivada
--
-- `LR-<bobina>-<tag>`: uma amostra por bobina por ensaio. Derivar a chave em
-- vez de contar numa sequência é o que mantém a colheita idempotente —
-- reexecutar um trecho reescreve a mesma linha em vez de criar uma segunda
-- análise da mesma amostra.

create table if not exists lab_result (
    -- `LR-<bobina>-<tag>`
    id          text        primary key,
    -- TAG do ensaio em LAB_VARIABLES; não é tag de catálogo de processo, então
    -- não há chave estrangeira para conferir — o teste do `shared` confere
    tag         text        not null,
    reel_number integer     not null references jumbo_reel (number) on delete cascade,
    value       double precision not null,
    unit        text        not null,
    -- quando a amostra foi cortada: o fim da bobina
    sampled_at  timestamptz not null,
    -- quando o laudo ficou pronto
    reported_at timestamptz not null,
    -- nulo quando o ensaio não tem faixa numérica declarada
    within_spec boolean,

    constraint lab_reported_after_sampled check (reported_at >= sampled_at)
);

-- a consulta do sensor virtual é sempre "os últimos laudos deste ensaio"
create index if not exists lab_result_tag_idx on lab_result (tag, sampled_at desc);
create index if not exists lab_result_reel_idx on lab_result (reel_number);
