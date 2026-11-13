"""
As estações da máquina fora da secagem.

Parte úmida (caixa de entrada, formador de duas telas, prensas com prensa de
sapata), scanners, Speed Sizer, calandra e enroladeira Pope.

A parte úmida entra **só como geometria**: nenhuma peça daqui tem tag nem ativo,
e as seções `headbox` e `forming` do modelo seguem vazias de propósito. As
formas vêm de `reference/prototypes/mp1-parte-umida.html`, deslocadas para este
referencial — o terceiro par de prensas daquele protótipo é o par que o modelo
já tem em `PRESS_X_M`.
"""

import geom
from machine import FACE, Y_COL, split_by_zone
from parts import M, area_light, box, cyl, poly_tube, ribbon_split, zone_for_x
from machine import assets

#: Rolos do formador de duas telas, em (x, altura, raio).
#: Os cinco primeiros fecham uma tela, os cinco últimos a outra.
FORMER_ROLLS = [
    (-10.2, 2.6, 0.55),
    (-5.6, 3.4, 0.45),
    (-4.6, 7.6, 0.40),
    (-7.8, 9.3, 0.40),
    (-10.4, 6.2, 0.40),
    (-8.6, 3.9, 0.45),
    (-2.8, 4.2, 0.45),
    (-1.8, 8.8, 0.40),
    (-5.8, 11.0, 0.40),
    (-8.2, 7.2, 0.35),
]


def roll_with_housing(name, x, z, r, mat, length=None, housing="mancal_corpo"):
    """Rolo com cubo e munhão nos dois lados — o desenho padrão de rolo da máquina."""
    length = length or FACE
    zone = zone_for_x(x)
    cyl(name, (x, 0, z), r, length, mat, seg=48, zone=zone)
    for sg in (-1, 1):
        cyl(f"{name}_cub{sg}", (x, sg * (length / 2 + 0.2), z), r * 1.1, 0.4, housing, seg=40, zone=zone)
        cyl(f"{name}_eixo{sg}", (x, sg * (length / 2 + 0.45), z), r * 0.28, 0.45, "munhao", seg=24, zone=zone)


# -------------------------------------------------------------- parte úmida
def wet_part():
    """Caixa de entrada, formador e prensas, com a de sapata no par de `PRESS_X_M`."""
    hx, hy = M["HEADBOX_X_M"], M["HEADBOX_Y_M"]

    box("headbox", (hx, 0, hy), (2.6, FACE + 0.8, 2.2), "estrutura_clara", bevel=0.05)
    box("headbox_bico", (hx + 1.4, 0, hy - 0.3), (1.2, FACE + 0.4, 1.0), "munhao")
    cyl("headbox_dist", (hx - 1.4, 0, hy - 0.8), 0.6, FACE + 2, "estrutura_clara", seg=32, r2=0.4)

    for i, (x, z, r) in enumerate(FORMER_ROLLS):
        roll_with_housing(f"former_{i}", x, z, r, "rolo_feltro" if i % 3 else "rolo_borracha")
    for name, group in (("tela_form_a", FORMER_ROLLS[:5]), ("tela_form_b", FORMER_ROLLS[5:])):
        circles = [((x, z), r + 0.01, 1) for x, z, r in group]
        ribbon_split(name, geom.belt(circles, closed=True), FACE - 0.2, "tela_formacao", 0.005)

    # primeira prensa, antes da de sapata
    fx, fr = M["FIRST_PRESS_X_M"], M["FIRST_PRESS_ROLL_RADIUS_M"]
    roll_with_housing("prensa1_inf", fx, M["PRESS_BOTTOM_Y_M"] - 0.6, fr, "rolo_borracha")
    roll_with_housing("prensa1_sup", fx, M["PRESS_TOP_Y_M"] - 0.6, fr, "rolo_feltro")

    _shoe_press()
    _press_felts(fx, fr)
    _wet_platforms()


def _shoe_press():
    """
    Prensa de sapata no par que o modelo já tem.

    O rolo de cima é o rolo de sapata: ganha a correia e, no nip, o trecho
    achatado de `SHOE_PRESS_NIP_LENGTH_M` que distingue a sapata de um nip comum.
    """
    px = M["PRESS_X_M"]
    pr = M["PRESS_ROLL_RADIUS_M"]
    zb, zt = M["PRESS_BOTTOM_Y_M"], M["PRESS_TOP_Y_M"]
    nip = M["SHOE_PRESS_NIP_LENGTH_M"]

    roll_with_housing("prensa_contra", px, zb, pr, "rolo_borracha")
    roll_with_housing("prensa_sapata", px, zt, pr, "rolo_feltro")
    cyl("sapata_correia", (px, 0, zt), pr + 0.06, FACE + 0.3, "sapata_correia", seg=56)
    box(
        "sapata_nip",
        (px, 0, (zb + zt) / 2),
        (nip, FACE + 0.3, max(0.08, (zt - zb) - 2 * pr + 0.08)),
        "sapata_correia",
    )
    for sg in (-1, 1):
        box(
            f"sapata_carga{sg}",
            (px, sg * (FACE / 2 + 0.9), (zb + zt) / 2),
            (1.1, 0.5, zt - zb + 1.6),
            "estrutura_clara",
            bevel=0.04,
        )


