"""
Secagem MP1 — teste de realismo (grupo G4, CS19–CS26, dois níveis).

Gera a cena no Blender por código, assa a luz (irradiância) em lightmaps e
exporta GLB + lightmaps + posições dos mancais para a página Three.js.

Eixos (Blender, Z para cima): X = sentido da máquina, Y = transversal
(lado comando/operação em -Y, lado acionamento em +Y), Z = altura.
No glTF/Three.js isso vira (x, z, -y): lado comando fica em +Z.

Uso:
  python3 build.py preview   # render rápido da câmera principal (conferir mecânica)
  python3 build.py bake      # assa lightmaps e exporta
"""
import bpy, bmesh, math, json, os, sys
from math import pi, sin, cos, atan2, acos, hypot, radians
from mathutils import Matrix, Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- parâmetros
R = 1.0            # raio do cilindro secador (Ø 2,0 m)
FACE = 8.2         # comprimento da mesa do cilindro
P = 2.6            # passo entre cilindros do mesmo nível
Z_TOP = 4.65       # centro do nível superior (piso de operação = 0)
Z_BOT = 1.55       # centro do nível inferior
W_PAPER = 7.9
W_FELT = 8.1
Y_WALL = 4.35      # paredes da capota (lado comando em -Y)
Y_FRAME = 4.75     # linha dos mancais e da estrutura
X0, X1 = -1.95, 3.5 * P + 1.95   # extensão da capota
FIRST_CS = 19      # CS19..CS26 (G4)

TOP = [(i * P, Z_TOP) for i in range(4)]            # CS19, 21, 23, 25
BOT = [(i * P + P / 2, Z_BOT) for i in range(4)]    # CS20, 22, 24, 26

# ---------------------------------------------------------------- utilidades
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
SC = bpy.context.scene
COL = SC.collection
GROUPS = {"MAQ": [], "PRED": []}
MAT = {}


def material(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    MAT[name] = m
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# Materiais: o nome é o contrato com a página (ela troca por materiais TSL).
# Cores aqui servem para a cor da luz rebatida no bake.
for n, c, r, m in [
    ("cil_ferro", "#5a5d60", 0.3, 1.0), ("cil_cabeca", "#3b3f44", 0.6, 0.0),
    ("munhao", "#8a8d90", 0.35, 1.0), ("estrutura", "#2e3236", 0.6, 0.0),
    ("mancal_corpo", "#2f5d8a", 0.45, 0.0), ("mancal_tampa", "#d8cfb4", 0.5, 0.0),
    ("protecao_amarela", "#e2b21c", 0.5, 0.0), ("junta_latao", "#b08d4a", 0.35, 1.0),
    ("mangueira", "#141414", 0.7, 0.0), ("caixa_juncao", "#9aa0a6", 0.5, 0.0),
    ("feltro", "#2c3e4a", 0.95, 0.0), ("papel", "#e9e9e4", 0.85, 0.0),
    ("rolo_feltro", "#7d8287", 0.35, 1.0), ("capota_painel", "#b9bec2", 0.5, 0.0),
    ("capota_porta", "#c4c8cb", 0.45, 0.0), ("capota_moldura", "#8c9196", 0.4, 0.5),
    ("vidro", "#1a1f24", 0.08, 0.0), ("passarela", "#7c8085", 0.55, 0.8),
    ("guarda_corpo", "#e2b21c", 0.45, 0.0), ("tubo_vermelho", "#9b2a22", 0.45, 0.0),
    ("tubo_isolado", "#c9ccce", 0.3, 0.9), ("duto", "#9ea3a6", 0.4, 0.8),
    ("piso", "#7b7a76", 0.7, 0.0), ("fosso", "#4a4a47", 0.8, 0.0),
    ("refugo", "#dcdcd6", 0.9, 0.0), ("parede", "#8d8b84", 0.85, 0.0),
    ("telhado", "#3c3f42", 0.6, 0.3), ("trelica", "#585d62", 0.5, 0.6),
    ("pilar", "#c9b994", 0.6, 0.0), ("faixa_amarela", "#d9a816", 0.6, 0.0),
    ("faixa_zebrada", "#d9a816", 0.6, 0.0),
]:
    material(n, srgb(c), r, m)
material("lampada", (1, 1, 1), 0.5, 0, emit=srgb("#ffe2b8"), strength=20.0)
material("claraboia", (1, 1, 1), 0.5, 0, emit=srgb("#dfe9f2"), strength=6.0)


def link(name, bm, mat, group, smooth=False):
    me = bpy.data.meshes.new(name)
    if smooth:
        for f in bm.faces:
            f.smooth = True
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    me.materials.append(MAT[mat])
    GROUPS[group].append(ob)
    return ob


def box(name, c, s, mat, group="MAQ", bevel=0.0, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(s), verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2,
                        affect="EDGES", profile=0.5, clamp_overlap=True)
    if rot is not None:
        bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(c), verts=bm.verts)
    return link(name, bm, mat, group)


