package dev.felipesantos.papertwin.catalog;

import dev.felipesantos.papertwin.api.Nullable;
/**
 * Uma variável de processo do catálogo.
 *
 * <p>Campos que não se aplicam são {@code null} em vez de ausentes: o catálogo é serializado para
 * a API e consumido pela cena, e um campo sempre presente evita um ramo a mais em cada consumidor.
 *
 * @param tag TAG no padrão ISA-5.1, ex.: {@code PIC-514}. Única no catálogo.
 * @param area área do processo, ex.: {@code pré-secagem}
 * @param group agrupamento dentro da área, ex.: {@code vapor}
 * @param target alvo de operação; {@code null} nas que não têm, como o diâmetro da bobina
 * @param controlled se é uma malha de controle (tem setpoint) ou só uma medição
 * @param mv variável manipulada da malha, em texto livre; {@code null} quando não há
 * @param cylinder nº do cilindro, nas que vêm de um padrão por cilindro; {@code null} nas demais
 * @param steamGroup grupo de vapor do cilindro, quando a variável é de um cilindro
 */
public record ProcessVariable(
    String tag,
    String name,
    String area,
    String group,
    String unit,
    double min,
    double max,
    @Nullable Double target,
    AlarmLimits limits,
    boolean controlled,
    @Nullable String mv,
    Compression compression,
    VariableSource source,
    Confidence confidence,
    @Nullable String note,
    @Nullable Integer cylinder,
    @Nullable String steamGroup) {

  /** Se a variável ainda não foi conferida na MP1. */
  public boolean pending() {
    return source == VariableSource.ASSUMED || confidence == Confidence.BAIXA;
  }
}
