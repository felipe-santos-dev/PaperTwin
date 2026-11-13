"""
A máquina, da caixa de entrada à enroladeira.

Nenhuma posição de ativo é escrita aqui: tudo que é ativo vem de `machine.json`,
e o que é desenho — capota, estrutura, passarela, tubulação, telas, folha — sai
das medidas do mesmo arquivo. Mexer em `geometry.ts` e reexportar é o caminho
inteiro.

O que **não** é desenhado aqui são as carcaças dos mancais: elas viram malhas
vivas na cena, uma por ativo `bearing`, coloridas pela zona da ISO 20816-3 e
clicáveis. O que fica no bake é o que não responde a clique — munhão, junta de
vapor, mangueira, caixa de junção, proteção e pedestal.
"""

from math import atan2, cos, hypot, pi, radians, sin

from mathutils import Matrix

import geom
from parts import (
    DATA,
    M,
    MACHINE_ZONES,
    MODEL,
    area_light,
    box,
    cyl,
    poly_tube,
    ribbon,
    ribbon_split,
    tube,
    zone_for_x,
)

#: As faixas dos grupos de vapor, que são também a unidade das telas e do bake.
STEAM_GROUPS = DATA["steamGroups"]

# ------------------------------------------------------- medidas derivadas
FACE = M["WEB_WIDTH_M"]
R = M["DRYER_RADIUS_M"]
Z_TOP = M["DRYER_TOP_Y_M"]
Z_BOT = M["DRYER_BOTTOM_Y_M"]

# Plano dos mancais; a parede da capota fica entre a ponta da mesa e ele, e o
# munhão atravessa a parede — é o que acontece na máquina, com vedação.
Y_FRAME = M["BEARING_Z_M"]
Y_WALL = (FACE / 2 + Y_FRAME) / 2
Y_COL = Y_FRAME + 0.5

W_PAPER = FACE - 0.1
W_FELT = FACE + 0.1

#: Altura em que a capota se divide entre portas de baixo e de cima.
Z_SPLIT = (Z_TOP + Z_BOT) / 2

#: Topo da capota. Tem de passar do laço de retorno da tela superior.
HOOD_TOP = Z_TOP + 4.3

#: Largura das portas da capota; o passo de 2,2 m deixa 0,6 m de painel entre elas.
DOOR_W = 1.6

#: Ângulo em que as portas de cima são assadas, abertas.
DOOR_OPEN_DEG = 68.0

WALK_Y = M["WALKWAY_Y_M"]
WALK_Z0, WALK_Z1 = M["WALKWAY_Z0_M"], M["WALKWAY_Z1_M"]

#: Coletores de vapor e condensado, no lado comando, atrás da passarela.
HEADER_Y = -(WALK_Z1 - 0.25)

#: Relatório de mecânica, impresso junto com o corte lateral.
REPORT = []


def assets(kind, section=None):
    """Ativos do modelo por tipo, opcionalmente de uma seção só."""
    return [
        a
        for s in MODEL["sections"]
        if section is None or s["id"] == section
        for a in s["assets"]
        if a["kind"] == kind
    ]


def cylinder_number(tag):
    return int(tag.rsplit("-CS", 1)[1])


# ------------------------------------------------------------- cilindros
def dryer_cylinder(asset):
    """Corpo, cabeças, munhões e caixa de engrenagem de um cilindro secador."""
    x, y, _ = asset["position"]
    cs = cylinder_number(asset["tag"])
    radius = asset["radius"]
    zone = zone_for_x(x)

    cyl(f"CS{cs}", (x, 0, y), radius, FACE, "cil_ferro", seg=72, zone=zone)
    for sg in (-1, 1):
        cyl(
            f"cab{cs}{sg}",
            (x, sg * (FACE / 2 + 0.03), y),
            radius * 0.97,
            0.06,
            "cil_cabeca",
            seg=72,
            zone=zone,
        )
        cyl(
            f"munhao{cs}{sg}",
            (x, sg * (FACE / 2 + 0.35), y),
            0.19,
            0.6,
            "munhao",
            seg=32,
            zone=zone,
        )
    # acionamento fica no lado +Y do Blender (lado acionamento da máquina)
    box(f"engr{cs}", (x, Y_FRAME + 0.55, y), (1.5, 0.4, 1.5), "estrutura", zone=zone, bevel=0.04)


