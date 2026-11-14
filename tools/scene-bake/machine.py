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

from math import atan2, radians

from mathutils import Matrix

import geom
import wet
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

WALK_Y = M["WALKWAY_Y_M"]

#: Térreo, 6 m abaixo do piso de operação.
GROUND = M["GROUND_FLOOR_Y_M"]
WALK_Z0, WALK_Z1 = M["WALKWAY_Z0_M"], M["WALKWAY_Z1_M"]

#: Coletores de vapor e condensado: no lado comando, junto ao piso.
HEADER_Y = -(WALK_Z1 - 0.25)

#: Acima disto nada fica na frente dos mancais do lado comando.
LC_CLEAR_Z = 1.0

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

    # Pedestal sob o mancal. No lado acionamento ele assenta na viga da
    # estrutura; no lado comando, onde não há estrutura na frente dos mancais,
    # cada mancal de cima tem a sua coluna até a soleira junto ao piso. As
    # colunas ficam no plano dos mancais, e os de cima e os de baixo estão
    # meio passo defasados — então nenhuma coluna passa na frente de mancal.
    if side == "LC" or y <= Z_SPLIT:
        base = 0.35
    else:
        base = Z_SPLIT - 0.35
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

    # Condensado: um flexível curto da junta até um tubo rígido, que desce
    # rente ao pedestal até o coletor junto ao piso. O tubo fica ao lado do
    # pedestal, não na frente do mancal, e só se afasta para o coletor abaixo
    # de `LC_CLEAR_Z`.
    pipe_x = x + 0.32
    pipe_y = by - 0.7
    top = y - 0.42
    tube(
        f"flexivel_{cs}",
        [(x, by - 0.97, y - 0.2), (x + 0.12, by - 0.9, y - 0.36), (pipe_x, pipe_y, top)],
        0.04,
        "mangueira",
        zone=zone,
        section_hidden=True,
    )
    poly_tube(
        f"tubo_cond_{cs}",
        [
            (pipe_x, pipe_y, top),
            (pipe_x, pipe_y, 0.6),
            (pipe_x, HEADER_Y + 0.15, 0.6),
            (pipe_x, HEADER_Y + 0.15, 0.32 + 0.12),
        ],
        0.035,
        "tubo_vermelho",
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
            # a mesma conta que `wet.py` confere: um laço por fileira e grupo
            circles = wet.dryer_loops()[f"tela_{group['id']}_{name}"]
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
    A folha, do lábio da caixa de entrada à enroladeira.

    Na pré-secagem a folha anda sempre para a frente, alternando os níveis, e
    sai do último cilindro de baixo para a linha horizontal de
    `DRY_SECTION_WEB_Y_M`, que é medida validada.
    """
    rp = R + M["PAPER_CLEARANCE_M"]
    web_y = M["DRY_SECTION_WEB_Y_M"]

    pre = [(a["position"][0], a["position"][1]) for a in assets("dryer-cylinder", "pre-dryer")]
    post = [(a["position"][0], a["position"][1]) for a in assets("dryer-cylinder", "post-dryer")]
    pre_top, pre_bot = geom.dryer_rows(pre, Z_TOP, Z_BOT)
    post_top, post_bot = geom.dryer_rows(post, Z_TOP, Z_BOT)

    # a parte úmida vem de `wet.py`, até o rolo de transferência
    circles = list(wet.paper_circles())

    # pré-secagem: serpentina para a frente, de CS2 a CS26 (ver `wet.py`)
    pre_path = wet.pre_dryer_paper()
    circles += pre_path
    REPORT.append(
        f"folha · pré-secagem: {len(pre_path)} cilindros, entra no de baixo em x {pre_path[0][0][0]:.1f} "
        f"e sai do de baixo em x {pre_path[-1][0][0]:.1f}"
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
    Capota de uma secagem: teto, parede do lado acionamento e as duas
    extremidades. O lado comando é aberto do piso ao teto — sem painel, porta,
    batente, moldura nem faixa —, e por ele se veem os dois níveis de
    cilindros, as telas e o vão do porão embaixo.

    A extremidade de entrada da pré-secagem tem uma fenda embaixo: é por ela
    que o feltro da prensa de sapata entra com a folha até o rolo de
    transferência.
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
        bottom = _entry_slot(x) if tag == "pre" and x == x0 else 0.0
        box(
            f"capota_ext_{tag}{x:.1f}",
            (x, 0, (HOOD_TOP + bottom) / 2),
            (0.12, 2 * Y_WALL, HOOD_TOP - bottom),
            "capota_painel",
            zone=zone_for_x(x),
        )

    # Luminárias internas, reforçadas: com o lado comando aberto, é por ali que
    # se vê cilindro, mancal e tela, e nada ali pode ficar em silhueta.
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


def _entry_slot(x):
    """
    Até que altura a extremidade de entrada fica aberta: o ponto mais alto em
    que um laço da parte úmida ou a folha atravessam o plano dela, com folga.
    """
    lines = [geom.belt(c, closed=True) for _m, c in wet.loops().values()]
    lines.append(geom.belt(wet.paper_circles(), closed=False))
    ys = []
    for pts in lines:
        for (ax, ay), (bx, by) in zip(pts[:-1], pts[1:]):
            if (ax - x) * (bx - x) <= 0 and ax != bx:
                ys.append(ay + (by - ay) * (x - ax) / (bx - ax))
    return (max(ys) + 0.4) if ys else 0.0


# ------------------------------------------------- estrutura e passarela
def frame(span, tag):
    """
    Colunas e vigas que sustentam os cilindros.

    No lado acionamento, a estrutura de sempre: colunas a cada passo e vigas em
    três alturas. No lado comando não há coluna nem viga na frente dos mancais —
    cada mancal tem o seu pedestal até uma soleira junto ao piso, e no alto fica
    só a viga de borda da capota, apoiada nas paredes de topo.
    """
    x0, x1 = span["from"], span["to"]
    pitch = M["DRYER_PITCH_M"]
    xs = []
    x = x0 + 0.55
    while x < x1:
        xs.append(x)
        x += pitch
    # O piso de operação é aberto sob a secagem: as colunas do lado
    # acionamento descem até o térreo, e no lado comando a soleira dos
    # pedestais assenta em pilaretes até o térreo, nos mesmos X. Todos ficam
    # abaixo do piso de operação, longe da frente dos mancais.
    for x in xs:
        box(
            f"col_{tag}{x:.2f}",
            (x, Y_COL, (HOOD_TOP - 0.6 + GROUND) / 2),
            (0.28, 0.36, HOOD_TOP - 0.6 - GROUND),
            "estrutura",
            zone=zone_for_x(x),
        )
        box(
            f"pilarete_lc_{tag}{x:.2f}",
            (x, -Y_FRAME, GROUND / 2),
            (0.3, 0.36, -GROUND),
            "estrutura",
            zone=zone_for_x(x),
            section_hidden=True,
        )
    for sa, sb in split_by_zone(x0, x1):
        zone = zone_for_x((sa + sb) / 2)
        for zb in (0.18, Z_SPLIT - 0.2, HOOD_TOP - 0.6):
            box(
                f"viga_{tag}{zb}{sa:.1f}",
                ((sa + sb) / 2, Y_COL, zb),
                (sb - sa, 0.36, 0.34),
                "estrutura",
                zone=zone,
            )
        # lado comando: soleira no plano dos mancais e viga de borda da capota
        box(
            f"soleira_{tag}{sa:.1f}",
            ((sa + sb) / 2, -Y_FRAME, 0.18),
            (sb - sa, 0.4, 0.34),
            "estrutura",
            zone=zone,
            section_hidden=True,
        )
        box(
            f"viga_borda_{tag}{sa:.1f}",
            ((sa + sb) / 2, -Y_WALL, HOOD_TOP - 0.15),
            (sb - sa, 0.3, 0.3),
            "estrutura",
            zone=zone,
            section_hidden=True,
        )


def walkway(x0, x1, tag, stair=True):
    """
    Passarela de operação no lado acionamento, com guarda-corpo e escada.

    A escada sobe do piso de operação ao longo da máquina e chega na cabeceira
    da passarela, dentro da mesma faixa — não avança para o lado de fora.
    """
    y0, y1 = WALK_Z0, WALK_Z1
    for sa, sb in split_by_zone(x0, x1):
        zone = zone_for_x((sa + sb) / 2)
        box(
            f"passarela_{tag}{sa:.1f}",
            ((sa + sb) / 2, (y0 + y1) / 2, WALK_Y - 0.04),
            (sb - sa, y1 - y0, 0.08),
            "passarela",
            zone=zone,
        )
        for yy in (y0 + 0.05, y1 - 0.05):
            box(
                f"pass_viga_{tag}{sa:.1f}{yy:.1f}",
                ((sa + sb) / 2, yy, WALK_Y - 0.2),
                (sb - sa, 0.1, 0.24),
                "estrutura",
                zone=zone,
            )
        for zz in (WALK_Y + 1.1, WALK_Y + 0.55):
            poly_tube(
                f"gc_rail_{tag}{sa:.1f}{zz:.2f}",
                [(sa, y1 - 0.05, zz), (sb, y1 - 0.05, zz)],
                0.024,
                "guarda_corpo",
                zone=zone,
            )
        box(
            f"gc_rodape_{tag}{sa:.1f}",
            ((sa + sb) / 2, y1 - 0.05, WALK_Y + 0.06),
            (sb - sa, 0.02, 0.12),
            "guarda_corpo",
            zone=zone,
        )
    x = x0
    while x <= x1 + 1e-6:
        poly_tube(
            f"gc_post_{tag}{x:.1f}",
            [(x, y1 - 0.05, WALK_Y), (x, y1 - 0.05, WALK_Y + 1.1)],
            0.024,
            "guarda_corpo",
            zone=zone_for_x(x),
        )
        x += 1.3
    # colunas da passarela, dos dois lados da faixa
    x = x0 + 0.3
    while x < x1:
        for yy in (y0 + 0.1, y1 - 0.1):
            box(
                f"pass_col_{tag}{x:.1f}{yy:.1f}",
                (x, yy, WALK_Y / 2 - 0.1),
                (0.14, 0.14, WALK_Y - 0.2),
                "estrutura",
                zone=zone_for_x(x),
            )
        x += 2.6
    if stair:
        _walkway_stair(x0, tag)


def _walkway_stair(x_top, tag):
    """Escada do piso de operação até a cabeceira da passarela, subindo em +X."""
    n = 17
    rise = WALK_Y / n
    run = 0.26
    yc = (WALK_Z0 + WALK_Z1) / 2
    width = min(1.0, WALK_Z1 - WALK_Z0 - 0.2)
    x_foot = x_top - run * n
    zone = zone_for_x(x_top - run * n / 2)
    for k in range(n):
        box(
            f"pass_degrau_{tag}{k}",
            (x_foot + run * (k + 0.5), yc, rise * (k + 1) - 0.03),
            (run + 0.02, width, 0.05),
            "passarela",
            zone=zone,
        )
    length = ((run * n) ** 2 + WALK_Y**2) ** 0.5
    ang = -atan2(WALK_Y, run * n)
    for sg in (-1, 1):
        yy = yc + sg * (width / 2 + 0.05)
        box(
            f"pass_banzo_{tag}{sg}",
            (x_foot + run * n / 2, yy, WALK_Y / 2),
            (length, 0.08, 0.24),
            "estrutura",
            zone=zone,
            rot=Matrix.Rotation(ang, 4, "Y"),
        )
        poly_tube(
            f"pass_corrimao_{tag}{sg}",
            [(x_foot, yy, 1.0), (x_top, yy, WALK_Y + 1.0)],
            0.024,
            "guarda_corpo",
            zone=zone,
        )


def steam_headers(span, tag):
    """Coletores de vapor e de condensado ao longo da secagem, no lado comando, junto ao piso."""
    x0, x1 = span["from"] - 0.2, span["to"] + 0.2
    for sa, sb in split_by_zone(x0, x1):
        zone = zone_for_x((sa + sb) / 2)
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
    steam_headers(span, tag)
