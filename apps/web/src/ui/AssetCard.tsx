import { isoLimitsOf, type MachineAsset } from '@mp1/shared';

/**
 * O que a cena sabe sobre o ativo clicado.
 *
 * Por enquanto só o que vem do modelo. A vibração medida, o histórico e o
 * diagnóstico entram na Fase 3, quando a API passar a responder por tag.
 */

const KIND_LABEL: Record<MachineAsset['kind'], string> = {
  'dryer-cylinder': 'Cilindro secador',
  roll: 'Rolo',
  bearing: 'Mancal',
  scanner: 'Scanner',
  nip: 'Nip',
  'reel-drum': 'Tambor de enroladeira',
};

const SIDE_LABEL = {
  LA: 'lado acionamento',
  LC: 'lado comando',
} as const;

export interface AssetCardProps {
  readonly asset: MachineAsset;
  readonly onClose: () => void;
}

export function AssetCard({ asset, onClose }: AssetCardProps) {
  const limits = asset.iso ? isoLimitsOf(asset.iso) : null;

  return (
    <aside className="absolute top-4 right-4 w-80 rounded-xl border border-mill-line bg-mill-panel/92 p-4 backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{asset.label}</h2>
          <p className="mt-0.5 font-mono text-[11px] break-all text-mill-muted">{asset.tag}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="ml-auto rounded-md px-2 py-0.5 text-mill-muted hover:bg-white/5"
        >
          ×
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Field label="Tipo" value={KIND_LABEL[asset.kind]} />
        {asset.side && <Field label="Lado" value={`${asset.side} · ${SIDE_LABEL[asset.side]}`} />}
        {asset.driveGroup && <Field label="Grupo" value={asset.driveGroup} />}
        <Field label="Posição" value={asset.position.map((n) => n.toFixed(1)).join(' · ') + ' m'} />
      </dl>

      {limits && (
        <div className="mt-3 rounded-lg border border-mill-line bg-black/20 p-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-mill-muted uppercase">
            Limites ISO 20816-3
          </p>
          <p className="mt-1 font-mono text-xs">
            A|B {limits.aToB} · B|C {limits.bToC} · C|D {limits.cToD}
            <span className="text-mill-muted"> mm/s</span>
          </p>
          <p className="mt-1.5 text-[11px] text-mill-muted">
            Sem leitura: a vibração medida entra na Fase 3.
          </p>
        </div>
      )}

      {asset.source === 'assumed' && (
        <p className="mt-3 rounded-lg border border-mill-attention/25 bg-mill-attention/8 px-2.5 py-2 text-[11px] text-mill-attention">
          Posição e existência deste ativo ainda são suposição do protótipo, à espera do mapa de
          rolos.
        </p>
      )}
    </aside>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-mill-muted">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}
