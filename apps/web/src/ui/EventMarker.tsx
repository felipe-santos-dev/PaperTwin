/**
 * Marcadores de evento da linha do tempo: quebra, gramatura, alarme, setpoint e
 * bobina. Cada tipo tem uma forma, para dar para distinguir mesmo sem cor:
 * quadrado vermelho, triângulo, losango âmbar, círculo vazado, quadrado rosa.
 */
export type EventKind = 'quebra' | 'gramatura' | 'alarme' | 'setpoint' | 'bobina';

export const EVENT_LABEL: Readonly<Record<EventKind, string>> = {
  quebra: 'Quebra',
  gramatura: 'Gramatura',
  alarme: 'Alarme',
  setpoint: 'Setpoint',
  bobina: 'Bobina',
};

/** O símbolo do evento, em SVG, num quadro de 10 × 10. */
export function EventGlyph({
  kind,
  size = 10,
}: {
  readonly kind: EventKind;
  readonly size?: number;
}) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 10 10" className="shrink-0">
      {kind === 'quebra' ? (
        <rect x={0} y={2} width={10} height={6} fill="var(--color-alarm-1)" />
      ) : null}
      {kind === 'gramatura' ? <path d="M5 1 L9.5 9 L0.5 9 Z" fill="var(--color-fg-2)" /> : null}
      {kind === 'alarme' ? (
        <path d="M5 0.5 L9.5 5 L5 9.5 L0.5 5 Z" fill="var(--color-alarm-2)" />
      ) : null}
      {kind === 'setpoint' ? (
        <circle cx={5} cy={5} r={3.6} fill="none" stroke="var(--color-fg-2)" strokeWidth={1.5} />
      ) : null}
      {kind === 'bobina' ? (
        <rect x={1} y={1} width={8} height={8} fill="var(--color-spec-out)" />
      ) : null}
    </svg>
  );
}

/** Símbolo e texto: o marcador como aparece na linha do tempo e na legenda. */
export function EventMarker({
  kind,
  children,
  className = '',
}: {
  readonly kind: EventKind;
  readonly children?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] text-fg-2 ${className}`}>
      <EventGlyph kind={kind} />
      {children ?? EVENT_LABEL[kind].toLowerCase()}
    </span>
  );
}
