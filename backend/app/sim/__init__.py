"""Sim integration layer.

`safety` is the only thing that should call into `drone_adapter` and
`robot_adapter` for action dispatch. Direct adapter use bypasses the guard.
"""
