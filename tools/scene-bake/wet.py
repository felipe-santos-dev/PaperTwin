"""
O desenho da parte úmida no corte lateral — sem Blender.

Fica separado de propósito, como `geom.py`: é aqui que se decide por onde corre
cada tela, cada feltro e a folha, e dá para conferir tudo num
`python wet.py`, sem carregar o bpy. O `stations.py` só transforma o que sai
daqui em malha.

Eixos do corte: (x, altura), com x no sentido do papel. Os rolos principais
vêm do modelo; os rolos-guia ficam em afastamentos de desenho em volta deles.

`python wet.py` roda a conferência: nenhum laço cruza outro laço, a folha ou
um rolo que não é dele, e nenhuma caixa de drenagem atravessa uma tela.
"""

import json
import os
from math import atan2, cos, degrees, hypot, radians, sin

import geom

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "machine.json"), encoding="utf-8") as _f:
    _DATA = json.load(_f)

M = _DATA["measurements"]
_ROLLS = {
    a["tag"]: a
    for s in _DATA["model"]["sections"]
    for a in s["assets"]
    if a["kind"] == "roll"
}

#: Raio dos rolos-guia de tela e de feltro.
RG = M["WET_GUIDE_ROLL_RADIUS_M"]

#: Camadas sobre um rolo, de dentro para fora. Milímetros, só para tela, folha
#: e feltro não coincidirem no desenho.
WIRE_IN, SHEET, WIRE_OUT = 0.004, 0.008, 0.012
FELT_ON = 0.004

#: Nos nips os dois rolos se tocam, e feltro, folha e feltro precisam caber
#: entre eles. O rolo é **desenhado** este tanto menor que o do modelo — 1,2 cm,
#: invisível a qualquer distância — e as camadas assentam sobre o desenhado.
NIP_INSET = 0.012

#: A manta da prensa de sapata: a capa por fora do rolo de sapata.
SHOE_BELT = 0.03

#: Sobre o rolo de baixo de um nip: feltro de baixo, folha e feltro de cima.
NIP_STACK = 0.016


def roll(tag):
    """(x, altura, raio do modelo) de um rolo principal."""
    a = _ROLLS[tag]
    return a["position"][0], a["position"][1], a["radius"]


# ------------------------------------------------------------ rolos principais
FX, FY, FR = roll("MP1-FOR-RFS")
BX, BY, BR = roll("MP1-FOR-RCB")
CX, CY, CR = roll("MP1-FOR-RCO")
UX, UY, UR = roll("MP1-PRE-RPU")
P1X, P1I, P1R = roll("MP1-PRE-P1I")
_, P1S, _ = roll("MP1-PRE-P1S")
PX, PB, PRB = roll("MP1-PRE-R1")
_, PT, PRS = roll("MP1-PRE-R2")

#: Linha em que as duas telas correm juntas.
RUN = M["WIRE_RUN_Y_M"]

#: Raio desenhado dos rolos de nip.
P1R_D = P1R - NIP_INSET
PRB_D = PRB - NIP_INSET
#: O rolo de sapata é desenhado por dentro da manta; a manta fecha o raio
#: desenhado, que é o do modelo menos a folga de nip.
PRS_D = PRS - NIP_INSET - SHOE_BELT

#: Onde a tela de cima se separa da de baixo, antes do pick-up.
SX = UX - 1.8

#: Rolo que recebe a folha na saída da primeira prensa, no feltro de baixo da
#: sapata. Fica logo à direita do nip, com o topo 3 cm acima da reta que vai
#: do nip da primeira prensa ao topo do contra-rolo da sapata: a folha sai do
#: nip, pousa no feltro em cima dele e sobe com o feltro até a sapata.
SX2 = P1X + 1.4
SY2 = (P1I + P1R) + (SX2 - P1X) * ((PB + PRB) - (P1I + P1R)) / (PX - P1X) + 0.03 - RG

