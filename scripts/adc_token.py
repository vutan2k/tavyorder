#!/usr/bin/env python3
"""Mint access token from ADC refresh token (credentials.db hay bi hong)."""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ADC = os.path.expanduser('~/.config/gcloud/application_default_credentials.json')
CACHE = os.path.expanduser('~/.cache/.adc_token')

if os.path.exists(CACHE):
    try:
        d = json.load(open(CACHE))
        if d.get('exp', 0) > time.time() + 120:
            print(d['token'])
            sys.exit(0)
    except Exception:
        pass

creds = json.load(open(ADC))
body = urllib.parse.urlencode({
    'client_id': creds['client_id'],
    'client_secret': creds['client_secret'],
    'refresh_token': creds['refresh_token'],
    'grant_type': 'refresh_token',
}).encode()

req = urllib.request.Request('https://oauth2.googleapis.com/token', data=body)
try:
    d = json.load(urllib.request.urlopen(req, timeout=30))
except urllib.error.HTTPError as e:
    print(json.dumps({'error': e.read().decode()[:300]}), file=sys.stderr)
    sys.exit(1)

os.makedirs(os.path.dirname(CACHE), exist_ok=True)
json.dump({'token': d['access_token'], 'exp': time.time() + d.get('expires_in', 3600) - 300}, open(CACHE, 'w'))
os.chmod(CACHE, 0o600)
print(d['access_token'])
