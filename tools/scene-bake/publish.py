"""
Empacota o GLB assado para `apps/web/public/scene/`.

    python tools/scene-bake/publish.py apps/web/public/scene

Roda com o Python do sistema: não depende do bpy.

Faz duas coisas, nesta ordem:

1. **Separa o material por zona.** O `gltfpack` funde malhas que compartilham
   material para baixar o nº de chamadas de desenho — e funde entre zonas.
   Como o lightmap é por zona, uma fusão dessas aplicaria o lightmap errado na
   metade da malha. Dando a cada zona a sua própria cópia do material
   (`g4__cil_ferro`), a fusão só acontece dentro da zona, que é o que se quer.
   O nome do material continua sendo o contrato com a página, agora com a zona
   na frente.

2. **Comprime com meshopt.** `-vpf` guarda posição em ponto flutuante: a
   quantização inteira padrão erra 5% num prédio de 116 m. `-vt 16` mantém a
   precisão do UV do lightmap, e `-kn -km` preservam os nomes.
"""

import json
import os
import shutil
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, "out")
DEST = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(OUT, "publish")

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    with open(path, "rb") as f:
        magic, version, _total = struct.unpack("<III", f.read(12))
        if magic != 0x46546C67:
            raise SystemExit(f"{path} não é um GLB")
        doc, binary = None, b""
        while True:
            head = f.read(8)
            if len(head) < 8:
                break
            length, kind = struct.unpack("<II", head)
            data = f.read(length)
            if kind == JSON_CHUNK:
                doc = json.loads(data)
            elif kind == BIN_CHUNK:
                binary = data
        return version, doc, binary


def write_glb(path, version, doc, binary):
    js = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(js) + (8 + len(binary) if binary else 0)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, version, total))
        f.write(struct.pack("<II", len(js), JSON_CHUNK))
        f.write(js)
        if binary:
            f.write(struct.pack("<II", len(binary), BIN_CHUNK))
            f.write(binary)


def split_materials_by_zone(doc):
    """
    Dá a cada zona a sua própria cópia de cada material que ela usa.

    A zona vem do nome do nó, que o gerador escreve como `zona__material`.
    """
    materials = doc.get("materials", [])
    meshes = doc.get("meshes", [])
    by_name = {}
    created = 0

    for node in doc.get("nodes", []):
        name = node.get("name") or ""
        mesh_index = node.get("mesh")
        if mesh_index is None or "__" not in name:
            continue
        zone = name.split("__", 1)[0]
        for prim in meshes[mesh_index].get("primitives", []):
            source = prim.get("material")
            if source is None:
                continue
            base = materials[source].get("name") or f"mat{source}"
            base = base.split("__", 1)[-1]
            key = f"{zone}__{base}"
            if key not in by_name:
                copy = dict(materials[source])
                copy["name"] = key
                materials.append(copy)
                by_name[key] = len(materials) - 1
                created += 1
            prim["material"] = by_name[key]
        meshes[mesh_index]["name"] = name

    # tira os materiais originais, agora sem uso, remapeando os índices
    used = sorted({p["material"] for m in meshes for p in m.get("primitives", []) if "material" in p})
    remap = {old: new for new, old in enumerate(used)}
    doc["materials"] = [materials[i] for i in used]
    for m in meshes:
        for p in m.get("primitives", []):
            if "material" in p:
                p["material"] = remap[p["material"]]
    return created, len(doc["materials"])


