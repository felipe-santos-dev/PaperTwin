"""
Gera a cena da MP1 no Blender, assa a luz em lightmaps e exporta para a web.

    tools/scene-bake/.venv/Scripts/python build.py secao     # corte lateral
    tools/scene-bake/.venv/Scripts/python build.py preview   # render de câmera
    tools/scene-bake/.venv/Scripts/python build.py bake      # assa e exporta

O modelo vem de `machine.json`, gerado por
`npm run export:machine --workspace @mp1/shared`. Nenhuma posição de ativo é
escrita aqui.

Eixos: Blender é Z para cima e o lado comando fica em Y negativo. A exportação
glTF com `export_yup` devolve (x, z, −y) para a cena, e o lado comando volta
para Z positivo.
"""

import json
import os
import sys
import time
from math import radians

import bpy
from mathutils import Vector

import building
import machine
import parts
import stations
from parts import DATA, M, OUT, SC, ZONES, area_light, srgb

MODE = sys.argv[1] if len(sys.argv) > 1 else "secao"

# ------------------------------------------------------------------ cena
stations.wet_part()
machine.drying_section("pre-dryer", M["PRE_DRYER_HOOD"], "pre")
stations.scanners()
stations.speed_sizer()
machine.drying_section("post-dryer", M["POST_DRYER_HOOD"], "pos")
stations.calender()
stations.pope()
machine.paper_web()
building.build_building()

# -------------------------------------------------------------------- luz
# Luz de estúdio, não de fábrica: um mundo branco, neutro e uniforme é a fonte
# principal, e é ele que dá a sombra suave de contato. A direcional é fraca,
# alta e de frente pelo lado comando — só para dar volume às formas.
SUN_DIR = Vector((0.18, 0.55, -0.82)).normalized()
sun = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN"))
parts.COL.objects.link(sun)
sun.data.energy = float(os.environ.get("SUN", "1.6"))
sun.data.angle = radians(18)   # disco largo: sombra de borda macia
sun.data.color = (1, 1, 1)
sun.rotation_euler = SUN_DIR.to_track_quat("-Z", "Y").to_euler()

world = bpy.data.worlds.new("mundo")
SC.world = world
if world.node_tree is None:
    world.use_nodes = True
nt = world.node_tree
bg = nt.nodes.get("Background")
bg.inputs[0].default_value = (1, 1, 1, 1)
bg.inputs[1].default_value = float(os.environ.get("WORLD", "1.0"))
# Para a câmera o fundo é o cinza escuro do design; para a luz, o mundo é
# branco. Só importa nos previews — o bake não tem raio de câmera.
fundo = nt.nodes.new("ShaderNodeBackground")
fundo.inputs[0].default_value = (*srgb("#0D1015"), 1)
fundo.inputs[1].default_value = 1.0
caminho = nt.nodes.new("ShaderNodeLightPath")
mistura = nt.nodes.new("ShaderNodeMixShader")
saida = nt.nodes.get("World Output")
nt.links.new(caminho.outputs["Is Camera Ray"], mistura.inputs[0])
nt.links.new(bg.outputs[0], mistura.inputs[1])
nt.links.new(fundo.outputs[0], mistura.inputs[2])
nt.links.new(mistura.outputs[0], saida.inputs["Surface"])

SC.render.engine = "CYCLES"
SC.cycles.device = "CPU"
SC.view_settings.view_transform = "AgX"

counts = parts.counts()
print("objetos por zona:", counts)
print("total:", sum(counts.values()))
for line in machine.REPORT:
    print(" ·", line)

if MODE == "conta":
    # monta a cena e sai: serve para conferir o gerador sem esperar render
    sys.exit(0)


def camera(loc, target, lens=26, ortho=None, fov=None):
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    parts.COL.objects.link(cam)
    cam.location = loc
    if ortho is None:
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    else:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
        cam.rotation_euler = (radians(90), 0, 0)
    cam.data.lens = lens
    if fov is not None:
        # o mesmo campo vertical da câmera da cena, para o preview valer
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle = radians(fov)
    SC.camera = cam
    return cam


# ------------------------------------------------------------ corte lateral
def strip_near_side(limit=-2.0):
    """
    Tira o que fica entre a câmera e o corte.

    Duas regras: o que o gerador marcou como peça do lado comando, e o que está
    inteiro antes da linha de centro da máquina. A segunda pega sozinha o que
    for acrescentado depois, sem lista para manter.
    """
    gone = 0
    for ob in list(bpy.data.objects):
        if ob.type not in {"MESH", "CURVE"}:
            continue
        if ob.name in parts.HIDE_IN_SECTION:
            bpy.data.objects.remove(ob, do_unlink=True)
            gone += 1
            continue
        try:
            ys = [(ob.matrix_world @ Vector(c)).y for c in ob.bound_box]
        except (RuntimeError, ValueError):
            continue
        if ys and max(ys) < limit:
            bpy.data.objects.remove(ob, do_unlink=True)
            gone += 1
    return gone


