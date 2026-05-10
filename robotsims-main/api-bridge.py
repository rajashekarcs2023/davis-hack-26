#!/usr/bin/env python3
import asyncio
import base64
import json
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import websockets
from websockets.server import WebSocketServerProtocol

WS_PORT = 8765
HTTP_PORT = 8767

latest_state = {
    "type": "state",
    "robot": "so101",
    "joints": {},
    "base_pose": None,
    "task_status": "idle",
    "objects": [],
    "timestamp": 0.0,
}
latest_frame = ""
state_lock = threading.Lock()
browser_ws: WebSocketServerProtocol | None = None
loop: asyncio.AbstractEventLoop | None = None
frame_subscribers: set["FrameSubscriber"] = set()


class FrameSubscriber:
    def __init__(self, fps: int):
        self.fps = fps
        self.queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=5)


async def ws_handler(websocket: WebSocketServerProtocol) -> None:
    global browser_ws
    browser_ws = websocket
    print("[RobotSim Bridge] Browser connected")
    try:
        async for message in websocket:
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                continue
            msg_type = payload.get("type")
            if msg_type == "state":
                with state_lock:
                    latest_state.update(payload)
            elif msg_type == "frame":
                data = payload.get("data")
                if isinstance(data, str):
                    with state_lock:
                        global latest_frame
                        latest_frame = data
                    await publish_frame({"data": data, "timestamp": payload.get("timestamp", time.time() * 1000.0)})
    except websockets.ConnectionClosed:
        pass
    finally:
        if browser_ws is websocket:
            browser_ws = None
        print("[RobotSim Bridge] Browser disconnected")


async def publish_frame(frame_message: dict) -> None:
    stale = set()
    for subscriber in frame_subscribers:
        if subscriber.queue.full():
            try:
                subscriber.queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            subscriber.queue.put_nowait(frame_message)
        except asyncio.QueueFull:
            stale.add(subscriber)
    for subscriber in stale:
        frame_subscribers.discard(subscriber)


async def send_to_browser(payload: dict) -> bool:
    if browser_ws is None:
        return False
    try:
        await browser_ws.send(json.dumps(payload))
        return True
    except Exception:
        return False


class ApiHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._add_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/action":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON"})
            return

        action = payload.get("action")
        magnitude = payload.get("magnitude", 0.0)
        if not isinstance(action, str):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "action must be a string"})
            return
        try:
            magnitude_value = float(magnitude)
        except (TypeError, ValueError):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "magnitude must be numeric"})
            return

        if loop is None:
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"ok": False, "error": "bridge loop unavailable"})
            return

        future = asyncio.run_coroutine_threadsafe(
            send_to_browser({"type": "action", "action": action, "magnitude": magnitude_value}),
            loop,
        )
        sent = future.result(timeout=2)
        self._send_json(HTTPStatus.OK, {"ok": bool(sent)})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/state":
            with state_lock:
                snapshot = dict(latest_state)
            self._send_json(HTTPStatus.OK, snapshot)
            return
        if parsed.path == "/frames":
            query = parse_qs(parsed.query)
            fps_value = 5
            if "fps" in query and query["fps"]:
                try:
                    fps_value = max(1, min(10, int(float(query["fps"][0]))))
                except ValueError:
                    fps_value = 5
            self._stream_frames(fps_value)
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def _stream_frames(self, fps: int) -> None:
        if loop is None:
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "Bridge unavailable"})
            return

        subscriber = FrameSubscriber(fps)
        asyncio.run_coroutine_threadsafe(
            send_to_browser({"type": "set_frame_stream", "fps": fps}),
            loop,
        )
        frame_subscribers.add(subscriber)

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self._add_cors_headers()
        self.end_headers()

        try:
            while True:
                if loop is None:
                    break
                future = asyncio.run_coroutine_threadsafe(subscriber.queue.get(), loop)
                frame_message = future.result(timeout=max(1.0, 2.0 / fps))
                payload = frame_message.get("data", "")
                if not isinstance(payload, str):
                    continue
                self.wfile.write(f"data:{payload}\n\n".encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            pass
        finally:
            frame_subscribers.discard(subscriber)
            if not frame_subscribers and loop is not None:
                asyncio.run_coroutine_threadsafe(send_to_browser({"type": "set_frame_stream", "fps": 0}), loop)

    def _add_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status: HTTPStatus, payload: dict) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self._add_cors_headers()
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt: str, *args) -> None:
        return


async def run_ws_server() -> None:
    async with websockets.serve(ws_handler, "localhost", WS_PORT):
        print(f"[RobotSim Bridge] WebSocket listening on ws://localhost:{WS_PORT}")
        await asyncio.Future()


def run_http_server() -> None:
    server = ThreadingHTTPServer(("localhost", HTTP_PORT), ApiHandler)
    print(f"[RobotSim Bridge] HTTP API listening on http://localhost:{HTTP_PORT}")
    server.serve_forever()


def main() -> None:
    global loop
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_ws_server())
    except KeyboardInterrupt:
        pass
    finally:
        if loop.is_running():
            loop.stop()
        loop.close()


if __name__ == "__main__":
    main()
