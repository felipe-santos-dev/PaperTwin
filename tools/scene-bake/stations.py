"""
As estações da máquina fora da secagem.

Parte úmida (caixa de entrada, gap former, pick-up, primeira prensa e prensa de
sapata), scanners, Speed Sizer, calandra e enroladeira Pope.

Por onde corre cada tela, feltro e a folha da parte úmida é decidido em
`wet.py`, sem Blender, e conferido lá mesmo: nenhum laço cruza outro, a folha
ou um rolo alheio. Aqui o corte lateral vira malha.

Posição de ativo nenhuma é escrita aqui. Os rolos-guia não são ativos: ficam
em volta dos rolos principais, em afastamentos de desenho.
"""

import bmesh
from mathutils import Matrix, Vector

import geom
import wet
from machine import FACE, assets, split_by_zone
from parts import M, area_light, box, cyl, link, poly_tube, ribbon_split, zone_for_x

#: Plano dos mancais.
BZ = M["BEARING_Z_M"]

#: Face dos rolos da parte úmida: passa um pouco da tela, que passa da folha.
ROLL_FACE = FACE + 0.3
W_WIRE = FACE + 0.1
W_FELT = FACE
W_PAPER = FACE - 0.1

#: Raio dos rolos-guia de tela e de feltro.
RG = wet.RG

#: Onde o montante de apoio do lado acionamento fica, um pouco para fora do
#: plano dos cavaletes.
Y_POST = BZ + 0.45

#: Os vãos abertos do piso: um montante sobre eles desce até o térreo.
OPENINGS = M["OPERATING_FLOOR_OPENINGS"]
GROUND = M["GROUND_FLOOR_Y_M"]


def floor_under(x):
    """O piso sob um X: o de operação, ou o térreo onde o piso é aberto."""
    return GROUND if any(o["from"] <= x <= o["to"] for o in OPENINGS) else 0.0


def roll_with_housing(name, x, z, r, mat, length=None, housing="mancal_corpo"):
    """Rolo com cubo e munhão nos dois lados — o desenho padrão de rolo da máquina."""
    length = length or FACE
    zone = zone_for_x(x)
    cyl(name, (x, 0, z), r, length, mat, seg=48, zone=zone)
    for sg in (-1, 1):
        cyl(f"{name}_cub{sg}", (x, sg * (length / 2 + 0.2), z), r * 1.1, 0.4, housing, seg=40, zone=zone)
        cyl(f"{name}_eixo{sg}", (x, sg * (length / 2 + 0.45), z), r * 0.28, 0.45, "munhao", seg=24, zone=zone)


# ------------------------------------------------------------- parte úmida
def main_roll(tag, mat, column=True):
    """
    Rolo principal: corpo, tampas e munhões até o plano dos mancais.

    A carcaça do mancal é malha viva na cena, como na secagem. Aqui fica o que
    a sustenta: uma coluna até o piso em cada lado, no plano dos mancais — nada
    na frente dele. O corpo usa o raio **desenhado** de `wet.py`, que nos nips
    é um pouco menor que o do modelo para feltro e folha caberem.
    """
    (x, y), r_draw = wet.main_rolls()[tag]
    r = wet.roll(tag)[2]
    name = tag.rsplit("-", 1)[1]
    zone = zone_for_x(x)
    cyl(name, (x, 0, y), r_draw, ROLL_FACE, mat, seg=72, zone=zone)
    rb = r * M["BEARING_RADIUS_RATIO"]
    for sg in (-1, 1):
        cyl(f"{name}_tampa{sg}", (x, sg * (ROLL_FACE / 2 + 0.02), y), r_draw * 0.96, 0.04, "cil_cabeca", seg=72, zone=zone)
        cyl(f"{name}_munhao{sg}", (x, sg * (ROLL_FACE / 2 + 0.32), y), max(0.08, r * 0.26), 0.6, "munhao", seg=24, zone=zone)
        if column:
            top = y - rb - 0.02
            box(f"{name}_coluna{sg}", (x, sg * BZ, top / 2), (0.34, 0.4, top), "estrutura", zone=zone, bevel=0.02, section_hidden=sg < 0)
    return x, y, r


