"""
Geometria do percurso de telas, feltros e folha — sem Blender.

Fica separado de propósito: é a parte que decide a mecânica da máquina, e dá
para conferir num `python geom.py` sem carregar o bpy.

Eixos. O modelo (`geometry.ts`) usa o referencial da cena: X no sentido do
papel, Y a altura a partir do piso de operação, Z atravessando a máquina, com
Z positivo no lado comando. O Blender é Z para cima, então aqui vale

    three (x, y, z)  ->  blender (x, -z, y)

e o lado comando cai em Y negativo, como no protótipo de teste. A exportação
glTF com `export_yup` desfaz a conversão e a cena recebe de volta (x, z, -y).
"""

from math import acos, atan2, cos, hypot, pi, radians, sin


# ------------------------------------------------------------------- eixos
def to_blender(p):
    """three (x, y, z) -> blender (x, -z, y)."""
    x, y, z = p
    return (x, -z, y)


def to_scene(p):
    """blender (x, y, z) -> three (x, z, -y). O inverso, para conferência."""
    x, y, z = p
    return (x, z, -y)


# --------------------------------------------------------- correias (2D x,y)
# As funções abaixo trabalham no plano do corte lateral: (x, altura). É o mesmo
# plano em que uma tela é desenhada numa folha de papel, e o que sai daqui vira
# fita 3D esticada ao longo de Z.


def tangent(c1, r1, s1, c2, r2, s2):
    """
    Tangente de saída de c1 e chegada em c2, para uma correia que passa por
    círculos com sentidos dados: s = +1 anti-horário, −1 horário, visto do lado
    comando. r = 0 trata o círculo como ponto de passagem.
    """
    D = (c2[0] - c1[0], c2[1] - c1[1])
    L = hypot(*D)
    if L < 1e-9:
        raise ValueError("dois círculos no mesmo centro")
    phi = atan2(D[1], D[0])
    for a1 in (1, -1):
        for a2 in (1, -1):
            k = (a1 * r1 - a2 * r2) / L
            if abs(k) > 1:
                continue
            for sg in (1, -1):
                th = phi + sg * acos(k)
                n = (cos(th), sin(th))
                p1 = (c1[0] + a1 * r1 * n[0], c1[1] + a1 * r1 * n[1])
                p2 = (c2[0] + a2 * r2 * n[0], c2[1] + a2 * r2 * n[1])
                d = (p2[0] - p1[0], p2[1] - p1[1])
                ok = True
                for c, r, s, p in ((c1, r1, s1, p1), (c2, r2, s2, p2)):
                    if r == 0:
                        continue
                    u = (p[0] - c[0], p[1] - c[1])
                    v = (-s * u[1], s * u[0])
                    if d[0] * v[0] + d[1] * v[1] <= 1e-6:
                        ok = False
                if ok:
                    return p1, p2
    raise ValueError(f"sem tangente de {c1} r={r1} para {c2} r={r2}")


def arc(c, r, s, p_in, p_out, step=radians(3)):
    """Polilinha do arco percorrido sobre um círculo, de p_in a p_out."""
    a0 = atan2(p_in[1] - c[1], p_in[0] - c[0])
    a1 = atan2(p_out[1] - c[1], p_out[0] - c[0])
    span = (a1 - a0) % (2 * pi) if s > 0 else (a0 - a1) % (2 * pi)
    n = max(1, int(span / step))
    return [
        (c[0] + r * cos(a0 + s * span * i / n), c[1] + r * sin(a0 + s * span * i / n))
        for i in range(n + 1)
    ]


def belt(circles, closed):
    """
    Polilinha de uma correia que encosta numa sequência de círculos.

    `circles` é uma lista de (centro, raio, sentido). Devolve os pontos (x, y)
    no plano do corte lateral.
    """
    segs = []
    m = len(circles)
    pairs = range(m) if closed else range(m - 1)
    for i in pairs:
        a, b = circles[i], circles[(i + 1) % m]
        segs.append(tangent(a[0], a[1], a[2], b[0], b[1], b[2]))
    pts = []
    if not closed:
        pts.append(segs[0][0])
    for i in range(len(segs)):
        p_in = segs[i][1]
        j = (i + 1) % m
        nxt = segs[i + 1] if i + 1 < len(segs) else (segs[0] if closed else None)
        c = circles[j]
        if nxt is None or c[1] == 0:
            pts.append(p_in)
        else:
            pts.extend(arc(c[0], c[1], c[2], p_in, nxt[0]))
    if closed:
        pts.append(pts[0])
    return pts


def wrap_angle(c, r, s, p_in, p_out):
    """Quanto a correia abraça um círculo, em graus. Serve para conferir a mecânica."""
    a0 = atan2(p_in[1] - c[1], p_in[0] - c[0])
    a1 = atan2(p_out[1] - c[1], p_out[0] - c[0])
    span = (a1 - a0) % (2 * pi) if s > 0 else (a0 - a1) % (2 * pi)
    return span * 180 / pi


def wraps(circles, closed):
    """O abraço em cada círculo da correia, na ordem em que ela passa."""
    segs = []
    m = len(circles)
    pairs = range(m) if closed else range(m - 1)
    for i in pairs:
        a, b = circles[i], circles[(i + 1) % m]
        segs.append(tangent(a[0], a[1], a[2], b[0], b[1], b[2]))
    out = []
    for i in range(1 if not closed else 0, m if closed else m - 1):
        c = circles[i]
        if c[1] == 0:
            continue
        prev = segs[i - 1] if i > 0 else segs[-1]
        nxt = segs[i] if i < len(segs) else segs[0]
        out.append((i, wrap_angle(c[0], c[1], c[2], prev[1], nxt[0])))
    return out