#: Onde a folha pousa no primeiro cilindro da secagem: na face de montante,
#: antes de a tela de baixo do grupo encostar nele (ela encosta perto de 246°).
#: Assim a folha fica entre o cilindro e a tela, como deve.
LANDING_DEG = 220.0
#: Comprimento do vão livre da folha entre o rolo de transferência e o cilindro.
LANDING_DRAW = 0.9


def _transfer_roll():
    """
    O rolo de transferência, posto para a folha sair dele direto no ponto de
    pouso do primeiro cilindro, na tangente.
    """
    cx = M["PRE_DRYER_X0_M"] + M["DRYER_PITCH_M"] / 2
    cy = M["DRYER_BOTTOM_Y_M"]
    rp = M["DRYER_RADIUS_M"] + M["PAPER_CLEARANCE_M"]
    th = radians(LANDING_DEG)
    land = (cx + rp * cos(th), cy + rp * sin(th))
    d = (-sin(th), cos(th))  # sentido anti-horário no cilindro
    tp = (land[0] - d[0] * LANDING_DRAW, land[1] - d[1] * LANDING_DRAW)
    r = RG + SHEET - FELT_ON
    # rolo horário: o centro fica à direita do sentido da folha
    return tp[0] + d[1] * r, tp[1] - d[0] * r


#: Rolo de transferência: o feltro de baixo da sapata leva a folha até a
#: boca da capota da pré-secagem, e dali ao primeiro cilindro o vão é curto.
TX, TY = _transfer_roll()


def main_rolls():
    """Os rolos principais, com o raio **desenhado**, para a conferência e o desenho."""
    return {
        "MP1-FOR-RFS": ((FX, FY), FR),
        "MP1-FOR-RCB": ((BX, BY), BR),
        "MP1-FOR-RCO": ((CX, CY), CR),
        "MP1-PRE-RPU": ((UX, UY), UR),
        "MP1-PRE-P1I": ((P1X, P1I), P1R_D),
        "MP1-PRE-P1S": ((P1X, P1S), P1R_D),
        "MP1-PRE-R1": ((PX, PB), PRB_D),
        "MP1-PRE-R2": ((PX, PT), PRS_D + SHOE_BELT),
    }


