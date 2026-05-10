# DAC Sim — Hacker API

## Quick Start

1. Install deps: `pip install websockets`
2. Terminal 1: `npm run dev`
3. Terminal 2: `python3 api-bridge.py`
4. Open http://localhost:5173

## Action API

POST http://localhost:8766/action
Content-Type: application/json

{ "action": "forward", "magnitude": 0.7 }

Actions: forward, backward, left, right, ascend, descend, rotate_cw, rotate_ccw
Magnitude: 0.0 – 1.0 (controls duration: 1.0 = ~2 seconds of movement)

## State

GET http://localhost:8766/state
→ { "lat": ..., "lon": ..., "altAgl": ..., "altMsl": ..., "heading": ..., "speed": ... }

## Frame Stream

GET http://localhost:8766/frames          (2 fps default)
GET http://localhost:8766/frames?fps=5    (up to 10 fps)

SSE stream. Each event is a base64-encoded JPEG of the current drone camera view.

## Python Example

```python
import requests, base64, time
from PIL import Image
import io

# Get a frame
resp = requests.get("http://localhost:8766/frames", stream=True)
for line in resp.iter_lines():
    if line.startswith(b"data:"):
        img = Image.open(io.BytesIO(base64.b64decode(line[5:])))
        # -> send img to your VLM here

        # Act on the result
        requests.post("http://localhost:8766/action", json={
            "action": "forward",
            "magnitude": 0.6
        })
        break
```
