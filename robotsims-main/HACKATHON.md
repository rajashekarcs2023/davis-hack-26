# RobotSim - Hacker API

Need the deeper architecture/action-token walkthrough? Start with `UNDERSTANDING_GUIDE.md`.

## Quick Start
1. `pip install websockets`
2. Terminal 1: `npm run dev`
3. Terminal 2: `python3 api-bridge.py`
4. Open [http://localhost:5173](http://localhost:5173)

## Robots
- SO101: 6-DOF arm, action tokens control individual joints.
- LeKiwi: mobile base (holonomic) plus arm, action tokens control both.

## Action API
`POST http://localhost:8767/action`

```json
{ "action": "rotate_cw", "magnitude": 0.5 }
```

SO101 actions:
`rotate_cw`, `rotate_ccw`, `shoulder_up`, `shoulder_down`, `elbow_up`, `elbow_down`, `wrist_up`, `wrist_down`, `wrist_roll_cw`, `wrist_roll_ccw`, `grip`, `release`, `reset`

LeKiwi actions:
All SO101 actions plus `drive_forward`, `drive_backward`, `strafe_left`, `strafe_right`, `rotate_left`, `rotate_right`

Magnitude: `0.0`-`1.0` (`1.0` means around two seconds of movement)

## State
`GET http://localhost:8767/state`

## Wrist Camera Feed (SSE)
`GET http://localhost:8767/frames`

`GET http://localhost:8767/frames?fps=5`

## Python Example

```python
import base64
import io

import requests
from PIL import Image

resp = requests.get("http://localhost:8767/frames?fps=5", stream=True)
for line in resp.iter_lines():
    if line.startswith(b"data:"):
        jpg_bytes = base64.b64decode(line[5:])
        image = Image.open(io.BytesIO(jpg_bytes))
        # Send `image` to your VLM / policy here.

        requests.post(
            "http://localhost:8767/action",
            json={"action": "grip", "magnitude": 0.8},
            timeout=2,
        )
        break
```
