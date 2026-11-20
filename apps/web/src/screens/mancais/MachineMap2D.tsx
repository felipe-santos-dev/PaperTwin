import { useState } from 'react';
import { assetByTag, monitoredAssets, MP1, type AssetTag, type IsoZone } from '@mp1/shared';

import { useSize } from '../../ui/useWidth';
import type { BearingRow } from './derive';

/**
 * O mapa da máquina em vista lateral, com um ponto por mancal.
 *
 * É o painel padrão da tela de Mancais. O 3D continua existindo, a um clique de
 * distância, mas quem abre a tela para ver em que pé estão os mancais recebe
 * primeiro **a resposta**: onde, na máquina, está o que está pior.
 *
 * ## Duas faixas, e não uma
 *
 * Numa vista lateral o mancal do lado comando e o do lado acionamento caem no
 * mesmo ponto — são as duas pontas do mesmo rolo. Empilhar os dois num ponto só
 * esconderia metade dos mancais; separá-los por um deslocamento para cima e
 * para baixo inventaria uma altura que não existe. Então a máquina é desenhada
 * duas vezes, uma faixa por lado, cada uma rotulada. É também como se pensa o
 * problema na fábrica: o lado comando é onde se anda, o lado acionamento é onde
 * estão os motores.
 *
 * ## A altura é exagerada, a largura não
 *
 * O X é a posição real em metros, na mesma escala do modelo. O Y é esticado
 * {@link Y_EXAGERO} vezes, senão a máquina inteira — 98 m de comprimento por
 * 7 de altura — vira um fio de 30 px e as duas fileiras de secadores se
 * sobrepõem. Os círculos dos corpos usam a escala **do X**, para dois cilindros
 * vizinhos ficarem encostados como estão na máquina de verdade.
 */

/**
 * Quanto o eixo vertical pode ser esticado em relação ao horizontal.
 *
 * O valor sai da altura que o painel tem: o desenho ocupa o que lhe dão, dentro
 * destes limites. Abaixo do mínimo as duas fileiras de secadores se encostam;
 * acima do máximo a máquina vira uma caricatura alta e magra.
 */
const Y_EXAGERO_MIN = 1.5;
const Y_EXAGERO_MAX = 4;

/** Folga em px nas laterais do desenho. */
const PAD_X = 10;

/** Altura da tira de rótulos de seção, embaixo. */
const RODAPE = 16;

/** Espaço entre as duas faixas. */
const ENTRE_FAIXAS = 14;

/** Raio mínimo do corpo em px: abaixo disto um rolo pequeno some. */
const RAIO_MIN = 3.6;

/**
 * A cor do ponto por zona, igual à da barra de mancal: cinza em A e B, âmbar em
 * C, vermelho em D. A zona não é um semáforo de quatro cores — A e B são "em
 * ordem", e pintá-las de verde faria o olho procurar verde.
 */
const COR_ZONA: Readonly<Record<IsoZone, string>> = {
  A: 'var(--color-fg-3)',
  B: 'var(--color-fg-3)',
  C: 'var(--color-iso-c-line)',
  D: 'var(--color-iso-d-line)',
};

const LADO_LABEL = { LC: 'Lado comando', LA: 'Lado acionamento' } as const;

interface Corpo {
  readonly tag: AssetTag;
  readonly label: string;
  /** Centro em metros. */
  readonly x: number;
  readonly y: number;
  readonly raioM: number;
  readonly section: string;
  /** Tag do ativo do mancal de cada lado. */
  readonly LA: AssetTag | null;
  readonly LC: AssetTag | null;
}

/**
 * Os corpos girantes que têm mancal monitorado, tirados do modelo.
 *
 * Calculado uma vez, na carga: o modelo da máquina é constante, e refazer isto
 * a cada render só para chegar ao mesmo resultado seria trabalho do navegador
 * que ninguém pediu.
 */
const CORPOS: readonly Corpo[] = (() => {
  const porPai = new Map<AssetTag, { LA: AssetTag | null; LC: AssetTag | null }>();

  for (const mancal of monitoredAssets(MP1)) {
    if (mancal.kind !== 'bearing' || !mancal.parentTag) continue;
    const atual = porPai.get(mancal.parentTag) ?? { LA: null, LC: null };
    porPai.set(mancal.parentTag, { ...atual, [mancal.side ?? 'LA']: mancal.tag });
  }

  const corpos: Corpo[] = [];
  for (const [tag, lados] of porPai) {
    const corpo = assetByTag(MP1, tag);
    if (!corpo) continue;
    corpos.push({
      tag,
      label: corpo.label,
      x: corpo.position[0],
      y: corpo.position[1],
      raioM: corpo.radius ?? 0.45,
      section: corpo.section,
      LA: lados.LA,
      LC: lados.LC,
    });
  }

  return corpos.sort((a, b) => a.x - b.x);
})();

