import {
  CanvasTexture,
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/**
 * Texturas e materiais da cena, desenhados em canvas 2D.
 *
 * Nada de arquivo de imagem: a máquina é cinza e metálica, e o que a tira do
 * aspecto de plástico é a sujeira — manchas de óleo, escorridos, marcas de uso.
 * Isso se desenha com ruído determinístico mais barato do que se baixa.
 *
 * Tudo aqui é criado uma vez e reaproveitado por toda a cena: são 36 cilindros
 * secadores dividindo o mesmo material. Como são singletons vivos enquanto a
 * aba existir, não há `dispose()` — o que também evita uso-após-descarte quando
 * o StrictMode monta o componente duas vezes.
 */

/** Gerador determinístico, para a textura sair igual em toda sessão. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

function texture(width: number, height: number, draw: Draw, repeat: [number, number]): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponível');
  draw(ctx, width, height);

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Pintura encardida: respingos claros e escuros, mais escorridos verticais. */
function grime(base: string): Texture {
  const rand = makeRandom(11);
  return texture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i += 1) {
        const dark = rand() < 0.5;
        const tone = dark ? 60 : 255;
        ctx.fillStyle = `rgba(${String(tone)},${String(tone)},${String(dark ? 70 : 255)},${String(rand() * 0.08)})`;
        ctx.fillRect(rand() * w, rand() * h, rand() * 6, rand() * 6);
      }
      for (let i = 0; i < 60; i += 1) {
        ctx.fillStyle = `rgba(70,65,55,${String(rand() * 0.12)})`;
        ctx.fillRect(rand() * w, rand() * h * 0.5, 1 + rand() * 3, h * rand());
      }
    },
    [2, 2],
  );
}

const concrete = (): Texture => {
  const rand = makeRandom(23);
  return texture(
    1024,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = '#7d7a72';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 14000; i += 1) {
        const v = Math.floor(90 + rand() * 80);
        ctx.fillStyle = `rgba(${String(v)},${String(v - 3)},${String(v - 10)},.25)`;
        ctx.fillRect(rand() * w, rand() * h, 2, 2);
      }
      for (let i = 0; i < 40; i += 1) {
        const x = rand() * w;
        const y = rand() * h;
        const r = 20 + rand() * 120;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, 'rgba(55,52,45,.35)');
        gradient.addColorStop(1, 'rgba(55,52,45,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      // juntas de dilatação do piso
      ctx.strokeStyle = 'rgba(40,38,34,.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= w; i += 256) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(w, i);
        ctx.stroke();
      }
    },
    [14, 6],
  );
};

/** Aço polido do cilindro secador, com marcas para a rotação ficar visível. */
const dryerSkin = (): Texture => {
  const rand = makeRandom(31);
  return texture(
    512,
    64,
    (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, '#c9ced4');
      gradient.addColorStop(0.5, '#aab1b9');
      gradient.addColorStop(1, '#c9ced4');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i += 1) {
        ctx.fillStyle = `rgba(90,80,60,${String(rand() * 0.12)})`;
        ctx.fillRect(rand() * w, 0, 1 + rand() * 4, h);
      }
      ctx.fillStyle = 'rgba(60,55,45,.35)';
      ctx.fillRect(0, 0, 10, h);
      ctx.fillRect(w / 2, 0, 6, h);
    },
    [1, 1],
  );
};

/** Papel: a formação em flocos é o que deixa o movimento perceptível. */
const paperSheet = (): Texture => {
  const rand = makeRandom(43);
  return texture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#ece8dc';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i += 1) {
        const r = 4 + rand() * 18;
        ctx.fillStyle = `rgba(${String(rand() < 0.5 ? 200 : 255)},${String(rand() < 0.5 ? 194 : 250)},${String(rand() < 0.5 ? 180 : 240)},${String(0.08 + rand() * 0.12)})`;
        ctx.beginPath();
        ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [1, 1],
  );
};

/** Parede da capota: chapas verticais com escorridos. */
const hoodPanel = (): Texture => {
  const rand = makeRandom(53);
  return texture(
    1024,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#dadddf';
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) {
        ctx.fillStyle = 'rgba(0,0,0,.06)';
        ctx.fillRect(x, 0, 2, h);
      }
      for (let i = 0; i < 120; i += 1) {
        ctx.fillStyle = `rgba(90,85,70,${String(rand() * 0.08)})`;
        ctx.fillRect(rand() * w, rand() * h, 2, h * rand());
      }
    },
    [1, 1],
  );
};