def press_stand(x, y_bottom, y_top, r_bottom, r_top, name, load=False):
    """
    Cavalete de prensa, um em cada lado, no plano dos mancais.

    Dois montantes flanqueiam os mancais, uma travessa fecha em cima e um
    braço desce dela até o mancal do rolo de cima. O de baixo assenta na sua
    própria coluna. Nada fica na frente de mancal nenhum.
    """
    zone = zone_for_x(x)
    rbb = r_bottom * M["BEARING_RADIUS_RATIO"]
    rbt = r_top * M["BEARING_RADIUS_RATIO"]
    half = max(rbb, rbt) + 0.35
    top = y_top + rbt + 0.9
    for sg in (-1, 1):
        hidden = sg < 0
        for dx in (-half, half):
            box(f"{name}_montante{sg}{dx:+.1f}", (x + dx, sg * BZ, top / 2), (0.3, 0.42, top), "estrutura", zone=zone, bevel=0.02, section_hidden=hidden)
        box(f"{name}_travessa{sg}", (x, sg * BZ, top - 0.2), (2 * half + 0.3, 0.42, 0.4), "estrutura", zone=zone, bevel=0.02, section_hidden=hidden)
        hang = top - 0.4 - (y_top + rbt + 0.02)
        box(f"{name}_braco{sg}", (x, sg * BZ, y_top + rbt + 0.02 + hang / 2), (0.36, 0.36, hang), "estrutura", zone=zone, section_hidden=hidden)
        if load:
            # cilindros de carga da sapata, sobre a travessa
            for dx in (-0.35, 0.35):
                cyl(f"{name}_carga{sg}{dx:+.1f}", (x + dx, sg * BZ, top + 0.4), 0.18, 0.8, "munhao", axis="Z", seg=24, zone=zone, section_hidden=hidden)
        box(f"{name}_coluna_inf{sg}", (x, sg * BZ, (y_bottom - rbb - 0.02) / 2), (0.34, 0.4, y_bottom - rbb - 0.02), "estrutura", zone=zone, bevel=0.02, section_hidden=hidden)


def la_post(name, x, z, y_from):
    """Montante do lado acionamento, do piso até `z`, preso por um braço a `y_from`."""
    zone = zone_for_x(x)
    base = floor_under(x)
    box(f"{name}_braco", (x, (y_from + Y_POST) / 2, z), (0.12, Y_POST - y_from + 0.12, 0.12), "estrutura_clara", zone=zone)
    box(f"{name}_montante", (x, Y_POST, (z + 0.06 + base) / 2), (0.14, 0.14, z + 0.06 - base), "estrutura_clara", zone=zone)


def guide_roll(name, x, z, r=RG):
    """
    Rolo-guia de tela ou de feltro, com munhão e bloco de mancal nas pontas.

    O apoio fica só no lado acionamento: um montante fino até o piso. No lado
    comando o rolo fica em balanço, como nas máquinas de troca de tela pelo
    lado comando.
    """
    zone = zone_for_x(x)
    cyl(name, (x, 0, z), r - 0.006, ROLL_FACE, "rolo_feltro", seg=40, zone=zone)
    for sg in (-1, 1):
        cyl(f"{name}_eixo{sg}", (x, sg * (ROLL_FACE / 2 + 0.08), z), 0.07, 0.16, "munhao", seg=16, zone=zone)
        box(f"{name}_mancal{sg}", (x, sg * (ROLL_FACE / 2 + 0.2), z), (0.24, 0.12, 0.28), "mancal_corpo", zone=zone, bevel=0.015, section_hidden=sg < 0)
    la_post(name, x, z, ROLL_FACE / 2 + 0.2)


