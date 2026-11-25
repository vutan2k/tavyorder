from PIL import Image, ImageDraw
import json

ids = [x['id'] for x in json.load(open('/tmp/fiximg_report.json'))]
cell = 220
cols = 9
rows = (len(ids) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * (cell + 18)), 'white')
d = ImageDraw.Draw(sheet)
for i, g in enumerate(ids):
    im = Image.open(f'/Users/tan/tavy-korea/public/products/{g}.jpg').convert('RGB')
    im.thumbnail((cell - 8, cell - 8))
    x = (i % cols) * cell
    y = (i // cols) * (cell + 18)
    sheet.paste(im, (x + 4, y + 4))
    d.text((x + 6, y + cell), str(i + 1), fill='black')
sheet.save('/tmp/new82.jpg', quality=85)
print(sheet.size, len(ids))