AX = {"X": Matrix.Rotation(pi / 2, 4, "Y"), "Y": Matrix.Rotation(pi / 2, 4, "X"),
      "Z": Matrix.Identity(4)}


def cyl(name, c, r, d, mat, axis="Y", seg=48, group="MAQ", r2=None, caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg,
                          radius1=r, radius2=r if r2 is None else r2, depth=d)
    # laterais lisas, tampas planas
    for f in bm.faces:
        f.smooth = abs(f.normal.z) < 0.5
    bmesh.ops.transform(bm, matrix=AX[axis], verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(c), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    me.materials.append(MAT[mat])
    GROUPS[group].append(ob)
    return ob


def tube(name, pts, r, mat, group="MAQ", res=10):
    """Tubo/mangueira/corrimão ao longo de uma polilinha (curva com bevel)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    sp.resolution_u = res
    ob = bpy.data.objects.new(name, cu)
    COL.objects.link(ob)
    cu.materials.append(MAT[mat])
    GROUPS[group].append(ob)
    return ob


def poly_tube(name, pts, r, mat, group="MAQ"):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (*q, 1)
    ob = bpy.data.objects.new(name, cu)
    COL.objects.link(ob)
    cu.materials.append(MAT[mat])
    GROUPS[group].append(ob)
    return ob


# ------------------------------------------------- trajetórias (papel e telas)
def tangent(c1, r1, s1, c2, r2, s2):
    """Tangente de saída de c1 e chegada em c2 para uma correia com sentidos
    s (+1 anti-horário, -1 horário, vista do lado comando). r=0 = ponto."""
    D = (c2[0] - c1[0], c2[1] - c1[1])
    L = hypot(*D)
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
                for (c, r, s, p) in ((c1, r1, s1, p1), (c2, r2, s2, p2)):
                    if r == 0:
                        continue
                    u = (p[0] - c[0], p[1] - c[1])
                    v = (-s * u[1], s * u[0])
                    if d[0] * v[0] + d[1] * v[1] <= 1e-6:
                        ok = False
                if ok:
                    return p1, p2
    raise ValueError(f"sem tangente {c1}->{c2}")


def arc(c, r, s, p_in, p_out, step=radians(3)):
    a0 = atan2(p_in[1] - c[1], p_in[0] - c[0])
    a1 = atan2(p_out[1] - c[1], p_out[0] - c[0])
    span = (a1 - a0) % (2 * pi) if s > 0 else (a0 - a1) % (2 * pi)
    n = max(1, int(span / step))
    return [(c[0] + r * cos(a0 + s * span * i / n), c[1] + r * sin(a0 + s * span * i / n))
            for i in range(n + 1)]


def belt(circles, closed):
    """circles: [(centro, raio, sentido)]. Retorna polilinha 2D (x, z)."""
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


def ribbon(name, pts, width, mat, thick, group="MAQ", y0=0.0):
    bm = bmesh.new()
    vs = []
    for (x, z) in pts:
        vs.append((bm.verts.new((x, y0 - width / 2, z)), bm.verts.new((x, y0 + width / 2, z))))
    for (a, b), (c, d) in zip(vs[:-1], vs[1:]):
        if (a.co - c.co).length > 1e-5:
            bm.faces.new((a, b, d, c))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, mat, group, smooth=True)
    mod = ob.modifiers.new("esp", "SOLIDIFY")
    mod.thickness = thick
    mod.offset = 0
    return ob


# ------------------------------------------------------------------ cilindros
bearings = []   # mancais clicáveis (lado comando)


def bearing(x, z, cs, side):
    y = -Y_FRAME if side == "LC" else Y_FRAME
    sg = -1 if side == "LC" else 1
    box(f"mancal_{cs}_{side}", (x, y, z), (0.62, 0.42, 0.58), "mancal_corpo", bevel=0.03)
    cyl(f"tampa_{cs}_{side}", (x, y + sg * 0.27, z), 0.25, 0.12, "mancal_tampa", seg=32)
    # sensor de vibração (VI) no topo e cabo para a caixa de junção
    cyl(f"sensor_{cs}_{side}", (x, y, z + 0.33), 0.035, 0.09, "junta_latao", axis="Z", seg=12)
    if side == "LC":
        box(f"protecao_{cs}", (x, y - 0.5, z), (0.44, 0.3, 0.44), "protecao_amarela", bevel=0.02)
        cyl(f"flange_{cs}", (x, y - 0.69, z), 0.15, 0.05, "junta_latao", seg=24)
        cyl(f"junta_{cs}", (x, y - 0.85, z), 0.11, 0.28, "junta_latao", seg=24)
        cyl(f"cotovelo_{cs}", (x, y - 0.95, z - 0.12), 0.045, 0.2, "junta_latao", axis="Z", seg=12)
        jb = (x + 0.42, y - 0.05, z + 0.55)
        box(f"cxj_{cs}", jb, (0.16, 0.12, 0.22), "caixa_juncao", bevel=0.01)
        tube(f"cabo_{cs}", [(x, y, z + 0.38), (x + 0.2, y - 0.02, z + 0.62), (jb[0] - 0.08, jb[1], jb[2])],
             0.008, "mangueira")
        bearings.append({"cs": cs, "x": x, "z": z, "y": y})


def dryer(x, z, cs):
    cyl(f"CS{cs}", (x, 0, z), R, FACE, "cil_ferro", seg=72)
    for sg in (-1, 1):
        cyl(f"cab{cs}{sg}", (x, sg * (FACE / 2 + 0.03), z), R * 0.97, 0.06, "cil_cabeca", seg=72)
        cyl(f"munhao{cs}{sg}", (x, sg * (FACE / 2 + 0.35), z), 0.19, 0.6, "munhao", seg=32)
    bearing(x, z, cs, "LC")
    bearing(x, z, cs, "LA")
    # caixa de engrenagem no lado acionamento
    box(f"engr{cs}", (x, Y_FRAME + 0.55, z), (1.5, 0.4, 1.5), "estrutura", bevel=0.04)


for i, (x, z) in enumerate(TOP):
    dryer(x, z, FIRST_CS + 2 * i)
for i, (x, z) in enumerate(BOT):
    dryer(x, z, FIRST_CS + 2 * i + 1)

# ------------------------------------------------------- papel, telas e rolos
paper_c = [((-1.95, 2.6), 0, 1)]
for i in range(4):
    paper_c += [(TOP[i], R + 0.004, -1), (BOT[i], R + 0.004, 1)]
paper_c += [((X1, 2.9), 0, 1)]
ribbon("papel", belt(paper_c, closed=False), W_PAPER, "papel", 0.003)

felt_rolls = []
rf = R + 0.016
top_felt = [((-1.25, Z_TOP + 1.45), 0.22, 1)]
for i in range(4):
    top_felt.append((TOP[i], rf, -1))
    if i < 3:
        k = ((i + 0.5) * P, Z_TOP + 0.36)
        top_felt.append((k, 0.2, 1))
top_felt += [((3 * P + 1.25, Z_TOP + 1.45), 0.22, 1), ((3 * P + 1.0, Z_TOP + 2.25), 0.22, 1),
             ((2.0 * P, Z_TOP + 2.3), 0.22, 1), ((1.0 * P, Z_TOP + 2.5), 0.24, 1),
             ((-1.0, Z_TOP + 2.25), 0.22, 1)]
bot_felt = [((BOT[0][0] - 1.25, Z_BOT - 1.45), 0.22, -1)]
for i in range(4):
    bot_felt.append((BOT[i], rf, 1))
    if i < 3:
        bot_felt.append((((i + 1) * P, Z_BOT - 0.36), 0.2, -1))
bot_felt += [((BOT[3][0] + 1.25, Z_BOT - 1.45), 0.22, -1), ((BOT[3][0] + 1.0, Z_BOT - 2.3), 0.22, -1),
             ((2.5 * P, Z_BOT - 2.4), 0.22, -1), ((1.5 * P, Z_BOT - 2.6), 0.24, -1),
             ((BOT[0][0] - 1.0, Z_BOT - 2.3), 0.22, -1)]
for nm, loop in (("tela_sup", top_felt), ("tela_inf", bot_felt)):
    ribbon(nm, belt(loop, closed=True), W_FELT, "feltro", 0.006)
    for j, (c, r, s) in enumerate(loop):
        if r < 0.5:
            cyl(f"rolo_{nm}_{j}", (c[0], 0, c[1]), r - 0.008, W_FELT + 0.3, "rolo_feltro", seg=40)
            for sg in (-1, 1):
                cyl(f"rolo_eixo_{nm}_{j}{sg}", (c[0], sg * (W_FELT / 2 + 0.16), c[1]), 0.07, 0.12, "munhao", seg=16)
                box(f"rolo_mancal_{nm}_{j}{sg}", (c[0], sg * (W_FELT / 2 + 0.17), c[1]), (0.22, 0.08, 0.26),
                    "mancal_corpo", bevel=0.015)

# ------------------------------------------------------------------ estrutura
cols = [-0.65] + [i * P + q for i in range(4) for q in (P / 4, 3 * P / 4)]
for sg in (-1, 1):
    y = sg * Y_FRAME
    for x in cols:
        box(f"col{x:.2f}{sg}", (x, y, 3.45), (0.28, 0.36, 6.9), "estrutura", bevel=0.02)
    for zb in (0.18, 2.95, 6.9):
        box(f"viga{zb}{sg}", ((cols[0] + cols[-1]) / 2, y, zb), (cols[-1] - cols[0] + 0.28, 0.36, 0.34),
            "estrutura", bevel=0.02)
    for (x, z) in TOP:
        box(f"ped_t{x}{sg}", (x, y, (3.12 + z - 0.29) / 2), (0.5, 0.34, z - 0.29 - 3.12), "estrutura", bevel=0.02)
    for (x, z) in BOT:
        box(f"ped_b{x}{sg}", (x, y, (0.35 + z - 0.29) / 2), (0.5, 0.34, z - 0.29 - 0.35), "estrutura", bevel=0.02)

# -------------------------------------------------------------------- capota
ZR = 7.6
box("capota_teto", ((X0 + X1) / 2, 0, ZR + 0.1), (X1 - X0 + 0.3, 2 * Y_WALL + 0.3, 0.2), "capota_painel", bevel=0.03)
box("capota_la", ((X0 + X1) / 2, Y_WALL, ZR / 2), (X1 - X0, 0.12, ZR), "capota_painel")
for x in (X0, X1):
    box(f"capota_ext{x}", (x, 0, ZR / 2), (0.12, 2 * Y_WALL, ZR), "capota_painel")

DW = 1.8   # largura da porta
lower = [x for x, _ in TOP]                    # portas inferiores entre mancais inferiores
upper = [x for x, _ in BOT]                    # portas superiores entre mancais superiores
Z_SPLIT = 3.3


def wall_fill(z0, z1, door_xs, tag):
    edges = [X0] + [e for x in door_xs for e in (x - DW / 2, x + DW / 2)] + [X1]
    for a, b in zip(edges[0::2], edges[1::2]):
        if b - a > 0.02:
            box(f"painel_{tag}{a:.2f}", ((a + b) / 2, -Y_WALL, (z0 + z1) / 2), (b - a, 0.12, z1 - z0), "capota_painel")
    for x in door_xs:   # batentes
        for e in (x - DW / 2, x + DW / 2):
            box(f"batente_{tag}{e:.2f}", (e, -Y_WALL - 0.08, (z0 + z1) / 2), (0.08, 0.06, z1 - z0), "capota_moldura")


def door(x, z_top, h, angle, tag):
    """Porta basculante: pivô no topo, abre para fora (-Y)."""
    hinge = Matrix.Translation((x, -Y_WALL - 0.1, z_top)) @ Matrix.Rotation(-radians(angle), 4, "X")

    def part(nm, c, s, mat, bev=0.0):
        box(f"{nm}_{tag}", (0, 0, 0), s, mat, bevel=bev,
            rot=hinge @ Matrix.Translation(c))

    part("porta", (0, 0, -h / 2), (DW - 0.04, 0.09, h - 0.03), "capota_porta", 0.015)
    # janelas em grade (2 x 3) na metade superior
    wz0, wz1 = -0.25, -0.25 - h * 0.55
    for cx in (-0.42, 0.42):
        for k in range(3):
            zc = wz0 + (wz1 - wz0) * (k + 0.5) / 3
            part(f"vidro{cx}{k}", (cx, -0.05, zc), (0.66, 0.02, (wz0 - wz1) / 3 - 0.1), "vidro")
    for cx in (-0.81, 0.0, 0.81):
        part(f"montante{cx}", (cx, -0.065, (wz0 + wz1) / 2), (0.07, 0.04, wz0 - wz1 + 0.07), "capota_moldura")
    for k in range(4):
        zc = wz0 + (wz1 - wz0) * k / 3
        part(f"travessa{k}", (0, -0.065, zc), (1.69, 0.04, 0.07), "capota_moldura")
    part("puxador", (0, -0.12, -h + 0.25), (0.5, 0.05, 0.05), "capota_moldura")


wall_fill(0.0, Z_SPLIT, lower, "inf")
wall_fill(Z_SPLIT, ZR, upper, "sup")
box("capota_faixa", ((X0 + X1) / 2, -Y_WALL - 0.04, Z_SPLIT), (X1 - X0, 0.16, 0.12), "capota_moldura")
for i, x in enumerate(lower):
    door(x, Z_SPLIT - 0.03, Z_SPLIT - 0.08, 0.0, f"i{i}")
OPEN = {1: 68.0, 3: 60.0}
for i, x in enumerate(upper):
    door(x, ZR - 0.03, ZR - Z_SPLIT - 0.08, OPEN.get(i, 0.0), f"s{i}")

# lâmpadas internas da capota (iluminam o que aparece pelas portas abertas)
for x in (X0 + 2.5, (X0 + X1) / 2, X1 - 2.5):
    box(f"lamp_capota{x:.1f}", (x, -Y_WALL + 0.45, ZR - 0.15), (1.2, 0.12, 0.06), "lampada")

# dutos de exaustão
for x in (2.0, 7.8):
    cyl(f"duto{x}", (x, 0.8, ZR + 3.6), 0.6, 7.0, "duto", axis="Z", seg=40)
    cyl(f"duto_base{x}", (x, 0.8, ZR + 0.35), 0.75, 0.3, "duto", axis="Z", seg=40)
box("caixa_ar", (5.0, -1.6, ZR + 0.75), (3.0, 1.6, 1.1), "duto", bevel=0.03)

# ------------------------------------------------------ passarela e escada
WZ, WY0, WY1 = 3.35, -5.75, -7.0
wx0, wx1 = X0, X1
box("passarela", ((wx0 + wx1) / 2, (WY0 + WY1) / 2, WZ - 0.04), (wx1 - wx0, WY0 - WY1, 0.08), "passarela")
for yy in (WY0 + 0.05, WY1 + 0.05):
    box(f"pass_viga{yy}", ((wx0 + wx1) / 2, yy, WZ - 0.2), (wx1 - wx0, 0.1, 0.24), "estrutura")
x = wx0 + 0.3
while x < wx1:
    box(f"pass_col{x:.1f}", (x, WY1 + 0.1, WZ / 2 - 0.1), (0.14, 0.14, WZ - 0.2), "estrutura")
    x += 2.6
# guarda-corpo
x = wx0
posts = []
while x <= wx1 + 1e-6:
    posts.append(x)
    x += 1.3
for x in posts:
    poly_tube(f"gc_post{x:.1f}", [(x, WY1 + 0.05, WZ), (x, WY1 + 0.05, WZ + 1.1)], 0.024, "guarda_corpo")
for zz in (WZ + 1.1, WZ + 0.55):
    poly_tube(f"gc_rail{zz}", [(wx0, WY1 + 0.05, zz), (wx1, WY1 + 0.05, zz)], 0.024, "guarda_corpo")
box("gc_rodape", ((wx0 + wx1) / 2, WY1 + 0.05, WZ + 0.06), (wx1 - wx0, 0.02, 0.12), "guarda_corpo")
poly_tube("gc_fim", [(wx1, WY1 + 0.05, WZ + 1.1), (wx1, WY0, WZ + 1.1)], 0.024, "guarda_corpo")
# escada na extremidade esquerda, descendo em -X
n = 17
run = 4.2
for k in range(n):
    t = (k + 1) / n
    box(f"degrau{k}", (wx0 - run * t + 0.12, (WY0 + WY1) / 2, WZ - WZ * t + 0.02),
        (0.26, 1.0, 0.04), "passarela")
for yy in (WY0 - 0.12, WY1 + 0.12):
    poly_tube(f"banzo{yy}", [(wx0, yy, WZ - 0.08), (wx0 - run, yy, -0.08)], 0.06, "estrutura")
    poly_tube(f"corrimao{yy}", [(wx0, yy, WZ + 0.95), (wx0 - run, yy, 0.95), (wx0 - run - 0.3, yy, 0.95)],
              0.022, "guarda_corpo")
    for t in (0.0, 0.5, 1.0):
        poly_tube(f"corr_post{yy}{t}", [(wx0 - run * t, yy, WZ * (1 - t) - 0.05), (wx0 - run * t, yy, WZ * (1 - t) + 0.95)],
                  0.022, "guarda_corpo")

# --------------------------------------------- vapor e condensado (lado comando)
HY = -5.95
poly_tube("coletor_vapor_sup", [(X0 - 0.2, HY, WZ + 0.42), (X1 + 0.2, HY, WZ + 0.42)], 0.13, "tubo_isolado")
poly_tube("coletor_cond_inf", [(X0 - 0.2, HY, 0.32), (X1 + 0.2, HY, 0.32)], 0.11, "tubo_vermelho")
poly_tube("coletor_vapor_inf", [(X0 - 0.2, HY - 0.32, 0.32), (X1 + 0.2, HY - 0.32, 0.32)], 0.12, "tubo_isolado")
for b in bearings:
    x, z, y = b["x"], b["z"], b["y"]
    top_tier = z > 3
    hz = WZ + 0.42 if top_tier else 0.32
    start = (x, y - 0.97, z - 0.22)
    tube(f"mangueira_{b['cs']}", [start, (x + 0.05, y - 1.1, z - 0.55), (x + 0.25, HY, hz + 0.5),
                                  (x + 0.3, HY, hz + 0.12)], 0.045, "mangueira")

# ------------------------------------------------------------------- prédio
G = "PRED"
FX0, FX1, FY0, FY1 = -18.0, 30.0, -24.0, 14.0
PX0, PX1, PY = X0 + 0.05, X1 - 0.05, Y_WALL - 0.05
T = 0.3
for nm, (a, b, c, d) in {"piso_frente": (FX0, FX1, FY0, -PY), "piso_fundo": (FX0, FX1, PY, FY1),
                         "piso_esq": (FX0, PX0, -PY, PY), "piso_dir": (PX1, FX1, -PY, PY)}.items():
    box(nm, ((a + b) / 2, (c + d) / 2, -T / 2), (b - a, d - c, T), "piso", G)
PZ = -3.6
box("fosso_fundo", ((PX0 + PX1) / 2, 0, PZ - 0.1), (PX1 - PX0, 2 * PY, 0.2), "fosso", G)
for nm, (c, s) in {"fosso_lc": ((PX0 + PX1) / 2, -PY - 0.1), "fosso_la": ((PX0 + PX1) / 2, PY + 0.1)}.items():
    box(nm, (c, s, PZ / 2), (PX1 - PX0, 0.2, -PZ), "fosso", G)
for x in (PX0 - 0.1, PX1 + 0.1):
    box(f"fosso_ext{x}", (x, 0, PZ / 2), (0.2, 2 * PY, -PZ), "fosso", G)
# refugo acumulado no porão
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
import random
random.seed(7)
for v in bm.verts:
    n = 0.12 * sin(5 * v.co.x + 2) * cos(4 * v.co.y) + random.uniform(-0.05, 0.05)
    v.co *= 1 + n
    v.co.z = max(v.co.z, -0.1)
bmesh.ops.scale(bm, vec=(3.2, 2.2, 0.75), verts=bm.verts)
bmesh.ops.translate(bm, vec=(5.5, 0.6, PZ), verts=bm.verts)
link("refugo", bm, "refugo", G, smooth=True)
for x in (1.0, 5.5, 9.5):   # pilares bege do porão
    for sg in (-1, 1):
        box(f"pilar_porao{x}{sg}", (x, sg * 3.6, PZ / 2), (0.45, 0.45, -PZ), "pilar", G, bevel=0.02)
poly_tube("porao_tubo1", [(PX0, -PY + 0.35, -1.1), (PX1, -PY + 0.35, -1.1)], 0.16, "tubo_vermelho", G)
poly_tube("porao_tubo2", [(PX0, -PY + 0.35, -1.65), (PX1, -PY + 0.35, -1.65)], 0.11, "tubo_vermelho", G)

H = 15.0
for nm, (c, s) in {"parede_frente": (((FX0 + FX1) / 2, FY0, H / 2), (FX1 - FX0, 0.3, H)),
                   "parede_fundo": (((FX0 + FX1) / 2, FY1, H / 2), (FX1 - FX0, 0.3, H)),
                   "parede_esq": ((FX0, (FY0 + FY1) / 2, H / 2), (0.3, FY1 - FY0, H)),
                   "parede_dir": ((FX1, (FY0 + FY1) / 2, H / 2), (0.3, FY1 - FY0, H))}.items():
    box(nm, c, s, "parede", G)
# telhado com duas faixas de claraboia
SKY = [(-15.6, -13.6), (-11.0, -9.6)]
edges = [FY0] + [e for s in SKY for e in s] + [FY1]
for a, b in zip(edges[0::2], edges[1::2]):
    box(f"telhado{a}", ((FX0 + FX1) / 2, (a + b) / 2, H + 0.1), (FX1 - FX0, b - a, 0.2), "telhado", G)
SKY_X = [-12.0, -6.0, 0.0, 6.0, 12.0, 18.0, 24.0]   # painéis de 3,6 m entre treliças
for (a, b) in SKY:
    xs = [FX0] + [e for c in SKY_X for e in (c - 1.8, c + 1.8)] + [FX1]
    for p, q in zip(xs[0::2], xs[1::2]):
        box(f"telhado_sk{a}_{p}", ((p + q) / 2, (a + b) / 2, H + 0.1), (q - p, b - a, 0.2), "telhado", G)
for (a, b) in SKY:
    box(f"clara_borda{a}", ((FX0 + FX1) / 2, a, H + 0.25), (FX1 - FX0, 0.1, 0.3), "trelica", G)
    box(f"clara_borda{b}", ((FX0 + FX1) / 2, b, H + 0.25), (FX1 - FX0, 0.1, 0.3), "trelica", G)
# treliças e pilares do prédio
x = FX0 + 3
while x < FX1 - 1:
    for zz in (H - 0.15, H - 1.9):
        box(f"banzo_t{x}{zz}", (x, (FY0 + FY1) / 2, zz), (0.18, FY1 - FY0, 0.18), "trelica", G)
    yy = FY0 + 1.5
    k = 0
    while yy < FY1 - 1:
        box(f"mont{x}{yy}", (x, yy, H - 1.02), (0.1, 0.1, 1.75), "trelica", G)
        ang = atan2(1.75, 3.0) * (1 if k % 2 else -1)
        box(f"diag{x}{yy}", (x, yy + 1.5, H - 1.02), (0.08, 3.4, 0.08), "trelica", G,
            rot=Matrix.Rotation(ang, 4, "X"))
        yy += 3.0
        k += 1
    for yw in (FY0 + 0.45, FY1 - 0.45):
        box(f"pilar{x}{yw}", (x, yw, H / 2), (0.5, 0.5, H), "pilar", G, bevel=0.02)
    for yl in (-17.0, -8.0, 0.0, 8.0):
        cyl(f"lamp{x}{yl}", (x + 3, yl, H - 2.4), 0.32, 0.08, "lampada", axis="Z", seg=24, group=G)
        cyl(f"lamp_cup{x}{yl}", (x + 3, yl, H - 2.25), 0.36, 0.3, "duto", axis="Z", seg=24, group=G, r2=0.12)
    x += 6.0
# faixas de piso
box("faixa_corredor", ((FX0 + FX1) / 2, -8.3, 0.004), (FX1 - FX0 - 1, 0.12, 0.008), "faixa_amarela", G)
box("faixa_escada", (X0 - 2.3, (WY0 + WY1) / 2, 0.004), (5.4, 1.9, 0.008), "faixa_zebrada", G)

# -------------------------------------------------------------------- luzes
sun = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN"))
COL.objects.link(sun)
sun.data.energy = float(os.environ.get("SUN", "9.0"))
sun.data.angle = radians(1.2)
sun.data.color = srgb("#fff1dc")
d = Vector((0.25, 0.42, -0.87)).normalized()
sun.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def area(name, loc, size, energy, color="#ffe2b8", sy=None, shape="DISK"):
    li = bpy.data.lights.new(name, "AREA")
    li.shape = shape
    li.size = size
    if sy:
        li.size_y = sy
    li.energy = energy
    li.color = srgb(color)
    ob = bpy.data.objects.new(name, li)
    ob.location = loc
    COL.objects.link(ob)
    return ob


x = FX0 + 3
while x < FX1 - 1:
    for yl in (-17.0, -8.0, 0.0, 8.0):
        area(f"al{x}{yl}", (x + 3, yl, H - 2.5), 0.6, float(os.environ.get("LAMP", "380")))
    x += 6.0
for xx in (X0 + 2.5, (X0 + X1) / 2, X1 - 2.5):
    area(f"hood{xx}", (xx, -Y_WALL + 0.45, ZR - 0.25), 1.2, 700, sy=0.2, shape="RECTANGLE")
area("porao", ((PX0 + PX1) / 2, -2.5, -0.6), 2.0, 120, "#ffd9a0")

world = bpy.data.worlds.new("mundo")
SC.world = world
try:
    world.use_nodes = True
except Exception:
    pass
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (*srgb("#9fb0c0"), 1)
bg.inputs[1].default_value = 0.12

# -------------------------------------------------------------- metadados
meta = {
    "bearings": [{"tag": f"CS{b['cs']}", "vi": f"VI-51{b['cs']:02d}B", "ti": f"TI-53{b['cs']:02d}B",
                  "tier": "superior" if b["z"] > 3 else "inferior",
                  "pos": [round(b["x"], 3), round(b["z"], 3), round(-b["y"], 3)]} for b in bearings],
    "params": {"R": R, "FACE": FACE, "P": P, "Z_TOP": Z_TOP, "Z_BOT": Z_BOT, "hood": [X0, X1, ZR],
               "sun": list(d), "skylights": SKY, "skylights_x": SKY_X, "skylight_len": 3.6, "roof": H},
}
with open(os.path.join(OUT, "cena.json"), "w") as f:
    json.dump(meta, f, indent=1)

SC.render.engine = "CYCLES"
SC.cycles.device = "CPU"
SC.view_settings.view_transform = "AgX"
print("objetos:", {k: len(v) for k, v in GROUPS.items()})

# ---------------------------------------------------------------- execução
MODE = sys.argv[-1] if len(sys.argv) > 1 else "preview"


def camera(loc, target, lens=26):
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    COL.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    SC.camera = cam


CAMS = {"preview": ((2.0, -17.5, 3.6), (4.6, 0, 3.4), 26),
        "preview2": ((-10.5, -14.0, 5.2), (6.5, -1.5, 3.2), 24),
        "preview3": ((-3.0, -6.4, 4.95), (9.0, -3.2, 4.0), 18)}
if MODE == "secao":
    hide = ("painel_", "porta_", "vidro", "montante", "travessa", "puxador", "batente", "capota_", "col", "viga",
            "ped_", "pass", "gc_", "degrau", "banzo", "corr", "coletor", "mangueira_", "mancal_", "tampa_", "protecao_",
            "flange_", "junta_", "cotovelo_", "cxj_", "cabo_", "sensor_", "munhao", "parede_frente", "piso_frente",
            "fosso_lc", "lamp_capota", "engr", "faixa", "rolo_mancal", "rolo_eixo")
    for ob in list(bpy.data.objects):
        if ob.name.startswith(hide):
            bpy.data.objects.remove(ob, do_unlink=True)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    COL.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 17
    cam.location = (4.55, -30, 2.4)
    cam.rotation_euler = (radians(90), 0, 0)
    SC.camera = cam
    area("frente", (4.55, -12, 3), 14, 3000, "#ffffff", sy=12, shape="RECTANGLE").rotation_euler = (radians(90), 0, 0)
    SC.render.resolution_x, SC.render.resolution_y = 1200, 760
    SC.cycles.samples = 8
    SC.cycles.use_denoising = True
    SC.render.filepath = os.path.join(OUT, "secao.png")
    bpy.ops.render.render(write_still=True)
    sys.exit(0)
if MODE.startswith("preview"):
    camera(*CAMS[MODE])
    SC.render.resolution_x, SC.render.resolution_y = 960, 540
    SC.cycles.samples = int(os.environ.get("SPP", "24"))
    SC.cycles.use_denoising = True
    SC.render.filepath = os.path.join(OUT, f"{MODE}.png")
    bpy.ops.render.render(write_still=True)
    print("preview ok")
    sys.exit(0)

# ------------------------------------------------------------ bake + export
import numpy as np


def deselect_all():
    bpy.context.view_layer.update()
    for o in SC.objects:
        if o is not None:
            o.select_set(False)


def join(group, name):
    dg = bpy.context.evaluated_depsgraph_get()
    bm_all = bmesh.new()
    mats = []
    for ob in GROUPS[group]:
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        me.transform(ob.matrix_world)
        tmp = bmesh.new()
        tmp.from_mesh(me)
        offs = []
        for m in me.materials:
            if m.name not in mats:
                mats.append(m.name)
            offs.append(mats.index(m.name))
        for f in tmp.faces:
            f.material_index = offs[f.material_index] if offs else 0
        tmp.to_mesh(me)
        bm_all.from_mesh(me)
        tmp.free()
        bpy.data.meshes.remove(me)
    for ob in GROUPS[group]:
        bpy.data.objects.remove(ob, do_unlink=True)
    me = bpy.data.meshes.new(name)
    bm_all.to_mesh(me)
    bm_all.free()
    for m in mats:
        me.materials.append(bpy.data.materials[m])
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    return ob


def unwrap(ob, margin):
    deselect_all()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    ob.data.uv_layers.new(name="LM")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=radians(60), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake(ob, size, spp, name):
    img = bpy.data.images.new(name, size, size, float_buffer=True)
    for m in ob.data.materials:
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type == "TEX_IMAGE":
                nt.nodes.remove(n)
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        nt.nodes.active = n
    deselect_all()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    SC.cycles.samples = spp
    SC.render.bake.margin = 8
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=8, use_clear=True)
    px = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(px)
    np.save(os.path.join(OUT, f"{name}.npy"), px.reshape(size, size, 4))
    return img


for m in bpy.data.materials:   # bake de difusa: metal puro assaria preto
    b = m.node_tree.nodes.get("Principled BSDF")
    if b:
        b.inputs["Metallic"].default_value = 0.0
LM = int(os.environ.get("LM", "2048"))
SPP = int(os.environ.get("BSPP", "128"))
maq = join("MAQ", "MAQ")
pred = join("PRED", "PRED")
for ob in (maq, pred):
    ob.data.validate()
unwrap(maq, 0.0025)
unwrap(pred, 0.004)
SC.cycles.use_denoising = False
import time
t = time.time()
bake(maq, LM, SPP, "lm_maquina")
print("bake maquina", round(time.time() - t), "s")
t = time.time()
bake(pred, int(os.environ.get("LMP", "1024")), int(os.environ.get("BSPPP", "128")), "lm_predio")
print("bake predio", round(time.time() - t), "s")

# separa por material (menos draw calls, e a página troca materiais por nome)
for ob, pre in ((maq, "MAQ"), (pred, "PRED")):
    deselect_all()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.mesh.separate(type="MATERIAL")
bpy.context.view_layer.update()
for ob in list(SC.objects):
    if ob is not None and ob.type == "MESH":
        pre = "MAQ" if ob.name.startswith("MAQ") else "PRED"
        ob.name = f"{pre}__{ob.data.materials[0].name}"
        for m in ob.data.materials:   # tira o nó do bake do export
            for n in list(m.node_tree.nodes):
                if n.type == "TEX_IMAGE":
                    m.node_tree.nodes.remove(n)
for o in SC.objects:
    o.select_set(o.type == "MESH")
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "secagem_raw.glb"), export_format="GLB",
                          use_selection=True, export_texcoords=True, export_normals=True,
                          export_apply=True, export_yup=True, export_lights=False, export_cameras=False)
print("export ok")