def prism(name, outline, width, mat, zone):
    """Polígono do corte lateral esticado na largura da máquina."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -width / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, width / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, mat, zone)


def motor(name, x, z, side_y):
    """
    Motor de acionamento no lado acionamento: base, motor, luva e eixo.

    Coaxial com o rolo, sobre um pedestal até o piso. A luva fica sob uma
    proteção amarela, que é o que se reconhece de longe.
    """
    zone = zone_for_x(x)
    body_y = side_y + 1.05
    cyl(f"{name}_corpo", (x, body_y, z), 0.36, 0.62, "motor", seg=40, zone=zone)
    cyl(f"{name}_tampa", (x, body_y + 0.35, z), 0.3, 0.08, "munhao", seg=32, zone=zone)
    for k in range(6):
        cyl(f"{name}_aleta{k}", (x, body_y - 0.24 + k * 0.095, z), 0.39, 0.025, "motor", seg=40, zone=zone)
    box(f"{name}_luva", (x, side_y + 0.55, z), (0.42, 0.34, 0.42), "protecao_amarela", zone=zone, bevel=0.02)
    box(f"{name}_pe", (x, body_y, (z - 0.36) / 2), (0.7, 0.7, z - 0.36), "estrutura", zone=zone, bevel=0.02)
    box(f"{name}_base", (x, body_y, 0.06), (1.0, 0.9, 0.12), "estrutura", zone=zone)


def wet_part():
    """Caixa de entrada, gap former, pick-up, primeira prensa e prensa de sapata."""
    main_roll("MP1-FOR-RFS", "rolo_feltro")
    main_roll("MP1-FOR-RCB", "rolo_feltro")
    main_roll("MP1-FOR-RCO", "rolo_feltro")
    main_roll("MP1-PRE-RPU", "rolo_borracha")
    main_roll("MP1-PRE-P1I", "rolo_feltro", column=False)
    main_roll("MP1-PRE-P1S", "rolo_borracha", column=False)
    press_stand(wet.P1X, wet.P1I, wet.P1S, wet.P1R, wet.P1R, "prensa1")
    main_roll("MP1-PRE-R1", "cil_ferro", column=False)
    _shoe_roll()
    press_stand(wet.PX, wet.PB, wet.PT, wet.PRB, wet.PRS, "prensa2", load=True)

    _headbox()

    for name, (mat, circles) in wet.loops().items():
        width = W_WIRE if mat == "tela_formacao" else W_FELT
        thick = 0.005 if mat == "tela_formacao" else 0.006
        ribbon_split(name, geom.belt(circles, closed=True), width, mat, thick)
        for j, (c, r, _s) in enumerate(circles):
            if abs(r - RG) < 1e-6:
                guide_roll(f"guia_{name}_{j}", c[0], c[1])
        _felt_suction(name, circles)

    _drainage()

    for tag in ("MP1-FOR-RFS", "MP1-FOR-RCO", "MP1-PRE-P1I", "MP1-PRE-R1"):
        x, z, _r = wet.roll(tag)
        motor(f"motor_{tag.rsplit('-', 1)[1]}", x, z, BZ)

    _sill()


def _shoe_roll():
    """
    O rolo de sapata: maior que o contra-rolo e coberto pela manta, numa cor
    própria. Por dentro dela, nas pontas, aparece a viga da sapata.
    """
    x, y, r = wet.roll("MP1-PRE-R2")
    zone = zone_for_x(x)
    cyl("R2_rolo", (x, 0, y), wet.PRS_D, ROLL_FACE - 0.2, "rolo_borracha", seg=96, zone=zone)
    cyl("R2_manta", (x, 0, y), wet.PRS_D + wet.SHOE_BELT, ROLL_FACE - 0.1, "manta_sapata", seg=96, zone=zone)
    for sg in (-1, 1):
        cyl(f"R2_tampa{sg}", (x, sg * (ROLL_FACE / 2), y), wet.PRS_D + wet.SHOE_BELT, 0.06, "cil_cabeca", seg=96, zone=zone)
        # viga da sapata: atravessa o rolo e aparece na ponta, sob o munhão
        box(f"R2_viga{sg}", (x, sg * (ROLL_FACE / 2 + 0.1), y - r * 0.45), (0.5, 0.2, 0.34), "estrutura", zone=zone)
        cyl(f"R2_munhao{sg}", (x, sg * (ROLL_FACE / 2 + 0.32), y), r * 0.26, 0.6, "munhao", seg=24, zone=zone)


def _headbox():
    """
    Caixa de entrada: corpo inclinado sob a tela de cima, bocal entrando na
    cunha entre a tela de cima e o rolo formador, coletor de entrada
    atravessando a máquina por trás e a alimentação pelo lado acionamento.
    """
    zone = zone_for_x(M["HEADBOX_X_M"])
    body_w = FACE + 0.2
    body, nozzle = wet.headbox_outline()
    prism("headbox", body, body_w, "estrutura_clara", zone)
    prism("headbox_bocal", nozzle, body_w - 0.1, "munhao", zone)
    (cx, cz), d, n = wet.headbox_frame()

    def at(u, v):
        return (cx + d[0] * u + n[0] * v, cz + d[1] * u + n[1] * v)

    # coletor de entrada: cônico, atravessando a máquina atrás do corpo
    hx, hz = at(-wet.HB_L / 2 - 0.55, -0.1)
    cyl("headbox_coletor", (hx, 0, hz), 0.45, FACE + 1.6, "estrutura_clara", seg=40, zone=zone, r2=0.25)
    bx, bz = at(-wet.HB_L / 2, -0.1)
    for k in range(7):
        yy = -FACE / 2 + 0.6 + k * (FACE - 1.2) / 6
        poly_tube(f"headbox_tubo{k}", [(hx + 0.3, yy, hz), (bx, yy, bz)], 0.07, "munhao", zone=zone)
    feed_y = (FACE + 1.6) / 2 + 0.25
    poly_tube(
        "headbox_alimentacao",
        [(hx, feed_y - 0.3, hz), (hx, feed_y, hz), (hx, feed_y, 0.5), (hx - 1.5, feed_y, 0.5)],
        0.3,
        "tubo_isolado",
        zone=zone,
    )
    # pés: do canto de baixo do corpo até o piso, nas duas pontas
    for k, u in enumerate((-wet.HB_L / 2 + 0.25, wet.HB_L / 2 - 0.25)):
        fx, fz = at(u, -wet.HB_H / 2)
        for sg in (-1, 1):
            box(f"headbox_pe{k}{sg}", (fx, sg * (body_w / 2 - 0.25), fz / 2), (0.3, 0.3, fz), "estrutura", zone=zone, section_hidden=sg < 0)


def _drainage():
    """
    Caixas de drenagem entre as telas, transversais e dentro da largura da tela.

    Lâminas por dentro do laço de cima, encostadas na tela de cima, e caixas de
    sucção por dentro do de baixo, encostadas na tela de baixo. Cada fileira se
    apoia numa viga longitudinal do lado acionamento, presa por braços curtos à
    ponta de cada caixa, e a viga em dois montantes até o piso.
    """
    width = W_WIRE - 0.2
    rows = {}
    for name, x, z, length, height in wet.drainage_boxes():
        zone = zone_for_x(x)
        box(name, (x, 0, z), (length, width, height), "caixa_drenagem", zone=zone, bevel=0.02)
        y_end = width / 2
        box(f"{name}_braco", (x, (y_end + Y_POST) / 2, z), (0.12, Y_POST - y_end, 0.12), "estrutura_clara", zone=zone)
        rows.setdefault(name.split("_")[0], []).append((x, z))
        if name.startswith("succao"):
            poly_tube(f"{name}_tubo", [(x, y_end, z - 0.1), (x, Y_POST - 0.2, z - 0.1), (x, Y_POST - 0.2, 0.4)], 0.07, "tubo_isolado", zone=zone)
    for row, pts in rows.items():
        x0 = min(p[0] for p in pts) - 0.3
        x1 = max(p[0] for p in pts) + 0.3
        z = pts[0][1]
        for sa, sb in split_by_zone(x0, x1):
            box(f"viga_{row}_{sa:.1f}", ((sa + sb) / 2, Y_POST, z), (sb - sa, 0.16, 0.16), "estrutura_clara", zone=zone_for_x((sa + sb) / 2))
        for k, x in enumerate((x0, x1)):
            box(f"viga_{row}_montante{k}", (x, Y_POST, z / 2), (0.14, 0.14, z), "estrutura_clara", zone=zone_for_x(x))


def _felt_suction(name, circles):
    """
    Caixa de sucção do feltro, no trecho de retorno mais longo entre dois
    rolos-guia, por dentro do laço e encostada nele. Presa a um montante do
    lado acionamento, como os rolos-guia.
    """
    s = wet.felt_suction(name, circles)
    if s is None:
        return
    x, z, ang = s
    zone = zone_for_x(x)
    width = W_FELT - 0.2
    box(f"{name}_uhle", (x, 0, z), (0.4, width, 0.22), "caixa_drenagem", zone=zone, bevel=0.02, rot=Matrix.Rotation(-ang, 4, "Y"))
    la_post(f"{name}_uhle", x, z, width / 2)


def _sill():
    """Soleiras longitudinais junto ao piso, nos dois lados, sob as colunas."""
    x0 = min(M["HEADBOX_X_M"] - 1.2, M["BREAST_ROLL_X_M"] - 0.6)
    x1 = M["PRESS_X_M"] + 1.6
    for sg in (-1, 1):
        for sa, sb in split_by_zone(x0, x1):
            box(
                f"umida_soleira{sg}_{sa:.1f}",
                ((sa + sb) / 2, sg * BZ, 0.1),
                (sb - sa, 0.44, 0.2),
                "estrutura",
                zone=zone_for_x((sa + sb) / 2),
                section_hidden=sg < 0,
            )


# ----------------------------------------------- scanners, sizer, calandra, Pope
def scanners():
    """Pórtico do scanner e o feixe emissivo que varre a folha."""
    for a in assets("scanner"):
        x, y, _ = a["position"]
        half = a["lengthM"] / 2
        zone = zone_for_x(x)
        tag = a["tag"].rsplit("-", 1)[1]
        for sg in (-1, 1):
            box(f"sc_{tag}_col{sg}", (x, sg * half, y - 0.4), (0.5, 0.4, 3.2), "estrutura_clara", zone=zone, bevel=0.03)
        box(f"sc_{tag}_viga_sup", (x, 0, y + 1.05), (0.42, 2 * half, 0.4), "estrutura_clara", zone=zone, bevel=0.03)
        box(f"sc_{tag}_viga_inf", (x, 0, y - 1.05), (0.42, 2 * half, 0.4), "estrutura_clara", zone=zone, bevel=0.03)
        box(f"sc_{tag}_cabeca", (x, 1.2, y + 0.62), (0.6, 0.9, 0.5), "caixa_juncao", zone=zone, bevel=0.02)
        box(f"sc_{tag}_feixe", (x, 0, y), (0.05, 2 * half - 0.6, 0.05), "lampada", zone=zone)
        area_light(f"al_{tag}", (x, 0, y + 0.3), 0.3, 60)


def speed_sizer():
    """Os dois rolos aplicadores empilhados, com o nip na altura da folha."""
    for a in assets("roll", "speed-sizer"):
        x, y, _ = a["position"]
        roll_with_housing(a["tag"].rsplit("-", 1)[1], x, y, a["radius"], "rolo_feltro", housing="estrutura_clara")

    x = M["SIZER_X_M"]
    web = M["DRY_SECTION_WEB_Y_M"]
    zone = zone_for_x(x)
    for sg in (-1, 1):
        box(
            f"szr_estrutura{sg}",
            (x, sg * (FACE / 2 + 1.0), web),
            (3.0, 0.6, 6.2),
            "estrutura_clara",
            zone=zone,
            bevel=0.04,
        )
        box(
            f"szr_bandeja{sg}",
            (x + sg * (M["SIZER_ROLL_RADIUS_M"] + 0.45), 0, web + 0.1),
            (0.5, FACE, 0.35),
            "munhao",
            zone=zone,
        )
    poly_tube(
        "szr_tubo",
        [(x - 2.0, -FACE / 2 - 1.2, 0.4), (x - 2.0, -FACE / 2 - 1.2, web), (x, -FACE / 2 - 1.2, web)],
        0.09,
        "tubo_vermelho",
        zone=zone,
        section_hidden=True,
    )


def calender():
    """Calandra de um nip: rolo térmico em cima, revestido embaixo."""
    for a in assets("roll", "calender"):
        mat = "cil_ferro" if a["tag"].endswith("RT") else "rolo_borracha"
        x, y, _ = a["position"]
        roll_with_housing(a["tag"].rsplit("-", 1)[1], x, y, a["radius"], mat)

    x = M["CALENDER_X_M"]
    zone = zone_for_x(x)
    for sg in (-1, 1):
        box(
            f"cal_estrutura{sg}",
            (x, sg * (FACE / 2 + 0.95), M["CALENDER_NIP_Y_M"]),
            (2.4, 0.5, 5.4),
            "estrutura",
            zone=zone,
            bevel=0.04,
        )
    box("cal_base", (x, 0, 0.3), (3.4, FACE + 2.2, 0.6), "estrutura", zone=zone, bevel=0.03)


def pope():
    """Tambor da enroladeira, o jumbo em formação, trilhos e braços."""
    drum = assets("reel-drum")[0]
    x, y, _ = drum["position"]
    r = drum["radius"]
    zone = zone_for_x(x)
    roll_with_housing("POP_TBR", x, y, r, "cil_ferro")

    jr = 1.45
    cyl("pope_jumbo", (x + r + jr, 0, y), jr, FACE - 0.2, "papel", seg=56, zone=zone)
    cyl("pope_jumbo_eixo", (x + r + jr, 0, y), 0.16, FACE + 1.6, "munhao", seg=24, zone=zone)

    for sg in (-1, 1):
        box(f"pope_trilho{sg}", (x + 3.2, sg * (FACE / 2 + 0.75), y + 0.1), (9.0, 0.3, 0.5), "estrutura", zone=zone, bevel=0.02)
        box(f"pope_braco{sg}", (x - 0.2, sg * (FACE / 2 + 0.75), y + 1.2), (0.4, 0.34, 3.0), "estrutura", zone=zone, bevel=0.02)
        box(f"pope_col{sg}", (x - 1.6, sg * (FACE / 2 + 0.75), y / 2), (0.44, 0.44, y + 0.2), "estrutura", zone=zone, bevel=0.02)
    box("pope_base", (x + 1.0, 0, 0.3), (6.0, FACE + 2.4, 0.6), "estrutura", zone=zone, bevel=0.03)
