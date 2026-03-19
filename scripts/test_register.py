import urllib.request
import urllib.error
import json

req = urllib.request.Request(
    'http://localhost:5176/api/v1/auth/register',
    data=json.dumps({"email": "test999@test.com", "password": "password", "name": "test"}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    response = urllib.request.urlopen(req)
    print("SUCCESS", response.status)
    print(response.read().decode())
except urllib.error.HTTPError as e:
    print("FAILED", e.code)
    try:
        print(e.read().decode())
    except Exception:
        print("Could not read error body")
except Exception as e:
    print("ERROR", str(e))
