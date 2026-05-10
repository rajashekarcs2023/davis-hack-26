#!/usr/bin/env python3
"""
CesiumSim → QGroundControl MAVLink Bridge

Receives drone state from browser (WebSocket :8089) and sends MAVLink
directly to QGC (UDP :14550). No SITL or ArduPilot installation required.

Usage:  python3 mavlink-bridge.py
Deps:   pip install pymavlink websockets
"""

import asyncio
import json
import math
import time

import websockets
from pymavlink import mavutil

# --- Config ---
QGC_TARGET = "udpout:127.0.0.1:14550"
WS_PORT = 8089

# --- State ---
mav = None
boot_time = time.time()
connected = False
msg_count = 0
last_log = 0


def ms():
    """Milliseconds since bridge start."""
    return int((time.time() - boot_time) * 1000)


def send_heartbeat():
    """1 Hz heartbeat — tells QGC a vehicle exists."""
    mav.mav.heartbeat_send(
        mavutil.mavlink.MAV_TYPE_QUADROTOR,
        mavutil.mavlink.MAV_AUTOPILOT_ARDUPILOTMEGA,
        mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
        | mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED,
        4,  # custom_mode = GUIDED
        mavutil.mavlink.MAV_STATE_ACTIVE,
    )


def send_sys_status():
    """Minimal system status so QGC shows healthy."""
    mav.mav.sys_status_send(
        0, 0, 0,    # sensors present / enabled / health
        500,         # load (50%)
        12600,       # voltage_battery mV (12.6V)
        -1,          # current_battery (unknown)
        100,         # battery_remaining %
        0, 0, 0, 0, 0, 0,
    )


def send_gps_raw(lat, lon, alt_msl, groundspeed, heading):
    """GPS fix indicator for QGC's GPS status panel."""
    mav.mav.gps_raw_int_send(
        int(time.time() * 1e6),
        3,                       # fix_type: 3D fix
        int(lat * 1e7),
        int(lon * 1e7),
        int(alt_msl * 1000),     # mm
        100,                     # eph: 1m (cm)
        100,                     # epv: 1m (cm)
        int(groundspeed * 100),  # vel: cm/s
        int(heading * 100) % 36000,  # cog: cdeg
        14,                      # satellites_visible
    )


def send_position(d):
    """Stream position/attitude/speed from browser data."""
    global msg_count, last_log

    lat = d["lat"]
    lon = d["lon"]
    alt_msl = d["alt_msl"]
    alt_agl = d.get("alt_agl", 0)
    vn = d.get("vn", 0)
    ve = d.get("ve", 0)
    vd = d.get("vd", 0)
    heading = d.get("heading", 0) % 360
    pitch = d.get("pitch", 0)
    roll = d.get("roll", 0)
    groundspeed = d.get("groundspeed", math.sqrt(vn**2 + ve**2))
    throttle = d.get("throttle", 0)

    t = ms()
    hdg_cdeg = int(heading * 100) % 36000

    # Map position + velocity
    mav.mav.global_position_int_send(
        t,
        int(lat * 1e7), int(lon * 1e7),
        int(alt_msl * 1000),
        int(alt_agl * 1000),
        int(vn * 100), int(ve * 100), int(vd * 100),
        hdg_cdeg,
    )

    # Attitude indicator + compass
    mav.mav.attitude_send(
        t, roll, pitch, math.radians(heading),
        0, 0, 0,
    )

    # Speed / altitude / throttle gauges
    mav.mav.vfr_hud_send(
        groundspeed, groundspeed,
        int(heading) % 360,
        int(throttle * 100),
        alt_msl,
        -vd,
    )

    # GPS lock indicator
    send_gps_raw(lat, lon, alt_msl, groundspeed, heading)

    msg_count += 1
    now = time.time()
    if now - last_log >= 5.0:
        last_log = now
        print(
            f"[bridge] #{msg_count}: {lat:.6f},{lon:.6f} "
            f"alt={alt_msl:.1f}m hdg={heading:.0f}° "
            f"gs={groundspeed:.1f}m/s"
        )


async def heartbeat_loop():
    """Send heartbeat + status + GPS fix at 1 Hz."""
    while True:
        send_heartbeat()
        send_sys_status()
        # If we have a last known position, keep GPS status alive
        await asyncio.sleep(1)


async def ws_handler(ws):
    """Handle browser WebSocket messages."""
    global connected
    connected = True
    print("[bridge] Browser connected — streaming to QGC")

    try:
        async for message in ws:
            try:
                data = json.loads(message)
                send_position(data)
            except (json.JSONDecodeError, KeyError):
                pass
    except websockets.exceptions.ConnectionClosed:
        pass

    connected = False
    print("[bridge] Browser disconnected")


async def main():
    global mav
    mav = mavutil.mavlink_connection(
        QGC_TARGET, source_system=1, source_component=1
    )
    print(f"[bridge] MAVLink → {QGC_TARGET}")
    print(f"[bridge] WebSocket ws://localhost:{WS_PORT}")
    print("[bridge] Waiting for browser…")

    asyncio.create_task(heartbeat_loop())
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