# ----------------------------------------------------------------- os laços
def loops():
    """
    Cada laço como (material, lista de círculos para `geom.belt`).

    Telas: a de baixo envolve formador e couch e volta por baixo (horário); a
    de cima desce do rolo cabeceira, encontra a de baixo sobre o formador e se
    separa antes do pick-up (anti-horário). Feltros: cada prensa tem o seu de
    cima e o seu de baixo; os da primeira prensa voltam para montante, os da
    sapata para jusante, e assim os quatro não se encontram entre as prensas.
    """
    return {
        "tela_inf": (
            "tela_formacao",
            [
                ((FX, FY), FR + WIRE_IN, -1),
                ((CX, CY), CR + WIRE_IN, -1),
                ((CX + 1.1, CY - 1.2), RG, -1),
                (((FX + CX) / 2, 0.6), RG, -1),
                ((FX - 0.9, FY - 1.5), RG, -1),
            ],
        ),
        "tela_sup": (
            "tela_formacao",
            [
                ((FX, FY), FR + WIRE_OUT, -1),
                ((SX, RUN + WIRE_OUT + RG), RG, 1),
                ((SX - 0.2, RUN + 2.1), RG, 1),
                (((FX + SX) / 2, RUN + 3.1), RG, 1),
                ((BX - 0.4, BY + 1.7), RG, 1),
                ((BX, BY), BR + WIRE_IN, 1),
            ],
        ),
        # Feltro pick-up: é também o de cima da primeira prensa (anti-horário).
        # Ele chega ao nip subindo, junto com a folha, e por isso encosta no
        # rolo de baixo um pouco antes do nip — por cima do feltro de baixo e
        # da folha. Sem isso a reta tocaria o rolo de cima depois do fundo e
        # passaria por dentro do rolo de baixo.
        "feltro_p1_sup": (
            "feltro_prensa",
            [
                ((UX, UY), UR + FELT_ON, 1),
                ((P1X, P1I), P1R_D + NIP_STACK, -1),
                ((P1X, P1S), P1R_D + FELT_ON, 1),
                ((P1X + 1.05, P1S + 1.1), RG, 1),
                ((P1X + 0.4, P1S + 2.5), RG, 1),
                ((0.0, P1S + 2.5), RG, 1),
                ((UX - 0.7, UY + 2.6), RG, 1),
                ((UX - 0.9, UY + 0.6), RG, 1),
            ],
        ),
        "feltro_p1_inf": (
            "feltro_prensa",
            [
                ((P1X, P1I), P1R_D + FELT_ON, -1),
                ((P1X + 1.25, P1I - 1.1), RG, -1),
                ((P1X + 1.1, 0.65), RG, -1),
                ((P1X - 2.8, 0.65), RG, -1),
                ((P1X - 2.6, P1I - 0.4), RG, -1),
            ],
        ),
        "feltro_p2_sup": (
            "feltro_prensa",
            [
                ((PX, PT), PRS_D + SHOE_BELT + FELT_ON, 1),
                ((PX + PRS + 0.55, PT + 0.3), RG, 1),
                ((PX + PRS + 0.2, PT + PRS + 1.3), RG, 1),
                ((PX - PRS + 0.3, PT + PRS + 1.5), RG, 1),
                ((PX - PRS - 0.05, PT + 0.9), RG, 1),
            ],
        ),
        # Feltro de baixo da sapata (horário): recebe a folha logo na saída da
        # primeira prensa, passa pelo nip da sapata e a leva até a boca da
        # capota. Assim os dois vãos livres da folha ficam curtos.
        "feltro_p2_inf": (
            "feltro_prensa",
            [
                ((PX, PB), PRB_D + FELT_ON, -1),
                ((TX, TY), RG, -1),
                ((TX - 0.5, 0.55), RG, -1),
                ((PX - 0.4, 0.55), RG, -1),
                ((SX2, SY2), RG, -1),
            ],
        ),
    }


def paper_circles():
    """
    A folha da caixa de entrada até o rolo de transferência.

    Entre as telas no formador; no pick-up passa para a face de baixo do feltro
    e vai colada nele até a primeira prensa; vão livre curto até o feltro de
    baixo da sapata, e sobre ele pelo nip da sapata até o rolo de transferência;
    vão livre curto até a face de montante do primeiro cilindro, onde entra
    por baixo da tela do primeiro grupo. O resto, até a
    enroladeira, é do `machine.paper_web`.
    """
    return [
        (headbox_lip(), 0, 1),
        ((FX, FY), FR + SHEET, -1),
        ((UX, UY), UR + SHEET, 1),
        ((P1X, P1I), P1R_D + NIP_STACK - FELT_ON, -1),
        ((P1X, P1S), P1R_D + SHEET, 1),
        ((SX2, SY2), RG + SHEET - FELT_ON, -1),
        ((PX, PB), PRB_D + SHEET, -1),
        ((TX, TY), RG + SHEET - FELT_ON, -1),
    ]


# ---------------------------------------------------------- caixa de entrada
#: Corpo da caixa de entrada (comprimento, altura), bocal à frente, e as folgas:
#: o topo do corpo fica um pouco abaixo da tela de cima, e o lábio um pouco
#: abaixo dela também, dentro da cunha.
HB_L, HB_H, HB_NOZ = 1.6, 0.9, 1.3
HB_TOP_GAP = 0.12
LIP_DROP = 0.11
#: Quanto antes do ponto de convergência o jato sai.
LIP_LEAD = 0.6