def bearing_hardware(asset):
    """
    O que acompanha um mancal e não é a carcaça dele.

    A carcaça é malha viva na cena. Aqui ficam o pedestal, a proteção, a junta
    rotativa de vapor e a mangueira que desce para o coletor — tudo que o
    operador vê em volta do mancal e que não responde a clique.
    """
    x, y, z = asset["position"]
    parent = asset["parentTag"]
    if "-CS" not in parent:
        return
    cs = cylinder_number(parent)
    side = asset["side"]
    # three z positivo = lado comando = Y negativo no Blender
    by = -z
    sg = -1 if side == "LC" else 1
    zone = zone_for_x(x)

    # pedestal sob o mancal, até a viga da estrutura
    base = Z_SPLIT - 0.35 if y > Z_SPLIT else 0.35
    box(
        f"ped_{cs}_{side}",
        (x, by, (base + y - 0.42) / 2),
        (0.5, 0.34, abs(y - 0.42 - base)),
        "estrutura",
        zone=zone,
        bevel=0.02,
    )

    if side != "LC":
        return

    # junta rotativa de vapor, proteção e caminho do condensado
    box(f"protecao_{cs}", (x, by + sg * 0.5, y), (0.44, 0.3, 0.44), "protecao_amarela", zone=zone, bevel=0.02)
    cyl(f"flange_{cs}", (x, by + sg * 0.69, y), 0.15, 0.05, "junta_latao", seg=24, zone=zone)
    cyl(f"junta_{cs}", (x, by + sg * 0.85, y), 0.11, 0.28, "junta_latao", seg=24, zone=zone)
    cyl(
        f"cotovelo_{cs}",
        (x, by + sg * 0.95, y - 0.12),
        0.045,
        0.2,
        "junta_latao",
        axis="Z",
        seg=12,
        zone=zone,
    )
    jb = (x + 0.42, by - 0.05, y + 0.55)
    box(f"cxj_{cs}", jb, (0.16, 0.12, 0.22), "caixa_juncao", zone=zone, bevel=0.01)
    tube(
        f"cabo_{cs}",
        [(x, by, y + 0.38), (x + 0.2, by - 0.02, y + 0.62), (jb[0] - 0.08, jb[1], jb[2])],
        0.008,
        "mangueira",
        zone=zone,
    )

    # mangueira até o coletor: o de cima na altura da passarela, o de baixo no piso
    top_tier = y > Z_SPLIT
    hz = WALK_Y + 0.42 if top_tier else 0.32
    tube(
        f"mangueira_{cs}",
        [
            (x, by - 0.97, y - 0.22),
            (x + 0.05, by - 1.1, y - 0.55),
            (x + 0.25, HEADER_Y, hz + 0.5),
            (x + 0.3, HEADER_Y, hz + 0.12),
        ],
        0.045,
        "mangueira",
        zone=zone,
        section_hidden=True,
    )


# ------------------------------------------------------------ telas e folha
def felts(section_id):
    """
    Uma tela por fileira e por grupo de vapor.

    Grupo é a unidade em que a secagem é operada, e também é a unidade do
    lightmap — assim cada tela nasce dentro de uma zona só.
    """
    for group in STEAM_GROUPS:
        if group["section"] != section_id:
            continue
        row_cylinders = [
            (a["position"][0], a["position"][1])
            for a in assets("dryer-cylinder", section_id)
            if group["from"] <= cylinder_number(a["tag"]) <= group["to"]
        ]
        top, bottom = geom.dryer_rows(row_cylinders, Z_TOP, Z_BOT)
        for name, row, upper in (("sup", top, True), ("inf", bottom, False)):
            if len(row) < 2:
                continue
            circles = geom.felt_loop(
                row,
                upper,
                R,
                M["FELT_ROLL_RISE_M"],
                M["FELT_ROLL_RADIUS_M"],
                M["FELT_CLEARANCE_M"],
                M["DRYER_PITCH_M"],
            )
            pts = geom.belt(circles, closed=True)
            tag = f"tela_{group['id']}_{name}"
            ribbon(tag, pts, W_FELT, "feltro", 0.006, zone=f"{group['id'].lower()}")

            gap, lo, hi = geom.check_felt(
                row, upper, R, M["FELT_ROLL_RISE_M"], M["FELT_ROLL_RADIUS_M"], M["FELT_CLEARANCE_M"], M["DRYER_PITCH_M"]
            )
            REPORT.append(
                f"tela {group['id']} {name}: {len(row)} cilindros · folga {gap:+.3f} m · abraço {lo:.0f}°–{hi:.0f}°"
            )

            # rolos de retorno e de laço, com munhão e mancal próprios
            for j, (c, r, _s) in enumerate(circles):
                if r > R * 0.8:
                    continue
                zone = zone_for_x(c[0])
                cyl(
                    f"rolo_{tag}_{j}",
                    (c[0], 0, c[1]),
                    r - 0.008,
                    W_FELT + 0.3,
                    "rolo_feltro",
                    seg=40,
                    zone=zone,
                )
                for sg in (-1, 1):
                    cyl(
                        f"rolo_eixo_{tag}_{j}{sg}",
                        (c[0], sg * (W_FELT / 2 + 0.16), c[1]),
                        0.07,
                        0.12,
                        "munhao",
                        seg=16,
                        zone=zone,
                    )
                    box(
                        f"rolo_mancal_{tag}_{j}{sg}",
                        (c[0], sg * (W_FELT / 2 + 0.17), c[1]),
                        (0.22, 0.08, 0.26),
                        "mancal_corpo",
                        zone=zone,
                        bevel=0.015,
                    )


