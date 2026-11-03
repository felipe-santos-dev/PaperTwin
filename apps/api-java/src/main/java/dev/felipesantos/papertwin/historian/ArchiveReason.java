package dev.felipesantos.papertwin.historian;

/**
 * Por que uma amostra foi para o arquivo.
 *
 * <p>Note que <b>exceção não está na lista</b>, e isso é a essência do modelo: o filtro de exceção
 * decide o que é <i>descartado</i> na coleta, antes do arquivo. O que chega ao arquivo passou pelo
 * filtro; o que o arquivo registra é por que a porta oscilante não conseguiu representar aquele
 * trecho por uma reta.
 *
 * <p>O código é a posição na lista, de 1 a 5, e é ele que vai para a coluna {@code smallint}: em
 * texto custaria ~12 bytes por linha contra 2, na maior tabela do banco.
 */
public enum ArchiveReason {
  INICIAL("inicial", "Primeiro valor do ponto"),
  PORTA("porta", "A porta oscilante fechou: a reta não representava mais o trecho"),
  INTERVALO("intervalo", "Teto de tempo entre valores arquivados"),
  EVENTO("evento", "Forçado por um evento — quebra, troca de gramatura, escrita de setpoint"),
  FINAL("final", "Último valor do trecho, gravado ao fechar a janela");

  private final String label;
  private final String meaning;

  ArchiveReason(String label, String meaning) {
    this.label = label;
    this.meaning = meaning;
  }

  public String label() {
    return label;
  }

  public String meaning() {
    return meaning;
  }

  /** O código de 1 a 5 que vai para a coluna. */
  public short code() {
    return (short) (ordinal() + 1);
  }

  public static ArchiveReason fromCode(short code) {
    if (code < 1 || code > values().length) {
      throw new IllegalArgumentException(
          "Código de razão fora da faixa 1–%d: %d".formatted(values().length, code));
    }
    return values()[code - 1];
  }

  public static ArchiveReason fromLabel(String label) {
    for (var reason : values()) {
      if (reason.label.equals(label)) {
        return reason;
      }
    }
    throw new IllegalArgumentException("Razão de arquivamento desconhecida: " + label);
  }
}
