"""
O prédio, em dois níveis.

A máquina fica num piso de operação elevado, que é o `Y = 0` de todas as medidas
do modelo. O térreo fica em `GROUND_FLOOR_Y_M`, 6 m abaixo.

Sob a secagem, a pós-secagem e a Pope o piso de operação é **aberto**: o vão
desce até o térreo, e é por ele que se vê o refugo, os pilares e a tubulação de
vapor e condensado. Sob a parte úmida o piso é fechado, e as plataformas de três
níveis da úmida ficam acima dele.

Não há galpão: paredes, telhado, treliças e claraboias saíram, e a cena é a
máquina sobre o seu piso, com luz de estúdio. Ficam o piso de operação, o
térreo, os pilares e vigas do mezanino, as escadas e os guarda-corpos — tudo na
mesma zona de bake.

No térreo só entra o que pertence à máquina. Preparo de massa fica fora, e o
layout da planta não é reproduzido além do que está descrito aqui.
"""

import random
from math import atan2, cos, sin

from mathutils import Matrix

import bmesh
from parts import M, area_light, box, cyl, link, poly_tube

#: Tudo deste módulo vai para a zona do prédio.
Z = "predio"

# Paredes, em coordenadas do Blender (lado comando em Y negativo).
X0, X1 = M["BUILDING_X0_M"], M["BUILDING_X1_M"]
Y_LC = -M["BUILDING_Z_LC_M"]
Y_LA = -M["BUILDING_Z_LA_M"]

GROUND = M["GROUND_FLOOR_Y_M"]
SLAB = M["OPERATING_FLOOR_THICKNESS_M"]
OPENINGS = M["OPERATING_FLOOR_OPENINGS"]
PITCH = M["MEZZANINE_COLUMN_PITCH_M"]

#: Largura do vão aberto, em Y: acompanha a máquina, não o prédio inteiro.
PIT_Y0, PIT_Y1 = -(M["WALKWAY_Z1_M"] + 0.4), M["WEB_WIDTH_M"] / 2 + 2.4


def _closed_spans():
    """Os trechos de X em que o piso de operação é fechado — o complemento dos vãos."""
    edges = [X0]
    for o in OPENINGS:
        edges += [o["from"], o["to"]]
    edges.append(X1)
    return [(a, b) for a, b in zip(edges[0::2], edges[1::2]) if b - a > 0.05]


def operating_floor():
    """
    A laje do piso de operação, com os vãos abertos.

    A laje é desenhada em tiras: fora da faixa da máquina ela é contínua, e
    dentro dela só existe onde o piso é fechado. É o que deixa o vão aberto sem
    precisar de operação booleana.
    """
    # faixas contínuas dos dois lados da máquina
    for nm, (a, b) in {
        "piso_lc": (PIT_Y0, Y_LC),
        "piso_la": (PIT_Y1, Y_LA),
    }.items():
        box(nm, ((X0 + X1) / 2, (a + b) / 2, -SLAB / 2), (X1 - X0, abs(b - a), SLAB), "piso", zone=Z)

    # dentro da faixa da máquina, só onde é fechado
    for a, b in _closed_spans():
        box(
            f"piso_maq{a:.1f}",
            ((a + b) / 2, (PIT_Y0 + PIT_Y1) / 2, -SLAB / 2),
            (b - a, abs(PIT_Y1 - PIT_Y0), SLAB),
            "piso",
            zone=Z,
        )

    # bordas dos vãos: viga de contorno e guarda-corpo
    for o in OPENINGS:
        for x in (o["from"], o["to"]):
            box(
                f"borda_x{x:.1f}",
                (x, (PIT_Y0 + PIT_Y1) / 2, -0.25),
                (0.3, abs(PIT_Y1 - PIT_Y0), 0.5),
                "laje",
                zone=Z,
            )
            _rail_y(f"gcvao_x{x:.1f}", x, PIT_Y0, PIT_Y1)
        for y in (PIT_Y0, PIT_Y1):
            box(
                f"borda_y{o['from']:.1f}{y:.1f}",
                ((o["from"] + o["to"]) / 2, y, -0.25),
                (o["to"] - o["from"], 0.3, 0.5),
                "laje",
                zone=Z,
            )
            _rail_x(f"gcvao_y{o['from']:.1f}{y:.1f}", o["from"], o["to"], y)


