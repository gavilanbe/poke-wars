"""Monta los fotogramas de una carpeta en una hoja de contactos (como mucho 30, repartidos en el tiempo)."""
import glob
import sys

from PIL import Image, ImageDraw

src, out, ms = sys.argv[1], sys.argv[2], int(sys.argv[3])
files = sorted(glob.glob(src + "/*.jpg"))
keep = files if len(files) <= 30 else [files[round(i * (len(files) - 1) / 29)] for i in range(30)]
cols, w, h = 5, 384, 264
sheet = Image.new("RGB", (cols * w, ((len(keep) + cols - 1) // cols) * h), (20, 20, 28))
draw = ImageDraw.Draw(sheet)
for i, f in enumerate(keep):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(Image.open(f).resize((w - 4, h - 4)), (x + 2, y + 2))
    draw.text((x + 6, y + 4), "%d ms" % (files.index(f) * ms / len(files)), fill=(255, 255, 0))
sheet.save(out)