def convergence():
    """
    O ponto em que as duas telas se encontram sobre o rolo formador, e a
    direção da tela de cima ali.

    No encontro a tela de cima é tangente ao formador, que a de baixo envolve:
    a cunha fica entre essa reta e o rolo, abrindo para montante. O jato entra
    paralelo à tela de cima, logo abaixo dela.
    """
    p_from, pc = geom.tangent((BX, BY), BR + WIRE_IN, 1, (FX, FY), FR + WIRE_OUT, -1)
    return p_from, pc, _unit(pc[0] - p_from[0], pc[1] - p_from[1])


def headbox_pose_for():
    """A pose do corpo (x, altura, inclinação) que põe o lábio na cunha. Serve para escolher `HEADBOX_*`."""
    _p, pc, d = convergence()
    n = (-d[1], d[0])
    lip = (pc[0] - d[0] * LIP_LEAD - n[0] * LIP_DROP, pc[1] - d[1] * LIP_LEAD - n[1] * LIP_DROP)
    back = HB_NOZ + HB_L / 2
    drop = HB_H / 2 + HB_TOP_GAP - LIP_DROP
    return lip[0] - d[0] * back - n[0] * drop, lip[1] - d[1] * back - n[1] * drop, degrees(atan2(d[1], d[0]))


def headbox_frame():
    """Centro do corpo, direção do jato e normal para cima, a partir do modelo."""
    t = radians(M["HEADBOX_TILT_DEG"])
    d = (cos(t), sin(t))
    return (M["HEADBOX_X_M"], M["HEADBOX_Y_M"]), d, (-d[1], d[0])


def headbox_lip():
    """O lábio da caixa de entrada, na ponta do bocal."""
    c, d, n = headbox_frame()
    reach = HB_L / 2 + HB_NOZ
    up = HB_H / 2 + HB_TOP_GAP - LIP_DROP
    return (c[0] + d[0] * reach + n[0] * up, c[1] + d[1] * reach + n[1] * up)


def headbox_outline():
    """Corpo e bocal, como polígonos do corte. O bocal afina do corpo ao lábio."""
    c, d, n = headbox_frame()

    def at(u, v):
        return (c[0] + d[0] * u + n[0] * v, c[1] + d[1] * u + n[1] * v)

    hl, hh = HB_L / 2, HB_H / 2
    body = [at(-hl, -hh), at(hl, -hh), at(hl, hh), at(-hl, hh)]
    up = hh + HB_TOP_GAP - LIP_DROP
    tip = hl + HB_NOZ
    nozzle = [at(hl, -hh * 0.75), at(tip, up - 0.03), at(tip, up + 0.03), at(hl, hh)]
    return body, nozzle


def _unit(x, y):
    n = hypot(x, y)
    return (x / n, y / n)


# --------------------------------------------------------------- drenagem
def drainage_boxes():
    """
    As caixas de drenagem entre formador e couch, como (nome, x, altura, comprimento, altura da caixa).

    Lâminas por dentro do laço de cima, encostadas na tela de cima; caixas de
    sucção por dentro do de baixo, encostadas na tela de baixo.
    """
    out = []
    x, k = FX + FR + 0.35, 0
    while x < SX - 0.7:
        out.append((f"lamina_{k}", x, RUN + WIRE_OUT + 0.003 + 0.09, 0.4, 0.18))
        x += 0.75
        k += 1
    x, k = FX + FR + 0.6, 0
    while x < CX - CR - 0.5:
        out.append((f"succao_{k}", x, RUN + WIRE_IN - 0.003 - 0.17, 0.5, 0.34))
        x += 1.1
        k += 1
    return out