def paper_web():
    """
    A folha, da prensa de sapata à enroladeira.

    A pré-secagem é percorrida começando pela fileira **inferior**, para a folha
    sair do último cilindro **superior** e correr horizontal até a pós-secagem —
    é o que a medida validada `DRY_SECTION_WEB_Y_M` descreve. Com 13 pares, um
    percurso que começasse em cima terminaria embaixo.
    """
    rp = R + M["PAPER_CLEARANCE_M"]
    web_y = M["DRY_SECTION_WEB_Y_M"]

    press_nip = (M["PRESS_X_M"], (M["PRESS_BOTTOM_Y_M"] + M["PRESS_TOP_Y_M"]) / 2)
    first_nip = (M["FIRST_PRESS_X_M"], (M["PRESS_BOTTOM_Y_M"] + M["PRESS_TOP_Y_M"]) / 2 - 0.6)

    # a folha na parte úmida: do jato da caixa de entrada até o nip da sapata.
    # Pontos de passagem, não abraços: a parte úmida é geometria de referência,
    # e um abraço errado ali chamaria mais atenção que a linha certa.
    wet = [
        ((M["HEADBOX_X_M"] + 1.6, M["HEADBOX_Y_M"] - 0.4), 0, 1),
        ((M["FORMING_X0_M"], M["FORMING_WIRE_Y_M"] + M["FORMING_ROLL_RADIUS_M"]), 0, 1),
        ((-5.6, 3.86), 0, 1),
        ((-2.8, 4.66), 0, 1),
        (first_nip, 0, 1),
    ]
    pre = [(a["position"][0], a["position"][1]) for a in assets("dryer-cylinder", "pre-dryer")]
    post = [(a["position"][0], a["position"][1]) for a in assets("dryer-cylinder", "post-dryer")]
    pre_top, pre_bot = geom.dryer_rows(pre, Z_TOP, Z_BOT)
    post_top, post_bot = geom.dryer_rows(post, Z_TOP, Z_BOT)

    circles = [*wet, (press_nip, 0, 1)]

    # pré-secagem: inferior primeiro, para terminar num cilindro superior
    for i in range(len(pre_top)):
        if i < len(pre_bot):
            circles.append((pre_bot[i], rp, 1))
        circles.append((pre_top[i], rp, -1))
    REPORT.append(
        f"folha · pré-secagem: entra em CS{2} (inferior) e sai de CS{len(pre_top) * 2 - 1} (superior) a {Z_TOP:.2f} m"
    )

    # trecho horizontal: scanner 1 e nip do Speed Sizer
    circles.append(((M["SCANNER_1_X_M"], web_y), 0, 1))
    circles.append(((M["SIZER_X_M"], web_y), 0, 1))

    # pós-secagem: superior primeiro, para sair embaixo em direção à calandra
    for i in range(len(post_top)):
        circles.append((post_top[i], rp, -1))
        if i < len(post_bot):
            circles.append((post_bot[i], rp, 1))

    circles.append(((M["CALENDER_X_M"], M["CALENDER_NIP_Y_M"]), 0, 1))
    circles.append(((M["SCANNER_2_X_M"], M["SCANNER_2_Y_M"]), 0, 1))
    circles.append(
        (((M["POPE_X_M"], M["POPE_DRUM_Y_M"]), M["POPE_DRUM_RADIUS_M"] + 0.01, -1))
    )

    pts = geom.belt(circles, closed=False)
    ribbon_split("papel", pts, W_PAPER, "papel", 0.003)