def render_section():
    """
    O corte lateral da máquina inteira, em faixas, mais um detalhe da secagem.

    O enquadramento vertical vai do térreo ao telhado: é o que mostra o piso de
    operação elevado, o vão aberto sob a secagem e o nível de baixo.
    """
    print("peças removidas do corte:", strip_near_side())

    x0, x1 = M["BUILDING_X0_M"], M["BUILDING_X1_M"]
    top = machine.HOOD_TOP + 8.0
    bottom = M["GROUND_FLOOR_Y_M"] - 1.5
    height = top - bottom
    center_z = (top + bottom) / 2

    bands = []
    n = 3
    width = (x1 - x0) / n
    for i in range(n):
        bands.append((f"secao{i + 1}", x0 + i * width, x0 + (i + 1) * width, height))
    # detalhe: os primeiros pares da pré-secagem, onde a mecânica das telas aparece
    detail_x0 = M["PRE_DRYER_X0_M"] - 2.5
    bands.append(("secao_detalhe", detail_x0, detail_x0 + 15.0, 0))

    SC.cycles.samples = int(os.environ.get("SPP", "12"))
    SC.cycles.use_denoising = True

    for name, bx0, bx1, h in bands:
        span = bx1 - bx0
        if h:
            res_x = 2200
            res_y = int(res_x * h / span)
            cz = center_z
            scale = span
        else:
            res_x = 1900
            res_y = 1400
            cz = (M["DRYER_TOP_Y_M"] + M["DRYER_BOTTOM_Y_M"]) / 2
            scale = span
        camera(((bx0 + bx1) / 2, -60, cz), None, ortho=scale)
        light = area_light(f"luz_{name}", ((bx0 + bx1) / 2, -26, cz), span, 9000, "#ffffff", sy=h or 16, shape="RECTANGLE")
        light.rotation_euler = (radians(90), 0, 0)
        SC.render.resolution_x, SC.render.resolution_y = res_x, res_y
        SC.render.filepath = os.path.join(OUT, f"{name}.png")
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"{name}.png  x {bx0:.1f}..{bx1:.1f}  {res_x}x{res_y}  {time.time() - t:.0f}s")
        bpy.data.objects.remove(light, do_unlink=True)


def view(position, target):
    """Uma vista de `views.ts`, da cena (x, y, z) para o Blender (x, -z, y)."""
    (px, py, pz), (tx, ty, tz) = position, target
    return (px, -pz, py), (tx, -tz, ty)


_PX0 = M["PRE_DRYER_X0_M"]
_CX = (M["HEADBOX_X_M"] + M["POPE_X_M"]) / 2
_G = M["GROUND_FLOOR_Y_M"]

# As mesmas posições de `apps/web/src/scene/views.ts`. Ficam espelhadas aqui
# para o preview mostrar o que a cena vai enquadrar.
CAMS = {
    "preview_geral": view((_CX - 8, 30, 78), (_CX, 3, 0)),
    "preview_pre": view((_PX0 + 6, 7.5, 22), (_PX0 + 15, 4.5, 0)),
    "preview_mancais": view((_PX0 + 4, 6.4, 10.5), (_PX0 + 9, 5.6, M["BEARING_Z_M"])),
    "preview_terreo": view((M["PRE_DRYER_HOOD"]["from"] - 6, _G + 1.7, 16), (M["PRE_DRYER_HOOD"]["from"] + 20, _G + 2.6, 0)),
}


def preview_bearings():
    """
    Carcaças de mancal só para o preview.

    Na cena elas são malhas vivas, fora do bake; sem um substituto aqui, o
    preview da vista de mancais mostraria munhões soltos no ar.
    """
    for section in parts.MODEL["sections"]:
        by_tag = {a["tag"]: a for a in section["assets"]}
        for a in section["assets"]:
            if a["kind"] != "bearing":
                continue
            x, y, z = a["position"]
            r = (by_tag.get(a["parentTag"], {}).get("radius") or 0.6) * M["BEARING_RADIUS_RATIO"]
            ob = parts.cyl(f"prev_{a['tag']}", (x, -z, y), r, 0.42, "caixa_juncao", seg=24, zone="predio")
            ob.name = f"prev_{a['tag']}"


if MODE == "secao":
    render_section()
    sys.exit(0)

if MODE.startswith("preview"):
    preview_bearings()
    camera(*CAMS[MODE], fov=48)
    SC.render.resolution_x, SC.render.resolution_y = 1920, 1080
    SC.cycles.samples = int(os.environ.get("SPP", "24"))
    SC.cycles.use_denoising = True
    SC.render.filepath = os.path.join(OUT, f"{MODE}.png")
    bpy.ops.render.render(write_still=True)
    print("preview ok")
    sys.exit(0)