def felt_suction(name, circles):
    """
    A caixa de sucção do feltro: no trecho de retorno mais longo entre dois
    rolos-guia, por dentro do laço e encostada nele. Devolve (x, altura,
    ângulo) ou None.
    """
    best = None
    m = len(circles)
    for i in range(m):
        c1, c2 = circles[i], circles[(i + 1) % m]
        if abs(c1[1] - RG) > 1e-6 or abs(c2[1] - RG) > 1e-6:
            continue
        a, b = geom.tangent(c1[0], c1[1], c1[2], c2[0], c2[1], c2[2])
        seg = hypot(b[0] - a[0], b[1] - a[1])
        if best is None or seg > best[0]:
            best = (seg, a, b)
    if best is None or best[0] < 1.2:
        return None
    seg, a, b = best
    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    ccx = sum(c[0][0] for c in circles) / m
    ccz = sum(c[0][1] for c in circles) / m
    nx, nz = -(b[1] - a[1]) / seg, (b[0] - a[0]) / seg
    if (ccx - mx) * nx + (ccz - mz) * nz < 0:
        nx, nz = -nx, -nz
    half = 0.11 + 0.004
    return (mx + nx * half, mz + nz * half, atan2(b[1] - a[1], b[0] - a[0]))


# --------------------------------------------------------- telas da secagem
def dryer_loops():
    """
    As telas da secagem, uma por fileira e por grupo de vapor, como
    {nome: círculos}. A mesma conta que o gerador usa para desenhá-las.
    """
    cylinders = [
        (int(a["tag"].rsplit("-CS", 1)[1]), a["position"][0], a["position"][1])
        for s in _DATA["model"]["sections"]
        for a in s["assets"]
        if a["kind"] == "dryer-cylinder"
    ]
    out = {}
    for group in _DATA["steamGroups"]:
        row = [(x, y) for n, x, y in cylinders if group["from"] <= n <= group["to"]]
        top, bottom = geom.dryer_rows(row, M["DRYER_TOP_Y_M"], M["DRYER_BOTTOM_Y_M"])
        for name, r, upper in (("sup", top, True), ("inf", bottom, False)):
            if len(r) < 2:
                continue
            out[f"tela_{group['id']}_{name}"] = geom.felt_loop(
                r,
                upper,
                M["DRYER_RADIUS_M"],
                M["FELT_ROLL_RISE_M"],
                M["FELT_ROLL_RADIUS_M"],
                M["FELT_CLEARANCE_M"],
                M["DRYER_PITCH_M"],
            )
    return out


def pre_dryer_paper():
    """
    A folha na pré-secagem: sempre para a frente, alternando os níveis.

    Ela entra pelo primeiro cilindro de baixo (CS2), na face de montante, e
    segue em serpentina pela ordem de X até o último de baixo (CS26), de onde
    sobe para a linha horizontal do scanner 1. O primeiro de cima (CS1) fica
    a montante do ponto de entrada da folha e só leva a tela.
    """
    rp = M["DRYER_RADIUS_M"] + M["PAPER_CLEARANCE_M"]
    mid = (M["DRYER_TOP_Y_M"] + M["DRYER_BOTTOM_Y_M"]) / 2
    pre = sorted(
        (a["position"][0], a["position"][1])
        for s in _DATA["model"]["sections"]
        if s["id"] == "pre-dryer"
        for a in s["assets"]
        if a["kind"] == "dryer-cylinder"
    )
    first, _rd = first_dryer()
    return [((x, y), rp, 1 if y < mid else -1) for x, y in pre if x >= first[0] - 1e-6]


# ------------------------------------------------------------- conferência
def _seg_cross(p1, p2, q1, q2):
    """Cruzamento próprio de dois segmentos (toque de ponta não conta)."""

    def orient(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    d1, d2 = orient(q1, q2, p1), orient(q1, q2, p2)
    d3, d4 = orient(p1, p2, q1), orient(p1, p2, q2)
    return (d1 > 0) != (d2 > 0) and (d3 > 0) != (d4 > 0) and d1 * d2 < 0 and d3 * d4 < 0


def _point_seg(p, a, b):
    ax, ay = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / (ax * ax + ay * ay or 1)))
    return hypot(p[0] - a[0] - t * ax, p[1] - a[1] - t * ay)


def _segs(pts):
    return list(zip(pts[:-1], pts[1:]))