def normalize_lightmap_uv(doc):
    """
    Deixa o UV do lightmap como o único, no canal 0.

    O Blender exporta duas camadas de UV nas zonas que têm curvas convertidas em
    malha: a que veio da conversão e a "LM", criada depois pelo desdobramento do
    bake. A LM é sempre a **última**. Tirar a outra ainda no Blender mudaria o
    desdobramento — e com ele os lightmaps já assados —, então a troca é aqui:
    o que era `TEXCOORD_1` passa a ser `TEXCOORD_0` e o outro é descartado.
    """
    trocadas = 0
    for mesh in doc.get("meshes", []):
        for prim in mesh.get("primitives", []):
            attrs = prim.get("attributes", {})
            sets = sorted(k for k in attrs if k.startswith("TEXCOORD_"))
            if len(sets) < 2:
                continue
            attrs["TEXCOORD_0"] = attrs[sets[-1]]
            for extra in sets[1:]:
                attrs.pop(extra, None)
            trocadas += 1
    return trocadas


def one_pixel_png():
    """Um PNG branco de 1 × 1, montado aqui para não depender de Pillow."""
    import struct as _struct
    import zlib

    def chunk(kind, payload):
        return (
            _struct.pack(">I", len(payload))
            + kind
            + payload
            + _struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    header = _struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff"))
        + chunk(b"IEND", b"")
    )


def pin_uv_with_placeholder(doc):
    """
    Prende uma textura mínima em cada material, para o `gltfpack` manter o UV.

    O `gltfpack` poda atributo que material nenhum usa — e os materiais deste
    GLB não têm textura, porque quem aplica o lightmap é a página, em tempo de
    carga. O resultado era um GLB sem UV nenhum e uma cena preta. Um PNG branco
    de 1 × 1 em `occlusionTexture`, no canal 0, basta para o UV ser considerado
    usado; a página descarta esses materiais de qualquer forma.
    """
    import base64

    doc.setdefault("images", []).append(
        {"uri": "data:image/png;base64," + base64.b64encode(one_pixel_png()).decode("ascii")}
    )
    doc.setdefault("samplers", []).append({"wrapS": 10497, "wrapT": 10497})
    doc.setdefault("textures", []).append(
        {"source": len(doc["images"]) - 1, "sampler": len(doc["samplers"]) - 1}
    )
    index = len(doc["textures"]) - 1
    for material in doc.get("materials", []):
        material["occlusionTexture"] = {"index": index, "texCoord": 0}
    return len(doc.get("materials", []))


def main():
    raw = os.path.join(OUT, "mp1_raw.glb")
    if not os.path.exists(raw):
        raise SystemExit(f"falta {raw}: rode o bake antes")

    version, doc, binary = read_glb(raw)
    trocadas = normalize_lightmap_uv(doc)
    print(f"UV do lightmap movido para o canal 0 em {trocadas} malhas")
    created, total = split_materials_by_zone(doc)
    pinned = pin_uv_with_placeholder(doc)
    print(f"textura mínima presa em {pinned} materiais, para o UV sobreviver")
    zoned = os.path.join(OUT, "mp1_zoned.glb")
    write_glb(zoned, version, doc, binary)
    print(f"materiais por zona: {created} criados, {total} no total")

    os.makedirs(DEST, exist_ok=True)
    packed = os.path.join(DEST, "mp1.glb")
    cmd = [
        "npx", "gltfpack",
        "-i", zoned,
        "-o", packed,
        "-cc",        # compressão meshopt de maior razão
        "-kn", "-km", # preserva nomes de nó e de material
        "-vpf",       # posição em ponto flutuante: 116 m não cabem em 14 bits
        "-vt", "16",  # UV do lightmap com precisão de sobra para 2048²
    ]
    subprocess.run(cmd, check=True, cwd=REPO, shell=os.name == "nt")

    before = os.path.getsize(zoned) / 1048576
    after = os.path.getsize(packed) / 1048576
    print(f"GLB: {before:.2f} MB -> {after:.2f} MB (meshopt)")

    webps = [f for f in os.listdir(DEST) if f.endswith(".webp")]
    lm = sum(os.path.getsize(os.path.join(DEST, f)) for f in webps) / 1048576
    print(f"{len(webps)} lightmaps: {lm:.2f} MB")
    print(f"total em {DEST}: {after + lm:.2f} MB")


if __name__ == "__main__":
    main()
