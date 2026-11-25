import json

rev = json.load(open('/tmp/oy_reviews.json'))
p = '/Users/tan/tavy-korea/public/data/all_products_catalog.json'
d = json.load(open(p))
n = 0
for x in d:
    g = x.get('goodsNo') or x.get('id')
    if g in rev and rev[g]:
        x['photoReviews'] = rev[g][:5]
        x['reviewsCount'] = len(rev[g][:5])
        n += 1
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
print('updated allcat', n)
