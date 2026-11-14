"""Denoise (OIDN pelo compositor do Blender) e codificação dos lightmaps em WebP 8 bits.

A irradiância E é gravada como sRGB(E / S); a página usa lightMapIntensity = S·π.
"""
import bpy, json, os, sys
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
DEST = sys.argv[-1]
os.makedirs(DEST, exist_ok=True)


def denoise(arr, name):
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
    return px.reshape(h, w, 4)


def srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.maximum(x, 0), 1 / 2.4) - 0.055)


meta_path = os.path.join(OUT, "cena.json")
meta = json.load(open(meta_path))
meta["lm"] = {}
for name, key in (("lm_maquina", "maquina"), ("lm_predio", "predio")):
    raw = np.load(os.path.join(OUT, name + ".npy"))
    try:
        dn = denoise(raw, name)
        method = "oidn"
    except Exception as e:  # sem compositor: suavização simples
        print("denoise falhou:", e)
        from numpy.lib.stride_tricks import sliding_window_view as sw
        pad = np.pad(raw[..., :3], ((1, 1), (1, 1), (0, 0)), mode="edge")
        dn = raw.copy()
        dn[..., :3] = sw(pad, (3, 3), axis=(0, 1)).mean(axis=(-1, -2))
        method = "blur"
    rgb = np.clip(dn[..., :3], 0, None)
    lum = rgb.max(axis=2)
    cov = lum > 1e-5
    S = float(np.percentile(lum[cov], 99.6))
    enc = srgb(np.clip(rgb / S, 0, 1))
    img8 = (np.flipud(enc) * 255 + 0.5).astype(np.uint8)   # Blender guarda de baixo para cima
    Image.fromarray(img8, "RGB").save(os.path.join(DEST, name + ".webp"), quality=90, method=6)
    Image.fromarray(img8, "RGB").resize((512, 512)).save(os.path.join(OUT, name + "_thumb.png"))
    meta["lm"][key] = round(S, 5)
    if key == "maquina":
        L = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
        meta["lm"]["ref"] = round(float(np.percentile(L[cov], 80)), 5)
    print(name, method, "S=", round(S, 4), "cobertura", round(cov.mean(), 3))
json.dump(meta, open(os.path.join(DEST, "cena.json"), "w"), indent=1)
print(meta["lm"])