# -------------------------------------------------------------------- capota
def hood(span, tag):
    """
    Capota de uma secagem: teto, parede do lado acionamento e, no lado comando,
    painéis e portas basculantes.

    As portas de cima giram todas em torno da **mesma** linha de dobradiça, no
    topo da capota. É o que deixa a cena abri-las no shader com um uniform de
    ângulo, sem separar malha nenhuma: a linha é a mesma nas duas capotas.
    """
    x0, x1 = span["from"], span["to"]
    zone_mid = zone_for_x((x0 + x1) / 2)
    mid = (x0 + x1) / 2

    box(
        f"capota_teto_{tag}",
        (mid, 0, HOOD_TOP + 0.1),
        (x1 - x0 + 0.3, 2 * Y_WALL + 0.3, 0.2),
        "capota_painel",
        zone=zone_mid,
    )
    # parede do lado acionamento
    for seg_x0, seg_x1 in split_by_zone(x0, x1):
        zone = zone_for_x((seg_x0 + seg_x1) / 2)
        box(
            f"capota_la_{tag}_{seg_x0:.1f}",
            ((seg_x0 + seg_x1) / 2, Y_WALL, HOOD_TOP / 2),
            (seg_x1 - seg_x0, 0.12, HOOD_TOP),
            "capota_painel",
            zone=zone,
        )
    for x in (x0, x1):
        box(
            f"capota_ext_{tag}{x:.1f}",
            (x, 0, HOOD_TOP / 2),
            (0.12, 2 * Y_WALL, HOOD_TOP),
            "capota_painel",
            zone=zone_for_x(x),
        )

    # as portas de baixo ficam nos X dos cilindros de cima, e vice-versa
    tops = sorted({a["position"][0] for a in _hood_cylinders(span) if a["position"][1] > Z_SPLIT})
    bots = sorted({a["position"][0] for a in _hood_cylinders(span) if a["position"][1] <= Z_SPLIT})

    _wall_fill(x0, x1, 0.0, Z_SPLIT, tops, f"{tag}inf")
    _wall_fill(x0, x1, Z_SPLIT, HOOD_TOP, bots, f"{tag}sup")
    for seg_x0, seg_x1 in split_by_zone(x0, x1):
        box(
            f"capota_faixa_{tag}_{seg_x0:.1f}",
            ((seg_x0 + seg_x1) / 2, -Y_WALL - 0.04, Z_SPLIT),
            (seg_x1 - seg_x0, 0.16, 0.12),
            "capota_moldura",
            zone=zone_for_x((seg_x0 + seg_x1) / 2),
            section_hidden=True,
        )

    for i, x in enumerate(tops):
        _door(x, Z_SPLIT - 0.03, Z_SPLIT - 0.08, 0.0, f"{tag}i{i}")
    for i, x in enumerate(bots):
        _door(x, HOOD_TOP - 0.03, HOOD_TOP - Z_SPLIT - 0.08, DOOR_OPEN_DEG, f"{tag}s{i}")

    # Luminárias internas, reforçadas: com as portas de cima abertas, é por
    # elas que se vê cilindro, mancal e tela, e nada ali pode ficar em silhueta.
    # Três linhas — alto dos dois lados e a meia altura no lado acionamento,
    # entre os dois níveis —, uma luminária a cada dois passos.
    x = x0 + 1.6
    while x < x1 - 1:
        zone = zone_for_x(x)
        for nm, y, z, watts in (
            ("lc", -Y_WALL + 0.45, HOOD_TOP - 0.15, 900),
            ("la", Y_WALL - 0.45, HOOD_TOP - 0.15, 900),
            ("meio", Y_WALL - 0.3, Z_SPLIT, 600),
        ):
            box(f"lamp_capota_{tag}{nm}{x:.1f}", (x, y, z), (1.2, 0.12, 0.06), "lampada", zone=zone)
            light = area_light(f"al_capota_{tag}{nm}{x:.1f}", (x, y, z - 0.1), 1.2, watts, sy=0.2, shape="RECTANGLE")
            if nm == "meio":
                # virada para dentro, para lavar a face dos cilindros de baixo
                light.rotation_euler = (radians(-90), 0, 0)
        x += 2 * M["DRYER_PITCH_M"]

    # dutos de exaustão
    x = x0 + 3.0
    while x < x1 - 2:
        cyl(f"duto_{tag}{x:.1f}", (x, 0.8, HOOD_TOP + 3.6), 0.6, 7.0, "duto", axis="Z", seg=40, zone=zone_for_x(x))
        cyl(
            f"duto_base_{tag}{x:.1f}",
            (x, 0.8, HOOD_TOP + 0.35),
            0.75,
            0.3,
            "duto",
            axis="Z",
            seg=40,
            zone=zone_for_x(x),
        )
        x += 9.0