/** As seções que têm corpo com mancal, na ordem do processo e com a faixa de X. */
const SECOES = MP1.sections
  .slice()
  .sort((a, b) => a.order - b.order)
  .map((secao) => {
    const corpos = CORPOS.filter((corpo) => corpo.section === secao.id);
    return {
      id: secao.id,
      label: secao.label,
      x0: Math.min(...corpos.map((c) => c.x - c.raioM)),
      x1: Math.max(...corpos.map((c) => c.x + c.raioM)),
      corpos: corpos.length,
    };
  })
  .filter((secao) => secao.corpos > 0);

const X0 = Math.min(...CORPOS.map((c) => c.x - c.raioM));
const X1 = Math.max(...CORPOS.map((c) => c.x + c.raioM));
const Y0 = Math.min(...CORPOS.map((c) => c.y - c.raioM));
const Y1 = Math.max(...CORPOS.map((c) => c.y + c.raioM));

export interface MachineMap2DProps {
  readonly rows: readonly BearingRow[];
  /** O mancal escolhido na lista, para destacar. */
  readonly selected: string | null;
  /**
   * Escolher um mancal pelo mapa.
   *
   * É um atalho do mouse, não um segundo caminho de teclado: 98 pontos no
   * caminho do Tab atrapalhariam muito mais do que ajudam, e a lista ao lado já
   * dá a mesma escolha pelo teclado, com nome e número à vista.
   */
  readonly onSelect?: (assetTag: string) => void;
  /**
   * A seção onde a folha arrebentou, marcada em vermelho.
   *
   * O mapa serve a duas telas: em Mancais ele mostra a condição dos 98 pontos,
   * no replay de quebra ele mostra **onde**. É a mesma máquina e a mesma
   * geometria — duas vistas laterais diferentes fariam quem opera reaprender a
   * posição a cada tela.
   */
  readonly breakSection?: string | null;
  readonly className?: string;
}

export function MachineMap2D({
  rows,
  selected,
  onSelect,
  breakSection = null,
  className = '',
}: MachineMap2DProps) {
  const [ref, width, alturaCaixa] = useSize<HTMLDivElement>(640, 220);
  const [sobCursor, setSobCursor] = useState<string | null>(null);

  const zonas = new Map<string, IsoZone | null>(rows.map((row) => [row.assetTag, row.zone]));
  const escala = (width - PAD_X * 2) / (X1 - X0);
  const faixaCrua = (Y1 - Y0) * escala;
  const disponivel = (alturaCaixa - ENTRE_FAIXAS - RODAPE) / 2;
  const exagero = Math.min(Y_EXAGERO_MAX, Math.max(Y_EXAGERO_MIN, disponivel / faixaCrua));
  const alturaFaixa = faixaCrua * exagero;
  const altura = alturaFaixa * 2 + ENTRE_FAIXAS + RODAPE;

  const px = (x: number) => PAD_X + (x - X0) * escala;
  /** Y de dentro da faixa: o chão da máquina embaixo, como na vista lateral. */
  const py = (y: number) => (Y1 - y) * escala * exagero;

  const escolhido = CORPOS.find((corpo) => corpo.LA === selected || corpo.LC === selected) ?? null;

  return (
    <div ref={ref} className={`min-w-0 ${className}`}>
      <svg
        role="img"
        aria-label="Mapa da máquina em vista lateral, com um ponto por mancal"
        width={width}
        height={altura}
      >
        {/* a guia vertical do mancal escolhido atravessa as duas faixas */}
        {escolhido ? (
          <line
            x1={px(escolhido.x)}
            x2={px(escolhido.x)}
            y1={0}
            y2={alturaFaixa * 2 + ENTRE_FAIXAS}
            stroke="var(--color-action)"
            strokeOpacity={0.45}
            strokeDasharray="2 3"
          />
        ) : null}

        {/* onde a folha arrebentou: a faixa de X da seção, do alto ao rodapé */}
        {(() => {
          const secao = SECOES.find((item) => item.id === breakSection);
          if (!secao) return null;
          const x0 = px(secao.x0);
          const x1 = px(secao.x1);
          return (
            <g aria-label="Seção da quebra">
              <rect
                x={x0}
                width={Math.max(2, x1 - x0)}
                y={0}
                height={alturaFaixa * 2 + ENTRE_FAIXAS}
                fill="var(--color-alarm-1)"
                fillOpacity={0.12}
              />
              <text
                x={(x0 + x1) / 2}
                y={10}
                textAnchor="middle"
                className="fill-alarm-1 text-[9px]"
              >
                quebra aqui
              </text>
            </g>
          );
        })()}

        {(['LC', 'LA'] as const).map((lado, indice) => (
          <g key={lado} transform={`translate(0 ${String(indice * (alturaFaixa + ENTRE_FAIXAS))})`}>
            <Faixa
              lado={lado}
              altura={alturaFaixa}
              largura={width}
              px={px}
              py={py}
              escala={escala}
              zonas={zonas}
              selected={selected}
              sobCursor={sobCursor}
              onHover={setSobCursor}
              onSelect={onSelect}
            />
          </g>
        ))}

        <Rodape y={alturaFaixa * 2 + ENTRE_FAIXAS} px={px} quebra={breakSection} />
      </svg>
    </div>
  );
}

