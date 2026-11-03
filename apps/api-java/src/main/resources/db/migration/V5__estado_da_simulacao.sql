-- Onde a simulação parou.
--
-- Uma linha só, com o passo até onde a simulação já rodou e a semente que
-- produziu aqueles dados. É o que permite a retomada: a API acorda, lê o passo
-- guardado, calcula o que faltou e reexecuta só isso.
--
-- ## Por que a semente fica aqui
--
-- Trocar a semente muda todas as séries. Se a semente viesse só da configuração
-- e alguém a mudasse num deploy, o arquivo passaria a ter duas máquinas
-- diferentes coladas no mesmo eixo de tempo, sem nada indicando onde uma acaba.
-- Guardada junto com o passo, a troca é detectável: quem retoma compara, vê que
-- a semente é outra e reancora em vez de continuar uma série que não é a dele.
--
-- ## Por que o estado da rede fica aqui
--
-- A rede de primeira ordem tem estado que não dá para recalcular: as linhas de
-- atraso guardam o que entrou nos últimos θ segundos — 270 s na relação mais
-- lenta — e os termos integrais das malhas são a memória delas. Sem gravar
-- isso, cada retomada montaria a rede no ponto de operação, e acordar no meio
-- de uma troca de gramatura perderia a transição inteira.
--
-- São ~1.300 números, cerca de 25 KB em JSON, numa linha reescrita a cada
-- retomada. Em `jsonb` e não em tabela normalizada porque nada aqui é
-- consultado: é um bloco opaco que só o motor lê, e só por inteiro.
--
-- ## Por que uma linha e não um histórico
--
-- O estado não é dado de domínio, é marcador de progresso. O que aconteceu com
-- a máquina está no arquivo do historiador e nas entidades de operação; isto
-- aqui é só o lugar onde o trabalho parou. Um histórico de marcadores de
-- progresso não responde nenhuma pergunta.
create table if not exists sim_state (
    -- chave fixa: a tabela tem exatamente uma linha
    id         smallint    primary key,
    seed       integer     not null,
    -- último passo já simulado e gravado
    last_tick  bigint      not null,
    -- estado da rede no passo acima; nulo quando a retomada reancorou
    state      jsonb,
    updated_at timestamptz not null,

    constraint sim_state_single_row check (id = 1)
);