def _hood_cylinders(span):
    return [
        a
        for a in assets("dryer-cylinder")
        if span["from"] <= a["position"][0] <= span["to"]
    ]


def split_by_zone(x0, x1):
    """Corta um trecho de X nas fronteiras das zonas, para nada ficar entre dois lightmaps."""
    cuts = [x0]
    for z in MACHINE_ZONES:
        b = z["span"]["to"]
        if x0 < b < x1:
            cuts.append(b)
    cuts.append(x1)
    return list(zip(cuts[:-1], cuts[1:]))


def _wall_fill(x0, x1, z0, z1, door_xs, tag):
    edges = [x0] + [e for x in door_xs for e in (x - DOOR_W / 2, x + DOOR_W / 2)] + [x1]
    for a, b in zip(edges[0::2], edges[1::2]):
        if b - a <= 0.02:
            continue
        for sa, sb in split_by_zone(a, b):
            box(
                f"painel_{tag}{sa:.2f}",
                ((sa + sb) / 2, -Y_WALL, (z0 + z1) / 2),
                (sb - sa, 0.12, z1 - z0),
                "capota_painel",
                zone=zone_for_x((sa + sb) / 2),
                section_hidden=True,
            )
    for x in door_xs:
        for e in (x - DOOR_W / 2, x + DOOR_W / 2):
            box(
                f"batente_{tag}{e:.2f}",
                (e, -Y_WALL - 0.08, (z0 + z1) / 2),
                (0.08, 0.06, z1 - z0),
                "capota_moldura",
                zone=zone_for_x(e),
                section_hidden=True,
            )


def _door(x, z_top, h, angle, tag):
    """
    Porta basculante, com o pivô no topo, abrindo para fora.

    As de cima são assadas **abertas**: é por elas que a luz do estúdio entra na
    capota, e é assim que a cena abre. A cena as fecha no shader girando de
    volta em torno da mesma linha de dobradiça, com `DOOR_OPEN_DEG` como zero
    de referência.
    """
    zone = zone_for_x(x)
    hinge = Matrix.Translation((x, -Y_WALL - 0.1, z_top)) @ Matrix.Rotation(-radians(angle), 4, "X")

    def part(nm, c, s, mat, bev=0.0):
        box(
            f"{nm}_{tag}",
            (0, 0, 0),
            s,
            mat,
            zone=zone,
            bevel=bev,
            rot=hinge @ Matrix.Translation(c),
            section_hidden=True,
        )

    part("porta", (0, 0, -h / 2), (DOOR_W - 0.04, 0.09, h - 0.03), "capota_porta", 0.015)
    wz0, wz1 = -0.25, -0.25 - h * 0.55
    for cx in (-0.36, 0.36):
        for k in range(3):
            zc = wz0 + (wz1 - wz0) * (k + 0.5) / 3
            part(f"vidro{cx}{k}", (cx, -0.05, zc), (0.58, 0.02, (wz0 - wz1) / 3 - 0.1), "vidro")
    for cx in (-0.7, 0.0, 0.7):
        part(f"montante{cx}", (cx, -0.065, (wz0 + wz1) / 2), (0.07, 0.04, wz0 - wz1 + 0.07), "porta_moldura")
    for k in range(4):
        zc = wz0 + (wz1 - wz0) * k / 3
        part(f"travessa{k}", (0, -0.065, zc), (DOOR_W - 0.11, 0.04, 0.07), "porta_moldura")
    part("puxador", (0, -0.12, -h + 0.25), (0.5, 0.05, 0.05), "porta_moldura")


