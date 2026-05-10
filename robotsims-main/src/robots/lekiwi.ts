import type { ActionSpec, RobotConfig } from './so101';

const ARM_JOINTS = [
  { key: 'Rotation', urdfName: 'STS3215_03a-v1_Revolute-45', min: -Math.PI, max: Math.PI, defaultValue: 0 },
  { key: 'Pitch', urdfName: 'STS3215_03a-v1-1_Revolute-49', min: -Math.PI, max: Math.PI, defaultValue: 0 },
  { key: 'Elbow', urdfName: 'STS3215_03a-v1-2_Revolute-51', min: -Math.PI, max: Math.PI, defaultValue: 0 },
  { key: 'Wrist_Pitch', urdfName: 'STS3215_03a-v1-3_Revolute-53', min: -Math.PI, max: Math.PI, defaultValue: 0 },
  { key: 'Wrist_Roll', urdfName: 'STS3215_03a_Wrist_Roll-v1_Revolute-55', min: -Math.PI, max: Math.PI, defaultValue: 0 },
  { key: 'Jaw', urdfName: 'STS3215_03a-v1-4_Revolute-57', min: -Math.PI / 2, max: Math.PI / 2, defaultValue: 0 },
] as const;

const ARM_ACTIONS: Record<string, ActionSpec> = {
  rotate_cw: { token: 'rotate_cw', kind: 'joint_delta', jointKey: 'Rotation', direction: 1 },
  rotate_ccw: { token: 'rotate_ccw', kind: 'joint_delta', jointKey: 'Rotation', direction: -1 },
  shoulder_up: { token: 'shoulder_up', kind: 'joint_delta', jointKey: 'Pitch', direction: 1 },
  shoulder_down: { token: 'shoulder_down', kind: 'joint_delta', jointKey: 'Pitch', direction: -1 },
  elbow_up: { token: 'elbow_up', kind: 'joint_delta', jointKey: 'Elbow', direction: 1 },
  elbow_down: { token: 'elbow_down', kind: 'joint_delta', jointKey: 'Elbow', direction: -1 },
  wrist_up: { token: 'wrist_up', kind: 'joint_delta', jointKey: 'Wrist_Pitch', direction: 1 },
  wrist_down: { token: 'wrist_down', kind: 'joint_delta', jointKey: 'Wrist_Pitch', direction: -1 },
  wrist_roll_cw: { token: 'wrist_roll_cw', kind: 'joint_delta', jointKey: 'Wrist_Roll', direction: 1 },
  wrist_roll_ccw: { token: 'wrist_roll_ccw', kind: 'joint_delta', jointKey: 'Wrist_Roll', direction: -1 },
  grip: { token: 'grip', kind: 'joint_set', jointKey: 'Jaw', target: 'max' },
  release: { token: 'release', kind: 'joint_set', jointKey: 'Jaw', target: 'min' },
  reset: { token: 'reset', kind: 'reset' },
};

const BASE_ACTIONS: Record<string, ActionSpec> = {
  drive_forward: { token: 'drive_forward', kind: 'base_motion', baseMotion: 'drive_forward' },
  drive_backward: { token: 'drive_backward', kind: 'base_motion', baseMotion: 'drive_backward' },
  strafe_left: { token: 'strafe_left', kind: 'base_motion', baseMotion: 'strafe_left' },
  strafe_right: { token: 'strafe_right', kind: 'base_motion', baseMotion: 'strafe_right' },
  rotate_left: { token: 'rotate_left', kind: 'base_motion', baseMotion: 'rotate_left' },
  rotate_right: { token: 'rotate_right', kind: 'base_motion', baseMotion: 'rotate_right' },
};

export const LEKIWI_CONFIG: RobotConfig = {
  id: 'lekiwi',
  urdfPath: '/models/lekiwi/LeKiwi.urdf',
  packagesPath: '/models/lekiwi/',
  joints: [...ARM_JOINTS],
  actionTokens: { ...ARM_ACTIONS, ...BASE_ACTIONS },
  wristLinkCandidates: ['Wrist_Roll_Pitch_08i-v1', 'Wrist_Roll_08c-v1', 'Wrist-Camera-Mount-v11', 'Moving_Jaw_08d-v1'],
};
