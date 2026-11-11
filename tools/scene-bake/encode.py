"""
Denoise dos lightmaps (OIDN pelo compositor do Blender) e codificação em WebP.

    tools/scene-bake/.venv/Scripts/python tools/scene-bake/encode.py apps/web/public/scene

O bake grava irradiância em float. Aqui cada zona é suavizada, normalizada pela
sua própria escala S e gravada como `sRGB(E / S)` em WebP de 8 bits. A página
devolve a escala com `lightMapIntensity = S · π`.

A escala é por zona de propósito: o porão e a capota não têm a mesma faixa de
irradiância, e uma escala global jogaria a zona escura para os bits de baixo.

Sai também, por zona, a irradiância de referência `ref` — o percentil 80 da
luminância coberta. É ela que a cena usa como denominador da oclusão especular
dos metais, que não têm difusa para receber luz assada.
"""

import json
import os
import sys

import bpy
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
DEST = sys.argv[1] if len(sys.argv) > 1 else OUT
os.makedirs(DEST, exist_ok=True)


def denoise(arr, name):
    """Passa o lightmap pelo denoiser do compositor; sem ele, uma suavização 3×3."""
    h, w, _ = arr.shape
    src = bpy.data.images.new(name + "_src", w, h, float_buffer=True)
    src.pixels.foreach_set(arr.astype(np.float32).ravel())
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    if sc.camera is None:
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        sc.collection.objects.link(cam)
        sc.camera = cam
    ng = bpy.data.node_groups.new("comp_" + name, "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    sc.compositing_node_group = ng
    n_img = ng.nodes.new("CompositorNodeImage")
    n_img.image = src
    n_dn = ng.nodes.new("CompositorNodeDenoise")
    n_out = ng.nodes.new("NodeGroupOutput")
    ng.links.new(n_img.outputs[0], n_dn.inputs[0])
    ng.links.new(n_dn.outputs[0], n_out.inputs[0])
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    path = os.path.join(OUT, name + "_dn.exr")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    bpy.data.images.remove(src)
    os.remove(path)
    return px.reshape(h, w, 4)


def blur3(arr):
    from numpy.lib.stride_tricks import sliding_window_view as sw

    pad = np.pad(arr[..., :3], ((1, 1), (1, 1), (0, 0)), mode="edge")
    out = arr.copy()
    out[..., :3] = sw(pad, (3, 3), axis=(0, 1)).mean(axis=(-1, -2))
    return out


def srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.maximum(x, 0), 1 / 2.4) - 0.055)


with open(os.path.join(OUT, "scene.json"), encoding="utf-8") as f:
    meta = json.load(f)

total = 0
for zone in meta["zones"]:
    zid = zone["id"]
    npy = os.path.join(OUT, f"lm_{zid}.npy")
    if not os.path.exists(npy):
        raise SystemExit(f"falta {npy}: rode o bake desta zona antes")

    raw = np.load(npy)
    try:
        dn = denoise(raw, f"lm_{zid}")
        method = "oidn"
    except Exception as e:  # sem compositor: suavização simples
        print(f"denoise de {zid} falhou ({e}); caindo para blur 3×3")
        dn = blur3(raw)
        method = "blur"

    rgb = np.clip(dn[..., :3], 0, None)
    lum = rgb.max(axis=2)
    covered = lum > 1e-5
    if not covered.any():
        raise SystemExit(f"lightmap de {zid} veio todo preto")

    scale = float(np.percentile(lum[covered], 99.6))
    enc = srgb(np.clip(rgb / scale, 0, 1))
    # o Blender guarda a imagem de baixo para cima
    img8 = (np.flipud(enc) * 255 + 0.5).astype(np.uint8)
    path = os.path.join(DEST, f"lm_{zid}.webp")
    Image.fromarray(img8, "RGB").save(path, quality=90, method=6)

    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    zone["scale"] = round(scale, 5)
    zone["ref"] = round(float(np.percentile(luminance[covered], 80)), 5)
    zone["coverage"] = round(float(covered.mean()), 3)
    zone["size"] = int(raw.shape[0])

    size_kb = os.path.getsize(path) / 1024
    total += size_kb
    print(
        f"{zid:16s} {method:4s} S={scale:8.4f} ref={zone['ref']:7.4f} "
        f"cobertura={zone['coverage']:.3f} {size_kb:7.1f} KB"
    )

with open(os.path.join(DEST, "scene.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=1, ensure_ascii=False)

print(f"\n{len(meta['zones'])} lightmaps · {total / 1024:.2f} MB em {DEST}")
