from PIL import Image
import json, os

ids = [x['id'] for x in json.load(open('/tmp/fiximg_report.json'))]
total_before = total_after = 0
for g in ids:
    p = f'/Users/tan/tavy-korea/public/products/{g}.jpg'
    if not os.path.exists(p):
        continue
    total_before += os.path.getsize(p)
    im = Image.open(p).convert('RGB')
    w, h = im.size
    s = max(w, h)
    canvas = Image.new('RGB', (s, s), 'white')
    canvas.paste(im, ((s - w) // 2, (s - h) // 2))
    if s > 1000:
        canvas = canvas.resize((1000, 1000), Image.LANCZOS)
        canvas = canvas.filter(ImageFilter.UnsharpMask(radius=1.2, percent=55, threshold=3)) if False else canvas
    canvas.save(p, 'JPEG', quality=88, optimize=True)
    total_after += os.path.getsize(p)
print('before MB', round(total_before / 1e6, 1), 'after MB', round(total_after / 1e6, 1), 'n', len(ids))
