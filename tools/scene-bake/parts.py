"""
Primitivas de malha, materiais e as zonas de bake.

O nome do material é o contrato com a página: ela troca cada um por um material
TSL pelo nome. As cores aqui servem para a cor da luz rebatida no bake.

Cada objeto nasce dentro de uma zona. A zona decide em que lightmap ele vai
cair, e por isso é ela — não o objeto — que é unida, desdobrada e assada.
"""

import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

# ------------------------------------------------------------------ modelo
with open(os.path.join(HERE, "machine.json"), encoding="utf-8") as f:
    DATA = json.load(f)

if DATA.get("schema") != 1:
    raise SystemExit(
        f"machine.json com schema {DATA.get('schema')!r}; este gerador espera 1. "
        "Rode: npm run export:machine --workspace @mp1/shared"
    )

M = DATA["measurements"]
MODEL = DATA["model"]
ZONES = DATA["zones"]

SC = bpy.context.scene
COL = SC.collection

# O bpy começa com cubo, câmera e luz padrão. Sai tudo antes de gerar.
for _o in list(bpy.data.objects):
    bpy.data.objects.remove(_o, do_unlink=True)

# zona -> objetos. A ordem segue a de machine.json, que é a da máquina.
OBJECTS = {z["id"]: [] for z in ZONES}
MACHINE_ZONES = [z for z in ZONES if z["group"] == "machine"]
BUILDING_ZONE = next(z["id"] for z in ZONES if z["group"] == "building")

# Objetos que o corte lateral descarta: é o que fica entre a câmera e a máquina.
HIDE_IN_SECTION = set()

MAT = {}


def zone_for_x(x):
    """A zona de máquina que cobre um X. Fora de todas, cai na primeira ou na última."""
    for z in MACHINE_ZONES:
        if z["span"]["from"] <= x <= z["span"]["to"]:
            return z["id"]
    return MACHINE_ZONES[0]["id"] if x < MACHINE_ZONES[0]["span"]["from"] else MACHINE_ZONES[-1]["id"]


# --------------------------------------------------------------- materiais
def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def material(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    MAT[name] = m
    return m


# A paleta do protótipo de teste, mais o que a máquina inteira pediu.
PALETTE = [
    # --- cilindros, rolos e mancais ---
    ("cil_ferro", "#5a5d60", 0.3, 1.0),
    ("cil_cabeca", "#3b3f44", 0.6, 0.0),
    ("munhao", "#8a8d90", 0.35, 1.0),
    ("estrutura", "#2e3236", 0.6, 0.0),
    ("mancal_corpo", "#2f5d8a", 0.45, 0.0),
    ("mancal_tampa", "#d8cfb4", 0.5, 0.0),
    ("protecao_amarela", "#e2b21c", 0.5, 0.0),
    ("junta_latao", "#b08d4a", 0.35, 1.0),
    ("mangueira", "#141414", 0.7, 0.0),
    ("caixa_juncao", "#9aa0a6", 0.5, 0.0),
    ("rolo_feltro", "#7d8287", 0.35, 1.0),
    ("rolo_borracha", "#2a2e33", 0.55, 0.1),
    # --- telas, feltros e folha ---
    ("feltro", "#2c3e4a", 0.95, 0.0),
    ("tela_formacao", "#2a4652", 0.7, 0.2),
    ("papel", "#e9e9e4", 0.85, 0.0),
    ("sapata_correia", "#1d2328", 0.5, 0.1),
    # --- capota ---
    ("capota_painel", "#b9bec2", 0.5, 0.0),
    ("capota_porta", "#c4c8cb", 0.45, 0.0),
    ("capota_moldura", "#8c9196", 0.4, 0.5),
    # Montantes e puxador da porta. Mesma liga da moldura, material à parte:
    # é o que deixa a cena girar só a porta no shader, sem levar junto o
    # batente e a faixa da capota, que são fixos e usam `capota_moldura`.
    ("porta_moldura", "#8c9196", 0.4, 0.5),
    ("vidro", "#1a1f24", 0.08, 0.0),
    # --- passarelas e tubulação ---
    ("passarela", "#7c8085", 0.55, 0.8),
    ("guarda_corpo", "#e2b21c", 0.45, 0.0),
    ("tubo_vermelho", "#9b2a22", 0.45, 0.0),
    ("tubo_isolado", "#c9ccce", 0.3, 0.9),
    ("duto", "#9ea3a6", 0.4, 0.8),
    # --- parte úmida ---
    ("estrutura_clara", "#d2d5d8", 0.62, 0.25),
    ("painel_acionamento", "#2d4a9a", 0.45, 0.2),
    ("armario_branco", "#eceeef", 0.5, 0.1),
    # --- prédio ---
    ("piso", "#7b7a76", 0.7, 0.0),
    ("laje", "#8a8884", 0.75, 0.0),
    ("fosso", "#4a4a47", 0.8, 0.0),
    ("refugo", "#dcdcd6", 0.9, 0.0),
    ("parede", "#8d8b84", 0.85, 0.0),
    ("telhado", "#3c3f42", 0.6, 0.3),
    ("trelica", "#585d62", 0.5, 0.6),
    ("pilar", "#c9b994", 0.6, 0.0),
    ("faixa_amarela", "#d9a816", 0.6, 0.0),
    ("faixa_zebrada", "#d9a816", 0.6, 0.0),
]

for _n, _c, _r, _m in PALETTE:
    material(_n, srgb(_c), _r, _m)
material("lampada", (1, 1, 1), 0.5, 0, emit=srgb("#ffe2b8"), strength=20.0)
material("claraboia", (1, 1, 1), 0.5, 0, emit=srgb("#dfe9f2"), strength=6.0)


# ---------------------------------------------------------------- objetos
def _register(ob, zone, center_x, section_hidden):
    if zone is None:
        zone = zone_for_x(center_x)
    OBJECTS[zone].append(ob)
    if section_hidden:
        HIDE_IN_SECTION.add(ob.name)
    return ob


def link(name, bm, mat, zone=None, smooth=False, section_hidden=False):
    me = bpy.data.meshes.new(name)
    if smooth:
        for f in bm.faces:
            f.smooth = True
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    me.materials.append(MAT[mat])
    cx = sum(v.co.x for v in me.vertices) / max(1, len(me.vertices))
    return _register(ob, zone, cx, section_hidden)


def box(name, c, s, mat, zone=None, bevel=0.0, rot=None, section_hidden=False):
    """Caixa centrada em `c` (coordenadas do Blender) com lados `s`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(s), verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel,
            segments=2,
            affect="EDGES",
            profile=0.5,
            clamp_overlap=True,
        )
    if rot is not None:
        bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(c), verts=bm.verts)
    return link(name, bm, mat, zone, section_hidden=section_hidden)


AX = {
    "X": Matrix.Rotation(math.pi / 2, 4, "Y"),
    "Y": Matrix.Rotation(math.pi / 2, 4, "X"),
    "Z": Matrix.Identity(4),
}


def cyl(name, c, r, d, mat, axis="Y", seg=48, zone=None, r2=None, caps=True, section_hidden=False):
    """Cilindro de raio `r` e comprimento `d`, com o eixo em `axis`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=caps,
        cap_tris=False,
        segments=seg,
        radius1=r,
        radius2=r if r2 is None else r2,
        depth=d,
    )
    for f in bm.faces:
        f.smooth = abs(f.normal.z) < 0.5
    bmesh.ops.transform(bm, matrix=AX[axis], verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(c), verts=bm.verts)
    return link(name, bm, mat, zone, section_hidden=section_hidden)