# -------------------------------------------------- telas da secagem (MP1)
def dryer_rows(cylinders, top_y, bottom_y):
    """Separa os cilindros de uma secagem em fileira superior e inferior."""
    mid = (top_y + bottom_y) / 2
    top = sorted([c for c in cylinders if c[1] > mid])
    bottom = sorted([c for c in cylinders if c[1] <= mid])
    return top, bottom


def felt_loop(row, upper, radius, rise, roll_radius, clearance, pitch):
    """
    O percurso fechado da tela de uma fileira de cilindros secadores.

    Com o passo de 2,2 m e o raio de 1,05 m sobram 10 cm entre dois cilindros do
    mesmo nível: não cabe rolo no vão. O rolo de retorno sai do vão e vai para
    fora da fileira — acima da linha de centro no nível superior, abaixo dela no
    inferior —, a meio vão e a `rise` da linha de centro.

    Os rolos de entrada e de saída do grupo ficam na **mesma** altura dos de meio
    vão, meio passo antes do primeiro cilindro e meio passo depois do último. É
    isso que dá ao primeiro e ao último cilindro o mesmo abraço dos de dentro:
    pondo-os mais alto, a tela desceria em cima do cilindro e o abraçaria mal.

    `upper` escolhe de que lado o retorno fica. Devolve a lista de círculos para
    `belt(..., closed=True)`.
    """
    sg = 1 if upper else -1
    rf = radius + clearance
    x0, y0 = row[0]
    x1, y1 = row[-1]

    # entrada do grupo, na altura dos rolos de meio vão
    circles = [((x0 - pitch / 2, y0 + sg * rise), roll_radius, sg)]
    for i, (x, y) in enumerate(row):
        # a tela encosta na face do cilindro pelo lado de fora da fileira
        circles.append(((x, y), rf, -sg))
        if i < len(row) - 1:
            nx = row[i + 1][0]
            circles.append((((x + nx) / 2, y + sg * rise), roll_radius, sg))
    # saída do grupo, simétrica à entrada
    circles.append(((x1 + pitch / 2, y1 + sg * rise), roll_radius, sg))

    # retorno: sobe (ou desce) e volta por fora, fechando o laço
    far = rise + 1.6 * radius
    back = rise + 2.7 * radius
    circles += [
        ((x1 + pitch / 2 + 0.9 * radius, y1 + sg * far), roll_radius * 1.45, sg),
        ((x1 + 0.6 * radius, y1 + sg * back), roll_radius * 1.45, sg),
        (((x0 + x1) / 2, y1 + sg * (back + 0.3 * radius)), roll_radius * 1.6, sg),
        ((x0 - 0.6 * radius, y0 + sg * back), roll_radius * 1.45, sg),
        ((x0 - pitch / 2 - 0.9 * radius, y0 + sg * far), roll_radius * 1.45, sg),
    ]
    return circles


def paper_path(top, bottom, entry, exit_point, radius, clearance):
    """
    A serpentina da folha numa secagem de dois níveis.

    A folha sobe no cilindro superior e desce no inferior, alternando a face que
    toca o ferro — é o que a serpentina de dois níveis faz.
    """
    rp = radius + clearance
    circles = [(entry, 0, 1)]
    for i in range(len(top)):
        circles.append((top[i], rp, -1))
        if i < len(bottom):
            circles.append((bottom[i], rp, 1))
    circles.append((exit_point, 0, 1))
    return circles


# --------------------------------------------------------------- conferência
def check_felt(row, upper, radius, rise, roll_radius, clearance, pitch):
    """
    Folga e abraço de um percurso de tela, para o relatório do corte lateral.

    Devolve (folga mínima entre um rolo da tela e qualquer cilindro, abraço
    mínimo e máximo nos cilindros, em graus).
    """
    rf = radius + clearance
    circles = felt_loop(row, upper, radius, rise, roll_radius, clearance, pitch)
    rolls = [(c, r) for c, r, _ in circles if r <= radius * 0.8]
    gap = min(
        hypot(rc[0] - cx, rc[1] - cy) - (rf + rr)
        for rc, rr in rolls
        for cx, cy in row
    )
    on_cylinders = [w for i, w in wraps(circles, True) if circles[i][1] > radius * 0.8]
    return gap, min(on_cylinders), max(on_cylinders)


if __name__ == "__main__":
    import json
    import os

    here = os.path.dirname(os.path.abspath(__file__))
    data = json.load(open(os.path.join(here, "machine.json"), encoding="utf-8"))
    m = data["measurements"]
    cylinders = [
        (a["position"][0], a["position"][1])
        for s in data["model"]["sections"]
        for a in s["assets"]
        if a["kind"] == "dryer-cylinder" and s["id"] == "pre-dryer"
    ]
    top, bottom = dryer_rows(cylinders, m["DRYER_TOP_Y_M"], m["DRYER_BOTTOM_Y_M"])
    print(f"pré-secagem: {len(top)} cilindros em cima, {len(bottom)} embaixo")
    print(f"folga entre cilindros do mesmo nível: {m['DRYER_PITCH_M'] - 2 * m['DRYER_RADIUS_M']:.3f} m")
    for name, row, upper in (("superior", top, True), ("inferior", bottom, False)):
        gap, lo, hi = check_felt(
            row,
            upper,
            m["DRYER_RADIUS_M"],
            m["FELT_ROLL_RISE_M"],
            m["FELT_ROLL_RADIUS_M"],
            m["FELT_CLEARANCE_M"],
            m["DRYER_PITCH_M"],
        )
        print(f"tela {name}: folga {gap:+.3f} m · abraço {lo:.0f}°–{hi:.0f}° nos cilindros")