def _crossings(a, b):
    n = 0
    sb = _segs(b)
    for p1, p2 in _segs(a):
        for q1, q2 in sb:
            if _seg_cross(p1, p2, q1, q2):
                n += 1
    return n


def _rect(cx, cz, w, h, ang=0.0):
    c, s = cos(ang), sin(ang)
    corners = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    pts = [(cx + x * c - z * s, cz + x * s + z * c) for x, z in corners]
    return pts + [pts[0]]


def check():
    """
    A conferência do corte lateral. Devolve a lista de problemas — vazia se
    tudo passa — e imprime o resumo.

    1. Nenhum laço cruza outro laço.
    2. Nenhum laço passa por dentro de um rolo que não é dele.
    3. A folha não cruza laço nenhum (ela corre encostada, a milímetros).
    4. Nenhuma caixa de drenagem ou de sucção atravessa uma tela ou feltro.
    5. O jato da caixa de entrada aponta para o ponto de convergência.

    As telas da secagem entram nas regras 1 a 3 junto com os laços da úmida:
    cada uma é um laço só, que não pode cruzar a do grupo vizinho.
    """
    problems = []
    lp = {name: geom.belt(c, closed=True) for name, (_m, c) in loops().items()}
    dryers = dryer_loops()
    lp.update({name: geom.belt(c, closed=True) for name, c in dryers.items()})
    names = sorted(lp)

    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            n = _crossings(lp[a], lp[b])
            if n:
                problems.append(f"laço {a} cruza {b} ({n}×)")

    rolls = dict(main_rolls())
    for name, (_m, circles) in loops().items():
        for j, (c, r, _s) in enumerate(circles):
            if abs(r - RG) < 1e-6:
                rolls[f"guia_{name}_{j}"] = (c, RG - 0.006)
    for name, circles in dryers.items():
        for j, (c, r, _s) in enumerate(circles):
            key = f"cilindro_{c[0]:.2f}_{c[1]:.2f}" if r > 0.5 else f"rolo_{name}_{j}"
            rolls[key] = (c, r - (M["FELT_CLEARANCE_M"] if r > 0.5 else 0.008))
    all_loops = {name: circles for name, (_m, circles) in loops().items()}
    all_loops.update(dryers)
    members = {
        name: {(round(c[0], 3), round(c[1], 3)) for c, _r, _s in circles}
        for name, circles in all_loops.items()
    }
    for name, circles in all_loops.items():
        segs = _segs(lp[name])
        for rname, (c, r) in rolls.items():
            if (round(c[0], 3), round(c[1], 3)) in members[name]:
                continue
            gap = min(_point_seg(c, a, b) for a, b in segs) - r
            if gap < 0.01:
                problems.append(f"laço {name} passa por dentro de {rname} (folga {gap:+.3f} m)")

    dryer, rd = first_dryer()
    paper = geom.belt([*paper_circles(), *pre_dryer_paper()], closed=False)
    for name in lp:
        n = _crossings(paper, lp[name])
        if n:
            problems.append(f"folha cruza {name} ({n}×)")
    on_paper = {(round(c[0], 3), round(c[1], 3)) for c, _r, _s in pre_dryer_paper()}
    for rname, (c, r) in rolls.items():
        if (round(c[0], 3), round(c[1], 3)) in on_paper:
            continue  # cilindro que a folha abraça
        gap = min(_point_seg(c, a, b) for a, b in _segs(paper)) - r
        if gap < -0.002:
            problems.append(f"folha passa por dentro de {rname} (folga {gap:+.3f} m)")

    boxes = [(n, _rect(x, z, w, h)) for n, x, z, w, h in drainage_boxes()]
    for name, (_m, circles) in loops().items():
        s = felt_suction(name, circles)
        if s:
            boxes.append((f"{name}_succao", _rect(s[0], s[1], 0.4, 0.22, s[2])))
    for bname, rect in boxes:
        for name in lp:
            if _crossings(rect, lp[name]):
                problems.append(f"caixa {bname} atravessa {name}")

    p_from, pc, d = convergence()
    lip = headbox_lip()
    _c, hd, _n = headbox_frame()
    aim = degrees(abs(atan2(hd[1], hd[0]) - atan2(d[1], d[0])))
    below = (lip[0] - pc[0]) * -d[1] + (lip[1] - pc[1]) * d[0]  # >0 acima da tela de cima
    out_fr = hypot(lip[0] - FX, lip[1] - FY) - (FR + WIRE_IN)
    if aim > 2 or not (-0.2 < below < -0.03) or out_fr < 0.03 or hypot(lip[0] - pc[0], lip[1] - pc[1]) > 1.0:
        problems.append(
            f"o lábio não está na cunha: desvio {aim:.1f}°, {below:+.3f} m da tela de cima, {out_fr:+.3f} m do formador"
        )
    body, nozzle = headbox_outline()
    for part, poly in (("corpo", body), ("bocal", nozzle)):
        ring = poly + [poly[0]]
        for name in lp:
            if _crossings(ring, lp[name]):
                problems.append(f"caixa de entrada ({part}) atravessa {name}")
        if min(p[1] for p in poly) < 0.15:
            problems.append(f"caixa de entrada ({part}) encosta no piso")
    for c, r in (((BX, BY), BR), ((FX, FY), FR)):
        for part, poly in (("corpo", body), ("bocal", nozzle)):
            ring = poly + [poly[0]]
            g = min(_point_seg(c, a, b) for a, b in _segs(ring)) - r
            if g < 0.03:
                problems.append(f"caixa de entrada ({part}) encosta num rolo (folga {g:+.3f} m)")

    free = _free_draws()
    print(f"laços: {len(lp)} ({len(dryers)} telas da secagem) · rolos e cilindros conferidos: {len(rolls)} · caixas: {len(boxes)}")
    print(
        f"jato: lábio a {hypot(pc[0] - lip[0], pc[1] - lip[1]):.2f} m do encontro das telas, "
        f"{-below * 100:.0f} cm abaixo da tela de cima, {out_fr * 100:.0f} cm fora do formador, desvio {aim:.1f}°"
    )
    for label, length in free:
        print(f"vão livre da folha · {label}: {length:.2f} m")
    if problems:
        print(f"{len(problems)} problema(s):")
        for p in problems:
            print("  ✗", p)
    else:
        print("nenhum cruzamento: cada laço fecha sozinho, sem tocar outro laço, rolo alheio, folha ou caixa")
    return problems