def _curve(name, pts, r, mat, kind, zone, res, section_hidden):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 3 if kind == "BEZIER" else 2
    cu.use_fill_caps = True
    sp = cu.splines.new(kind)
    if kind == "BEZIER":
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        sp.resolution_u = res
    else:
        sp.points.add(len(pts) - 1)
        for p, q in zip(sp.points, pts):
            p.co = (*q, 1)
    ob = bpy.data.objects.new(name, cu)
    COL.objects.link(ob)
    cu.materials.append(MAT[mat])
    cx = sum(p[0] for p in pts) / len(pts)
    return _register(ob, zone, cx, section_hidden)


def tube(name, pts, r, mat, zone=None, res=10, section_hidden=False):
    """Mangueira ou tubo curvo ao longo de uma polilinha suavizada."""
    return _curve(name, pts, r, mat, "BEZIER", zone, res, section_hidden)


def poly_tube(name, pts, r, mat, zone=None, section_hidden=False):
    """Tubo reto de trecho em trecho — corrimão, coletor, barra."""
    return _curve(name, pts, r, mat, "POLY", zone, 0, section_hidden)


def ribbon(name, pts, width, mat, thick, zone=None, y0=0.0, section_hidden=False):
    """
    Fita 3D a partir de uma polilinha do corte lateral (x, altura).

    `pts` vem de `geom.belt`. A largura se estende em Y do Blender, que é o
    sentido transversal da máquina.
    """
    bm = bmesh.new()
    vs = []
    for x, z in pts:
        vs.append(
            (bm.verts.new((x, y0 - width / 2, z)), bm.verts.new((x, y0 + width / 2, z)))
        )
    for (a, b), (c, d) in zip(vs[:-1], vs[1:]):
        if (a.co - c.co).length > 1e-5:
            bm.faces.new((a, b, d, c))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, mat, zone, smooth=True, section_hidden=section_hidden)
    mod = ob.modifiers.new("esp", "SOLIDIFY")
    mod.thickness = thick
    mod.offset = 0
    return ob


def ribbon_split(name, pts, width, mat, thick, zone=None, y0=0.0):
    """
    A mesma fita, mas cortada nas fronteiras das zonas.

    Telas e folha atravessam a máquina inteira; sem cortar, a tela toda cairia
    num lightmap só e perderia densidade. O corte é no ponto da polilinha, então
    não há emenda visível.
    """
    out = []
    run, current = [], None
    for p in pts:
        z = zone_for_x(p[0])
        if current is None:
            current = z
        if z != current and len(run) > 1:
            out.append(ribbon(f"{name}_{current}", run + [p], width, mat, thick, current, y0))
            run = [run[-1]]
            current = z
        run.append(p)
    if len(run) > 1:
        out.append(ribbon(f"{name}_{current}", run, width, mat, thick, current, y0))
    return out


def area_light(name, loc, size, energy, color="#ffe2b8", sy=None, shape="DISK"):
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


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def counts():
    return {z: len(v) for z, v in OBJECTS.items() if v}