/** Porta da capota: moldura, quatro janelas em grade e faixa amarela. */
const hoodDoor = (): Texture => {
  const rand = makeRandom(67);
  return texture(
    256,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#dfe2e3';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 2; col += 1) {
          const x = w * 0.14 + col * w * 0.38;
          const y = h * 0.07 + row * h * 0.2;
          ctx.fillStyle = '#3f4852';
          ctx.fillRect(x, y, w * 0.34, h * 0.17);
          ctx.fillStyle = 'rgba(255,255,255,.22)';
          ctx.fillRect(x + 4, y + 4, w * 0.12, h * 0.05);
        }
      }
      ctx.fillStyle = '#e2b419';
      ctx.fillRect(w * 0.42, h * 0.86, w * 0.16, h * 0.04);
      for (let i = 0; i < 60; i += 1) {
        ctx.fillStyle = `rgba(90,85,70,${String(rand() * 0.1)})`;
        ctx.fillRect(rand() * w, rand() * h, 2, h * rand() * 0.5);
      }
    },
    [1, 1],
  );
};

/** Piso de grade das plataformas. */
const grating = (): Texture =>
  texture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#3a3d40';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#b9bcbf';
      for (let i = 0; i < w; i += 8) ctx.fillRect(i, 0, 3, h);
      for (let j = 0; j < h; j += 32) ctx.fillRect(0, j, w, 3);
    },
    [8, 2],
  );

function build() {
  const paperMap = paperSheet();

  return {
    /** O mapa do papel é animado em UV para a folha parecer correr. */
    paperMap,

    dryer: new MeshStandardMaterial({ map: dryerSkin(), roughness: 0.28, metalness: 0.85 }),
    steel: new MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.3, metalness: 0.9 }),
    rubber: new MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.55, metalness: 0.1 }),
    paint: new MeshStandardMaterial({
      color: 0xd2d5d8,
      map: grime('#e4e6e8'),
      roughness: 0.62,
      metalness: 0.25,
    }),
    paintDark: new MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.3 }),
    frameDark: new MeshStandardMaterial({ color: 0x34373c, roughness: 0.6, metalness: 0.4 }),
    white: new MeshStandardMaterial({ color: 0xeceeef, roughness: 0.5, metalness: 0.1 }),

    bearingBlue: new MeshStandardMaterial({ color: 0x5fa6d0, roughness: 0.45, metalness: 0.3 }),
    /** Mancal sob o cursor e mancal selecionado: três materiais, não um por mancal. */
    bearingHovered: new MeshStandardMaterial({
      color: 0x8fd0e8,
      emissive: 0x2a6f93,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.3,
    }),
    bearingSelected: new MeshStandardMaterial({
      color: 0xb6a4ff,
      emissive: 0x7d6cf0,
      emissiveIntensity: 1.1,
      roughness: 0.35,
      metalness: 0.3,
    }),
    bearingBlueDark: new MeshStandardMaterial({ color: 0x3d7fae, roughness: 0.5, metalness: 0.3 }),
    capCream: new MeshStandardMaterial({ color: 0xe6dcc0, roughness: 0.5, metalness: 0.2 }),
    capBlue: new MeshStandardMaterial({ color: 0x8fd0e8, roughness: 0.4, metalness: 0.2 }),
    brass: new MeshStandardMaterial({ color: 0xb88a4a, roughness: 0.35, metalness: 0.85 }),
    hose: new MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.7 }),
    yellow: new MeshStandardMaterial({ color: 0xe2b419, roughness: 0.55 }),

    concrete: new MeshStandardMaterial({
      map: concrete(),
      roughness: 0.28,
      metalness: 0.05,
      color: 0xa6a39c,
    }),
    grating: new MeshStandardMaterial({ map: grating(), roughness: 0.6, metalness: 0.5 }),
    hoodWall: new MeshStandardMaterial({ map: hoodPanel(), roughness: 0.6 }),
    hoodDoor: new MeshStandardMaterial({ map: hoodDoor(), roughness: 0.55, metalness: 0.1 }),

    paper: new MeshStandardMaterial({
      map: paperMap,
      roughness: 0.85,
      side: DoubleSide,
      color: 0xffffff,
    }),
    fabric: new MeshStandardMaterial({ color: 0x3d4a52, roughness: 0.9, side: DoubleSide }),

    calenderThermal: new MeshStandardMaterial({ color: 0xc4cad1, roughness: 0.15, metalness: 1 }),
    calenderSoft: new MeshStandardMaterial({ color: 0x3f5568, roughness: 0.5, metalness: 0.1 }),
    thermalHousing: new MeshStandardMaterial({ color: 0xd0442e, roughness: 0.5 }),

    scannerFrame: new MeshStandardMaterial({ color: 0x24324f, roughness: 0.5, metalness: 0.4 }),
    scannerHead: new MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.35, metalness: 0.3 }),
    /** Emissivo forte: é só o que o bloom deve pegar. */
    laser: new MeshStandardMaterial({
      color: 0xff3a3a,
      emissive: 0xff2020,
      emissiveIntensity: 6,
    }),
    lamp: new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff3e0,
      emissiveIntensity: 4,
    }),
  };
}

export type Materials = ReturnType<typeof build>;

let cached: Materials | null = null;

/** Os materiais da cena, criados na primeira chamada e reaproveitados depois. */
export function materials(): Materials {
  cached ??= build();
  return cached;
}