def _rail_x(name, x0, x1, y):
    """Guarda-corpo ao longo de X, no nível do piso de operação."""
    for zz in (1.1, 0.55):
        poly_tube(f"{name}_r{zz}", [(x0, y, zz), (x1, y, zz)], 0.024, "guarda_corpo", zone=Z)
    x = x0
    while x <= x1 + 1e-6:
        poly_tube(f"{name}_p{x:.1f}", [(x, y, 0), (x, y, 1.1)], 0.024, "guarda_corpo", zone=Z)
        x += 1.5
    box(f"{name}_rodape", ((x0 + x1) / 2, y, 0.06), (x1 - x0, 0.02, 0.12), "guarda_corpo", zone=Z)


def _rail_y(name, x, y0, y1):
    """Guarda-corpo ao longo de Y, fechando a cabeceira de um vão."""
    for zz in (1.1, 0.55):
        poly_tube(f"{name}_r{zz}", [(x, y0, zz), (x, y1, zz)], 0.024, "guarda_corpo", zone=Z)
    y = y0
    while y <= y1 + 1e-6:
        poly_tube(f"{name}_p{y:.1f}", [(x, y, 0), (x, y, 1.1)], 0.024, "guarda_corpo", zone=Z)
        y += 1.5


def mezzanine():
    """Pilares e vigas que sustentam o piso de operação, vistos de dentro do vão."""
    xs = []
    x = X0 + PITCH / 2
    while x < X1:
        xs.append(x)
        x += PITCH
    ys = [PIT_Y0 + 0.4, (PIT_Y0 + PIT_Y1) / 2, PIT_Y1 - 0.4, Y_LC + 2.0, Y_LA - 2.0]

    for x in xs:
        for y in ys:
            box(
                f"mez_pilar{x:.0f}_{y:.0f}",
                (x, y, (GROUND + -SLAB) / 2),
                (0.42, 0.42, abs(GROUND) - SLAB),
                "pilar",
                zone=Z,
                bevel=0.02,
            )
    # vigas principais no sentido transversal, sob a laje
    for x in xs:
        box(
            f"mez_viga{x:.0f}",
            (x, (Y_LC + Y_LA) / 2, -SLAB - 0.3),
            (0.34, Y_LA - Y_LC, 0.6),
            "trelica",
            zone=Z,
        )
    # vigas longitudinais
    for y in ys:
        box(
            f"mez_long{y:.0f}",
            ((X0 + X1) / 2, y, -SLAB - 0.75),
            (X1 - X0, 0.26, 0.5),
            "trelica",
            zone=Z,
        )


