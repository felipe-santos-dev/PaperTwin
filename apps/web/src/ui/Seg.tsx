/**
 * Botões segmentados: escolher um de poucos recortes.
 *
 * É o `.seg` do protótipo — uma caixa só, os botões divididos por um filete, o
 * escolhido com fundo azulado. Serve para a janela de tempo ("Turno · 24 h ·
 * 3 turnos"), para a aba de um detalhe ("Tendência · Efeito na folha") e para o
 * modo de uma lista.
 *
 * ## Por que recolher os botões soltos das telas
 *
 * Hoje cada tela resolve a própria escolha: um `div` com dois `button`,
 * classes copiadas de outra tela e uma borda que não bate com a vizinha. São
 * variações sem razão — e, pior, cada uma decidiu sozinha o que é "escolhido".
 * Com um componente, a escolha tem **um** jeito de aparecer e **um** papel de
 * acessibilidade.
 *
 * ## `radiogroup`, e não um `select` nem botões soltos
 *
 * Os segmentados são excludentes e sempre têm um escolhido — que é a definição
 * de um grupo de rádio. `aria-checked` diz qual é, e as setas do teclado
 * andam entre eles, que é o que alguém espera de um grupo de rádio e **não** é
 * o que um `aria-pressed` daria.
 *
 * Um `select` seria menos código e está errado: ele esconde as opções atrás de
 * um clique, e aqui a lista de recortes é parte da informação — saber que existe
 * "3 turnos" é metade do valor do controle.
 */

export interface SegOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Explicação curta, no `title`, para o rótulo que não cabe por extenso. */
  readonly title?: string;
  readonly disabled?: boolean;
}

export interface SegProps<T extends string> {
  readonly options: readonly SegOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** O que o grupo escolhe. Obrigatório: um grupo sem nome não se lê. */
  readonly label: string;
  /** `sm` para o cabeçalho de painel; `md` para o cabeçalho de tela. */
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className = '',
}: SegProps<T>) {
  const alto = size === 'md' ? 'h-7' : 'h-6';
  const pad = size === 'md' ? 'px-3 text-[12px]' : 'px-2 text-[11px]';

  /** As setas andam entre os segmentos, pulando os desligados. */
  const andar = (from: number, step: number): void => {
    const total = options.length;
    for (let passo = 1; passo <= total; passo += 1) {
      const alvo = options[(from + step * passo + total * total) % total];
      if (alvo && !alvo.disabled) {
        onChange(alvo.value);
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex shrink-0 border border-line-strong ${className}`}
    >
      {options.map((option, index) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={option.title ?? option.label}
            disabled={option.disabled ?? false}
            tabIndex={on ? 0 : -1}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                andar(index, 1);
              }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                andar(index, -1);
              }
            }}
            className={`${alto} ${pad} whitespace-nowrap disabled:opacity-40 ${
              index > 0 ? 'border-l border-line-strong' : ''
            } ${on ? 'bg-hover font-medium text-fg' : 'text-fg-2 hover:text-fg'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
