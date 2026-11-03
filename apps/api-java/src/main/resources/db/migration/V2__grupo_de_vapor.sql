-- `asset.drive_group` passa a ser `asset.steam_group`.
--
-- A 001 criou a coluna como grupo de acionamento. A lista base do simulador
-- mostrou que o agrupamento G1–G6 que o modelo carrega é o de **vapor** — um
-- grupo de cilindros alimentado pela mesma válvula, com o seu próprio ΔP de
-- sifões e tanque separador de condensado. Acionamento é outra divisão, que o
-- modelo ainda não tem.
--
-- Renomear em vez de editar a 001: a 001 já consta na `schema_migration` de
-- quem subiu o Postgres do docker-compose, então uma edição lá não rodaria e a
-- coluna sumiria para esse banco.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'asset' and column_name = 'drive_group'
    ) then
        alter table asset rename column drive_group to steam_group;
    end if;
end
$$;
