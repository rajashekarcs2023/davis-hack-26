#!/usr/bin/env python3
"""
DAC CesiumSim external bridge.

- WebSocket server on ws://localhost:8765 (browser simulator connection)
- HTTP server on http://localhost:8766 (external hacker script API)
"""

import asyncio
import json
import signal
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import websockets
from websockets.exceptions import ConnectionClosed

WS_HOST = "0.0.0.0"
WS_PORT = 8768
HTTP_HOST = "0.0.0.0"
HTTP_PORT = 8766
MAX_FRAME_FPS = 10
DEFAULT_FRAME_FPS = 2


latest_state = None
latest_frame = None
browser_ws = None
event_loop = None

state_lock = threading.Lock()
frame_lock = threading.Lock()
ws_lock = threading.Lock()
subscribers_lock = threading.Lock()

# subscriber_id -> requested_fps
frame_subscribers = {}


def _cors_headers(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    _cors_headers(handler)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _clamp_fps(raw_fps) -> int:
    try:
        fps = int(float(raw_fps))
    except (TypeError, ValueError):
        fps = DEFAULT_FRAME_FPS
    return max(1, min(MAX_FRAME_FPS, fps))


def _current_stream_fps() -> int:
    with subscribers_lock:
        if not frame_subscribers:
            return 0
        return min(MAX_FRAME_FPS, max(frame_subscribers.values()))


def _run_coro(coro):
    global event_loop
    if event_loop is None:
        raise RuntimeError("Event loop is not available")
    return asyncio.run_coroutine_threadsafe(coro, event_loop)


async def _send_to_browser(payload: dict) -> bool:
    global browser_ws
    ws = browser_ws
    if ws is None:
        return False
    try:
        await ws.send(json.dumps(payload))
        return True
    except Exception as exc:
        print(f"[bridge] Failed to send to browser: {exc}")
        return False


def _broadcast_stream_setting() -> None:
    with ws_lock:
        connected = browser_ws is not None
    if not connected:
        return

    fps = _current_stream_fps()
    try:
        _run_coro(_send_to_browser({"type": "set_frame_stream", "fps": fps}))
    except Exception as exc:
        print(f"[bridge] Failed to schedule frame stream setting: {exc}")


class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"[http] {self.address_string()} - {fmt % args}")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        _cors_headers(self)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/state":
            with ws_lock:
                connected = browser_ws is not None
            if not connected:
                _json_response(self, 200, {"error": "simulator not connected"})
                return

            with state_lock:
                state = latest_state
            _json_response(self, 200, state or {})
            return

        if parsed.path == "/frames":
            query = parse_qs(parsed.query)
            fps = _clamp_fps(query.get("fps", [DEFAULT_FRAME_FPS])[0])
            subscriber_id = str(uuid.uuid4())

            with subscribers_lock:
                frame_subscribers[subscriber_id] = fps
            _broadcast_stream_setting()

            self.send_response(200)
            _cors_headers(self)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            print(f"[bridge] SSE subscriber connected ({subscriber_id}, {fps} fps)")

            with frame_lock:
                last_sent_timestamp = (
                    latest_frame.get("timestamp") if isinstance(latest_frame, dict) else None
                )
            interval_s = 1.0 / fps
            try:
                while True:
                    with frame_lock:
                        frame = latest_frame

                    if frame and frame.get("timestamp") != last_sent_timestamp:
                        payload = frame.get("data")
                        if payload:
                            self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                            self.wfile.flush()
                            last_sent_timestamp = frame.get("timestamp")
                    time.sleep(interval_s)
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                with subscribers_lock:
                    frame_subscribers.pop(subscriber_id, None)
                _broadcast_stream_setting()
                print(f"[bridge] SSE subscriber disconnected ({subscriber_id})")
            return

        _json_response(self, 404, {"error": "not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/action":
            _json_response(self, 404, {"error": "not found"})
            return

        with ws_lock:
            connected = browser_ws is not None
        if not connected:
            _json_response(self, 503, {"error": "simulator not connected"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0

        if length <= 0:
            _json_response(self, 400, {"error": "request body required"})
            return

        raw = self.rfile.read(length)
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            _json_response(self, 400, {"error": "invalid json"})
            return

        if not isinstance(body, dict):
            _json_response(self, 400, {"error": "json object expected"})
            return

        payload = {
            "type": "action",
            "action": body.get("action"),
            "magnitude": body.get("magnitude", 1.0),
        }
        try:
            delivered = _run_coro(_send_to_browser(payload)).result(timeout=1.5)
        except Exception as exc:
            print(f"[bridge] Action forward failed: {exc}")
            delivered = False

        if not delivered:
            _json_response(self, 503, {"error": "simulator not connected"})
            return

        _json_response(self, 200, {"ok": True})


async def ws_handler(ws):
    global browser_ws, latest_state, latest_frame
    print("[bridge] Browser connected on ws://localhost:8765")

    previous_ws = None
    with ws_lock:
        previous_ws = browser_ws
        browser_ws = ws

    if previous_ws is not None and previous_ws is not ws:
        try:
            await previous_ws.close()
        except Exception:
            pass

    _broadcast_stream_setting()

    try:
        async for message in ws:
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                continue

            if not isinstance(data, dict):
                continue

            msg_type = data.get("type")
            if msg_type == "state":
                with state_lock:
                    latest_state = data
            elif msg_type == "frame":
                with frame_lock:
                    latest_frame = data
    except ConnectionClosed:
        pass
    finally:
        with ws_lock:
            if browser_ws is ws:
                browser_ws = None
        print("[bridge] Browser disconnected")


def serve_http():
    server = ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), BridgeHandler)
    print(f"[bridge] HTTP API  http://localhost:{HTTP_PORT}")
    server.serve_forever()


async def main():
    global event_loop
    event_loop = asyncio.get_running_loop()

    http_thread = threading.Thread(target=serve_http, daemon=True)
    http_thread.start()

    print(f"[bridge] WebSocket  ws://localhost:{WS_PORT}")
    print("[bridge] Waiting for simulator...")

    stop_event = asyncio.Event()

    def _handle_stop(*_args):
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            event_loop.add_signal_handler(sig, _handle_stop)
        except NotImplementedError:
            pass

    async with websockets.serve(ws_handler, WS_HOST, WS_PORT):
        await stop_event.wait()


if __name__ == "__main__":
    asyncio.run(main())