function Faixa({
  lado,
  altura,
  largura,
  px,
  py,
  escala,
  zonas,
  selected,
  sobCursor,
  onHover,
  onSelect,
}: {
  readonly lado: 'LA' | 'LC';
  readonly altura: number;
  readonly largura: number;
  readonly px: (x: number) => number;
  readonly py: (y: number) => number;
  readonly escala: number;
  readonly zonas: ReadonlyMap<string, IsoZone | null>;
  readonly selected: string | null;
  readonly sobCursor: string | null;
  readonly onHover: (tag: string | null) => void;
  readonly onSelect: ((assetTag: string) => void) | undefined;
}) {
  return (
    <>
      <rect width={largura} height={altura} fill="var(--color-base)" fillOpacity={0.4} />
      <line x1={0} x2={largura} y1={altura - 0.5} y2={altura - 0.5} stroke="var(--color-line)" />
      <text x={2} y={9} className="fill-fg-3 text-[9px]" style={{ letterSpacing: '0.04em' }}>
        {LADO_LABEL[lado].toUpperCase()}
      </text>

      {CORPOS.map((corpo) => {
        const tag = corpo[lado];
        if (!tag) return null;
        const zona = zonas.get(tag) ?? null;
        const cx = px(corpo.x);
        const cy = py(corpo.y);
        const raio = Math.max(RAIO_MIN, corpo.raioM * escala);
        const escolhido = tag === selected;
        const ponto = Math.max(1.8, Math.min(3.2, raio - 1.4));
        /**
         * A área de clique é maior que o ponto, e menor que meio vão.
         *
         * O ponto tem 3 px; mirar 3 px com o mouse é um exercício de pontaria.
         * O teto é o meio do vão entre dois cilindros da mesma fileira — passar
         * disso faria um alvo roubar o clique do vizinho.
         */
        const alvo = Math.max(4, Math.min(8, escala * 1.05));
        const rotulo = `${corpo.label} · lado ${lado === 'LC' ? 'comando' : 'acionamento'} · ${
          zona === null ? 'sem leitura' : `zona ${zona}`
        }`;

        return (
          <g
            key={tag}
            role={onSelect ? 'button' : undefined}
            aria-label={onSelect ? rotulo : undefined}
            aria-current={escolhido ? 'true' : undefined}
            className={onSelect ? 'cursor-pointer' : undefined}
            onClick={
              onSelect
                ? () => {
                    onSelect(tag);
                  }
                : undefined
            }
            onMouseEnter={() => {
              onHover(tag);
            }}
            onMouseLeave={() => {
              onHover(null);
            }}
          >
            <title>{rotulo}</title>
            <circle cx={cx} cy={cy} r={alvo} fill="transparent" />
            <circle
              cx={cx}
              cy={cy}
              r={raio}
              fill="var(--color-cell)"
              stroke={tag === sobCursor ? 'var(--color-fg-2)' : 'var(--color-line-strong)'}
            />
            {zona === null ? (
              <circle
                cx={cx}
                cy={cy}
                r={ponto}
                fill="none"
                stroke="var(--color-fg-3)"
                strokeDasharray="1 1.5"
              />
            ) : (
              <circle cx={cx} cy={cy} r={ponto} fill={COR_ZONA[zona]} />
            )}
            {escolhido ? (
              <circle
                cx={cx}
                cy={cy}
                r={raio + 3}
                fill="none"
                stroke="var(--color-action)"
                strokeWidth={1.4}
              />
            ) : null}
          </g>
        );
      })}
    </>
  );
}

/**
 * As seções, na ordem do processo.
 *
 * O rótulo só aparece quando cabe na faixa da seção — Speed Sizer, calandra e
 * Pope são um corpo só cada uma, e o nome delas tem mais pixels que a própria
 * seção. Onde não cabe fica o traço, que já diz que ali começa outra coisa.
 */
function Rodape({
  y,
  px,
  quebra,
}: {
  readonly y: number;
  readonly px: (x: number) => number;
  readonly quebra: string | null;
}) {
  return (
    <g transform={`translate(0 ${String(y)})`}>
      {SECOES.map((secao) => {
        const inicio = px(secao.x0);
        const fim = px(secao.x1);
        const meio = (inicio + fim) / 2;
        const cabe = fim - inicio >= secao.label.length * 5.4;
        const aqui = secao.id === quebra;
        const cor = aqui ? 'var(--color-alarm-1)' : 'var(--color-line-strong)';

        return (
          <g key={secao.id}>
            <line x1={inicio} x2={fim} y1={2.5} y2={2.5} stroke={cor} strokeWidth={aqui ? 2 : 1} />
            <line x1={inicio} x2={inicio} y1={0} y2={5} stroke={cor} />
            <line x1={fim} x2={fim} y1={0} y2={5} stroke={cor} />
            {cabe ? (
              <text
                x={meio}
                y={14}
                textAnchor="middle"
                className={`text-[9px] ${aqui ? 'fill-alarm-1' : 'fill-fg-3'}`}
              >
                {secao.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
