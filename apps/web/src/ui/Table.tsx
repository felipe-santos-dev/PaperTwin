import type { ReactNode } from 'react';

/**
 * A tabela das telas, com o desenho do protótipo aprovado.
 *
 * Tabela e não lista de cartões, e vale dizer por quê: a regra do projeto pede
 * "gráficos e tabelas em destaque, poucos cards". Numa tela de bobinas, o que
 * alguém faz é comparar a gramatura da bobina 4.810 com a da 4.811 — e comparar
 * números é alinhá-los numa coluna. Cartões empilhados obrigam a vista a ir e
 * voltar para cada comparação.
 *
 * É `<table>` de verdade, e não um `grid` de `div`: um leitor de tela anuncia a
 * coluna junto com a célula, e sem isso "75,1" é só um número solto.
 */

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  /** Alinha à direita. Número se lê alinhado pela direita. */
  readonly numeric?: boolean;
  readonly render: (row: T) => ReactNode;
  /** Esconde a coluna em telas estreitas, da menos importante para a mais. */
  readonly hideBelow?: 'md' | 'lg' | 'xl';
}

export interface TableProps<T> {
  readonly caption: string;
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly keyOf: (row: T) => string;
  /** Marca a linha escolhida. */
  readonly selected?: (row: T) => boolean;
  /** Quando dado, a linha inteira é clicável. */
  readonly onSelect?: (row: T) => void;
}

const HIDE = {
  md: 'max-md:hidden',
  lg: 'max-lg:hidden',
  xl: 'max-xl:hidden',
} as const;

export function Table<T>({ caption, columns, rows, keyOf, selected, onSelect }: TableProps<T>) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`border-b border-mill-line px-2.5 py-1.5 text-[12.5px] font-medium text-mill-muted ${
                  column.numeric ? 'text-right' : 'text-left'
                } ${column.hideBelow ? HIDE[column.hideBelow] : ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selected?.(row) ?? false;

            return (
              <tr
                key={keyOf(row)}
                {...(onSelect
                  ? {
                      onClick: () => {
                        onSelect(row);
                      },
                      /**
                       * A linha clicável também responde ao teclado.
                       *
                       * Sem `tabIndex` e sem a tecla, a tela inteira fica
                       * inacessível para quem não usa ponteiro — e numa sala de
                       * controle isso inclui quem está de luva.
                       */
                      tabIndex: 0,
                      onKeyDown: (event: React.KeyboardEvent) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(row);
                        }
                      },
                      role: 'button',
                      'aria-pressed': isSelected,
                    }
                  : {})}
                className={`${onSelect ? 'cursor-pointer' : ''} ${
                  isSelected ? 'bg-white/6' : onSelect ? 'hover:bg-white/4' : ''
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`border-b border-mill-line px-2.5 py-2 ${
                      column.numeric ? 'text-right font-mono' : ''
                    } ${column.hideBelow ? HIDE[column.hideBelow] : ''}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Um par rótulo–valor, para os painéis de detalhe.
 *
 * `<dl>` e não `<div>` pelo mesmo motivo da tabela: a relação entre o rótulo e o
 * valor fica no documento, não só no espaçamento.
 */
export function Facts({
  items,
  columns = 2,
}: {
  readonly items: readonly { readonly label: string; readonly value: ReactNode }[];
  readonly columns?: 2 | 3 | 4;
}) {
  const grid = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[columns];

  return (
    <dl className={`grid ${grid} gap-x-4 gap-y-2.5 text-sm`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-mill-muted">{item.label}</dt>
          <dd className="mt-0.5 truncate font-mono">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