# ------------------------------------------------------------ bake + export
import bmesh  # noqa: E402  (só o bake precisa)
import numpy as np  # noqa: E402


def deselect_all():
    bpy.context.view_layer.update()
    for o in SC.objects:
        if o is not None:
            o.select_set(False)


def join(zone):
    """Une os objetos de uma zona numa malha só, preservando os materiais."""
    objects = parts.OBJECTS[zone]
    dg = bpy.context.evaluated_depsgraph_get()
    bm_all = bmesh.new()
    mats = []
    for ob in objects:
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
    for ob in objects:
        bpy.data.objects.remove(ob, do_unlink=True)
    me = bpy.data.meshes.new(zone)
    bm_all.to_mesh(me)
    bm_all.free()
    for m in mats:
        me.materials.append(bpy.data.materials[m])
    ob = bpy.data.objects.new(zone, me)
    parts.COL.objects.link(ob)
    return ob


def unwrap(ob, margin):
    deselect_all()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    # A camada "LM" entra depois das que vierem das curvas convertidas em
    # malha. Tirar as outras antes mudaria o desdobramento — e com ele os
    # lightmaps já assados —, então quem resolve o canal é o `publish.py`.
    ob.data.uv_layers.new(name="LM")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=radians(60), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False
    )
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
    np.save(os.path.join(OUT, f"lm_{name}.npy"), px.reshape(size, size, 4))
    bpy.data.images.remove(img)


# Difusa de metal assa preta: o bake é todo com Metallic = 0, e na cena o metal
# usa a luminância do lightmap como oclusão do reflexo.
for m in bpy.data.materials:
    b = m.node_tree.nodes.get("Principled BSDF") if m.node_tree else None
    if b:
        b.inputs["Metallic"].default_value = 0.0

SC.cycles.use_denoising = False
spp = int(os.environ.get("BSPP", "128"))
only = set(filter(None, os.environ.get("ZONES", "").split(",")))

# Reexporta sem reassar. Serve para quando só a **atribuição** de material muda:
# o desdobramento roda sobre a malha unida, antes de qualquer separação, então
# os UVs dependem só da geometria e os lightmaps no disco continuam valendo.
# Quem usar isto tem de conferir que os UVs saíram iguais aos do GLB anterior.
skip_bake = os.environ.get("SKIP_BAKE") == "1"

baked = []
for zone in ZONES:
    zid = zone["id"]
    if only and zid not in only:
        continue
    if not parts.OBJECTS[zid]:
        print(f"zona {zid} vazia, pulando")
        continue
    size = int(os.environ.get("LM", str(zone["lightmap"])))
    ob = join(zid)
    ob.data.validate()
    unwrap(ob, 0.0025)
    if skip_bake:
        print(f"zona {zid}: desdobrada, bake pulado")
    else:
        t = time.time()
        bake(ob, size, spp, zid)
        print(f"bake {zid}: {size}² · {spp} spp · {time.time() - t:.0f}s")
    baked.append(zid)

    # separa por material: menos draw calls, e a página troca material por nome
    deselect_all()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.mesh.separate(type="MATERIAL")

bpy.context.view_layer.update()
for ob in list(SC.objects):
    if ob is not None and ob.type == "MESH":
        zid = ob.name.split(".")[0]
        ob.name = f"{zid}__{ob.data.materials[0].name}"
        for m in ob.data.materials:
            for n in list(m.node_tree.nodes):
                if n.type == "TEX_IMAGE":
                    m.node_tree.nodes.remove(n)

for o in SC.objects:
    o.select_set(o.type == "MESH")
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "mp1_raw.glb"),
    export_format="GLB",
    use_selection=True,
    export_texcoords=True,
    export_normals=True,
    export_apply=True,
    export_yup=True,
    export_lights=False,
    export_cameras=False,
)

# Metadados da cena: o que a página precisa e não está em geometry.ts.
meta = {
    "schema": 1,
    "zones": [
        {"id": z["id"], "label": z["label"], "group": z["group"], "lightmap": f"lm_{z['id']}.webp"}
        for z in ZONES
        if z["id"] in baked
    ],
    # Blender (x, y, z) -> three (x, z, -y)
    "sun": [round(SUN_DIR.x, 4), round(SUN_DIR.z, 4), round(-SUN_DIR.y, 4)],
    # linha de dobradiça das portas de cima, em coordenadas da cena
    "hoodDoorHinge": {"y": round(machine.HOOD_TOP - 0.03, 3), "z": round(machine.Y_WALL + 0.1, 3)},
    "hoodTop": round(machine.HOOD_TOP, 3),
    # as portas de cima são assadas abertas; a cena fecha girando de volta
    "hoodDoorBakedDeg": machine.DOOR_OPEN_DEG,
    "exposure": 0.82,
}
with open(os.path.join(OUT, "scene.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=1, ensure_ascii=False)

print("export ok:", ", ".join(baked))
