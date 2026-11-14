import { Panel } from '../ui/Panel';

/**
 * Laboratório: matriz bobina × ensaio, carta de controle, fila e lab × QCS.
 *
 * A tela chega na fase (c) do porte para o design novo. Até lá, a tecla 3 abre
 * este aviso em vez de levar a lugar nenhum.
 */
export function LaboratorioScreen() {
  return (
    <Panel title="Laboratório" context="bobina × ensaio · carta de controle · fila · lab × QCS">
      <p role="status" className="text-[13px] text-fg-2">
        Tela em construção — entra na fase (c) do porte para o design novo.
      </p>
    </Panel>
  );
}