# ------------------------------------------------- estrutura e passarela
def frame(span, tag):
    """Colunas e vigas que sustentam os cilindros, nos dois lados da máquina."""
    x0, x1 = span["from"], span["to"]
    pitch = M["DRYER_PITCH_M"]
    xs = []
    x = x0 + 0.55
    while x < x1:
        xs.append(x)
        x += pitch
    for sg in (-1, 1):
        y = sg * Y_COL
        for x in xs:
            box(
                f"col_{tag}{x:.2f}{sg}",
                (x, y, (HOOD_TOP - 0.6) / 2),
                (0.28, 0.36, HOOD_TOP - 0.6),
                "estrutura",
                zone=zone_for_x(x),
                section_hidden=sg < 0,
            )
        for zb in (0.18, Z_SPLIT - 0.2, HOOD_TOP - 0.6):
            for sa, sb in split_by_zone(x0, x1):
                box(
                    f"viga_{tag}{zb}{sg}{sa:.1f}",
                    ((sa + sb) / 2, y, zb),
                    (sb - sa, 0.36, 0.34),
                    "estrutura",
                    zone=zone_for_x((sa + sb) / 2),
                    section_hidden=sg < 0,
                )


def walkway(span, tag):
    """Passarela de operação no lado comando, com guarda-corpo."""
    x0, x1 = span["from"], span["to"]
    y0, y1 = -WALK_Z0, -WALK_Z1
    for sa, sb in split_by_zone(x0, x1):
        zone = zone_for_x((sa + sb) / 2)
        box(
            f"passarela_{tag}{sa:.1f}",
            ((sa + sb) / 2, (y0 + y1) / 2, WALK_Y - 0.04),
            (sb - sa, abs(y0 - y1), 0.08),
            "passarela",
            zone=zone,
            section_hidden=True,
        )
        for yy in (y0 - 0.05, y1 + 0.05):
            box(
                f"pass_viga_{tag}{sa:.1f}{yy:.1f}",
                ((sa + sb) / 2, yy, WALK_Y - 0.2),
                (sb - sa, 0.1, 0.24),
                "estrutura",
                zone=zone,
                section_hidden=True,
            )
        for zz in (WALK_Y + 1.1, WALK_Y + 0.55):
            poly_tube(
                f"gc_rail_{tag}{sa:.1f}{zz:.2f}",
                [(sa, y1 + 0.05, zz), (sb, y1 + 0.05, zz)],
                0.024,
                "guarda_corpo",
                zone=zone,
                section_hidden=True,
            )
    x = x0
    while x <= x1 + 1e-6:
        poly_tube(
            f"gc_post_{tag}{x:.1f}",
            [(x, y1 + 0.05, WALK_Y), (x, y1 + 0.05, WALK_Y + 1.1)],
            0.024,
            "guarda_corpo",
            zone=zone_for_x(x),
            section_hidden=True,
        )
        x += 1.3
    # colunas da passarela
    x = x0 + 0.3
    while x < x1:
        box(
            f"pass_col_{tag}{x:.1f}",
            (x, y1 + 0.1, WALK_Y / 2 - 0.1),
            (0.14, 0.14, WALK_Y - 0.2),
            "estrutura",
            zone=zone_for_x(x),
            section_hidden=True,
        )
        x += 2.6


def steam_headers(span, tag):
    """Coletores de vapor e de condensado ao longo da secagem, no lado comando."""
    x0, x1 = span["from"] - 0.2, span["to"] + 0.2
    for sa, sb in split_by_zone(x0, x1):
        zone = zone_for_x((sa + sb) / 2)
        poly_tube(
            f"coletor_vapor_sup_{tag}{sa:.1f}",
            [(sa, HEADER_Y, WALK_Y + 0.42), (sb, HEADER_Y, WALK_Y + 0.42)],
            0.13,
            "tubo_isolado",
            zone=zone,
            section_hidden=True,
        )
        poly_tube(
            f"coletor_cond_inf_{tag}{sa:.1f}",
            [(sa, HEADER_Y, 0.32), (sb, HEADER_Y, 0.32)],
            0.11,
            "tubo_vermelho",
            zone=zone,
            section_hidden=True,
        )
        poly_tube(
            f"coletor_vapor_inf_{tag}{sa:.1f}",
            [(sa, HEADER_Y - 0.32, 0.32), (sb, HEADER_Y - 0.32, 0.32)],
            0.12,
            "tubo_isolado",
            zone=zone,
            section_hidden=True,
        )


def drying_section(section_id, span, tag):
    for a in assets("dryer-cylinder", section_id):
        dryer_cylinder(a)
    for a in assets("bearing", section_id):
        bearing_hardware(a)
    felts(section_id)
    hood(span, tag)
    frame(span, tag)
    walkway(span, tag)
    steam_headers(span, tag)