def _press_felts(fx, fr):
    """Os feltros das duas prensas, cada um fechando num par de rolos de retorno."""
    loops = (
        ("feltro_p1", [(fx, M["PRESS_TOP_Y_M"] - 0.6, fr + 0.02), (fx - 2.6, 8.6, 0.32), (fx + 2.2, 9.4, 0.32)]),
        (
            "feltro_p2",
            [
                (M["PRESS_X_M"], M["PRESS_TOP_Y_M"], M["PRESS_ROLL_RADIUS_M"] + 0.08),
                (M["PRESS_X_M"] - 2.4, 9.2, 0.32),
                (M["PRESS_X_M"] + 2.6, 9.8, 0.32),
            ],
        ),
    )
    for name, loop in loops:
        circles = [((x, z), r, 1) for x, z, r in loop]
        ribbon_split(name, geom.belt(circles, closed=True), FACE - 0.2, "feltro", 0.006)
        for j, (x, z, r) in enumerate(loop):
            if r < 0.5:
                roll_with_housing(f"{name}_r{j}", x, z, r, "rolo_feltro")


def _wet_platforms():
    """Plataformas em três níveis, guarda-corpo e painéis do lado acionamento."""
    levels = M["WET_PLATFORM_Y_M"]
    z0, z1 = -M["WET_PLATFORM_Z0_M"], -M["WET_PLATFORM_Z1_M"]
    spans = [
        (M["BUILDING_X0_M"] + 5.6, 12.6, levels[0]),
        (-12.4, -1.4, levels[1]),
        (3.6, 12.6, levels[1]),
        (-10.4, 9.6, levels[2]),
    ]
    for k, (x0, x1, y) in enumerate(spans):
        for sa, sb in split_by_zone(x0, x1):
            zone = zone_for_x((sa + sb) / 2)
            box(
                f"plat_{k}_{sa:.1f}",
                ((sa + sb) / 2, (z0 + z1) / 2, y),
                (sb - sa, abs(z0 - z1) + 0.4, 0.12),
                "passarela",
                zone=zone,
                section_hidden=True,
            )
            box(
                f"plat_viga_{k}_{sa:.1f}",
                ((sa + sb) / 2, z1, y - 0.15),
                (sb - sa, 0.3, 0.2),
                "estrutura_clara",
                zone=zone,
                section_hidden=True,
            )
            for zz in (y + 1.1, y + 0.55):
                poly_tube(
                    f"plat_rail_{k}_{sa:.1f}_{zz:.2f}",
                    [(sa, z1, zz), (sb, z1, zz)],
                    0.024,
                    "guarda_corpo",
                    zone=zone,
                    section_hidden=True,
                )
        x = x0
        while x <= x1 + 1e-6:
            poly_tube(
                f"plat_post_{k}_{x:.1f}",
                [(x, z1, y), (x, z1, y + 1.1)],
                0.024,
                "guarda_corpo",
                zone=zone_for_x(x),
                section_hidden=True,
            )
            x += 1.4
        x = x0 + 0.3
        while x < x1:
            box(
                f"plat_col_{k}_{x:.1f}",
                (x, (z0 + z1) / 2, y - 0.5),
                (0.18, 0.18, 0.8),
                "estrutura_clara",
                zone=zone_for_x(x),
                section_hidden=True,
            )
            x += 4.0

    for x in (-11.0, -6.0, -1.0, 4.0, 9.0):
        box(
            f"painel_acion_{x:.0f}",
            (x, Y_COL + 0.9, 1.1),
            (3.2, 0.7, 2.2),
            "painel_acionamento",
            zone=zone_for_x(x),
            bevel=0.03,
        )
    for x, y, w, h in ((-11.4, levels[0], 1.2, 1.6), (-5.4, levels[0], 1.0, 1.3), (5.6, levels[1], 1.4, 1.6)):
        box(
            f"armario_{x:.0f}_{y:.0f}",
            (x, -M["WET_PLATFORM_Z0_M"] - 0.8, y + h / 2 + 0.06),
            (w, 0.7, h),
            "armario_branco",
            zone=zone_for_x(x),
            section_hidden=True,
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