def first_dryer():
    """O primeiro cilindro da pré-secagem, o de baixo, onde a folha entra na secagem."""
    x = M["PRE_DRYER_X0_M"] + M["DRYER_PITCH_M"] / 2
    return (x, M["DRYER_BOTTOM_Y_M"]), M["DRYER_RADIUS_M"] + M["PAPER_CLEARANCE_M"]


def _free_draws():
    """Os trechos em que a folha não encosta em rolo, tela nem feltro."""
    c = paper_circles()
    dryer, rd = first_dryer()
    spans = (
        ("caixa de entrada → formador", c[0], c[1]),
        ("1ª prensa → feltro da sapata", c[4], c[5]),
        ("transferência → 1º cilindro", c[7], (dryer, rd, 1)),
    )
    out = []
    for label, a, b in spans:
        p, q = geom.tangent(a[0], a[1], a[2], b[0], b[1], b[2])
        out.append((label, hypot(q[0] - p[0], q[1] - p[1])))
    return out


if __name__ == "__main__":
    _p, pc, _d = convergence()
    hx, hy, tilt = headbox_pose_for()
    print(f"encontro das telas {pc[0]:.3f}, {pc[1]:.3f}")
    print(f"pose da caixa de entrada que põe o lábio na cunha: x {hx:.2f} · y {hy:.2f} · inclinação {tilt:.1f}°")
    raise SystemExit(1 if check() else 0)