def ground_floor():
    """O térreo: laje, refugo sob a secagem, tubulação e pilares da máquina."""
    box(
        "terreo",
        ((X0 + X1) / 2, (Y_LC + Y_LA) / 2, GROUND - 0.15),
        (X1 - X0, Y_LA - Y_LC, 0.3),
        "fosso",
        zone=Z,
    )

    # pilhas de refugo embaixo dos vãos da secagem
    random.seed(7)
    for i, o in enumerate(OPENINGS):
        cx = (o["from"] + o["to"]) / 2
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
        for v in bm.verts:
            n = 0.12 * sin(5 * v.co.x + 2) * cos(4 * v.co.y) + random.uniform(-0.05, 0.05)
            v.co *= 1 + n
            v.co.z = max(v.co.z, -0.1)
        bmesh.ops.scale(bm, vec=(min(6.0, (o["to"] - o["from"]) / 3), 2.4, 0.8), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(cx, -1.0, GROUND), verts=bm.verts)
        link(f"refugo_{i}", bm, "refugo", zone=Z, smooth=True)

    # tubulação de vapor e condensado correndo no térreo, no lado comando
    for y, r, mat in ((PIT_Y0 + 0.6, 0.16, "tubo_isolado"), (PIT_Y0 + 1.1, 0.11, "tubo_vermelho")):
        poly_tube(
            f"terreo_tubo{r}",
            [(X0 + 2, y, GROUND + 1.6), (X1 - 2, y, GROUND + 1.6)],
            r,
            mat,
            zone=Z,
        )
    # tanques separadores de condensado, um por grupo de vapor visível no vão
    for i, o in enumerate(OPENINGS[:2]):
        for k in range(2):
            x = o["from"] + (k + 1) * (o["to"] - o["from"]) / 3
            cyl(
                f"tanque_{i}{k}",
                (x, PIT_Y0 + 2.2, GROUND + 1.5),
                0.7,
                3.0,
                "tubo_isolado",
                axis="Z",
                seg=32,
                zone=Z,
            )

    # Luminárias do térreo: poucas e fortes. Sem paredes, a luz do estúdio
    # já entra pelos lados; estas só garantem o miolo sob a laje. A versão
    # anterior tinha 38, e foram elas que levaram o bake de uma zona a 83 min.
    lamp_z = -SLAB - 0.45
    x = X0 + 14
    while x < X1 - 8:
        for y in (PIT_Y0 - 4.0, PIT_Y1 + 4.0):
            box(f"lamp_terreo{x:.0f}_{y:.0f}", (x, y, lamp_z), (2.4, 0.4, 0.1), "lampada", zone=Z)
            area_light(f"al_terreo{x:.0f}_{y:.0f}", (x, y, lamp_z - 0.1), 2.4, 1400, sy=0.4, shape="RECTANGLE")
        x += 24.0


def stairs():
    """Escada entre o térreo e o piso de operação, num trecho de piso fechado."""
    x = M["GROUND_STAIR_X_M"]
    y = PIT_Y0 - 1.6
    n = 28
    rise = abs(GROUND) / n
    run = 0.26
    for k in range(n):
        box(
            f"degrau{k}",
            (x - run * k, y, GROUND + rise * (k + 1)),
            (run + 0.02, 1.2, 0.05),
            "passarela",
            zone=Z,
        )
    for sg in (-0.62, 0.62):
        length = ((run * n) ** 2 + abs(GROUND) ** 2) ** 0.5
        ang = atan2(abs(GROUND), -run * n)
        box(
            f"banzo{sg}",
            (x - run * n / 2, y + sg, GROUND + abs(GROUND) / 2),
            (length, 0.1, 0.26),
            "estrutura",
            zone=Z,
            rot=Matrix.Rotation(ang, 4, "Y"),
        )
        box(
            f"corrimao{sg}",
            (x - run * n / 2, y + sg, GROUND + abs(GROUND) / 2 + 1.0),
            (length, 0.05, 0.05),
            "guarda_corpo",
            zone=Z,
            rot=Matrix.Rotation(ang, 4, "Y"),
        )
    # patamar no piso de operação
    box("patamar", (x + 0.9, y, -SLAB / 2), (1.8, 1.4, SLAB), "passarela", zone=Z)


def floor_markings():
    """Faixas de piso no corredor do lado comando e na cabeça da escada."""
    box("faixa_corredor", ((X0 + X1) / 2, PIT_Y0 - 2.6, 0.004), (X1 - X0 - 2, 0.12, 0.008), "faixa_amarela", zone=Z)
    box(
        "faixa_escada",
        (M["GROUND_STAIR_X_M"] + 1.0, PIT_Y0 - 1.6, 0.006),
        (3.2, 1.8, 0.008),
        "faixa_zebrada",
        zone=Z,
    )


def perimeter_rail():
    """
    Guarda-corpo na borda do piso de operação.

    Sem as paredes do galpão, a borda do piso é uma queda de 6 m para o térreo.
    """
    for y in (Y_LC, Y_LA):
        _rail_x(f"gcborda_y{y:.0f}", X0, X1, y)
    for x in (X0, X1):
        _rail_y(f"gcborda_x{x:.0f}", x, Y_LC, Y_LA)


def build_building():
    operating_floor()
    mezzanine()
    ground_floor()
    stairs()
    floor_markings()
    perimeter_rail()
