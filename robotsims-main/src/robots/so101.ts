export type RobotId = 'so101' | 'lekiwi';

export interface JointSpec {
  key: string;
  urdfName: string;
  min: number;
  max: number;
  defaultValue: number;
}

export type ActionKind = 'joint_delta' | 'joint_set' | 'reset' | 'base_motion';

export interface ActionSpec {
  token: string;
  kind: ActionKind;
  jointKey?: string;
  direction?: 1 | -1;
  target?: 'min' | 'max';
  baseMotion?: 'drive_forward' | 'drive_backward' | 'strafe_left' | 'strafe_right' | 'rotate_left' | 'rotate_right';
}

export interface RobotConfig {
  id: RobotId;
  urdfPath: string;
  packagesPath: string;
  joints: JointSpec[];
  actionTokens: Record<string, ActionSpec>;
  wristLinkCandidates: string[];
}

export const SO101_JOINTS: JointSpec[] = [
  { key: 'Rotation', urdfName: 'shoulder_pan', min: -1.91986, max: 1.91986, defaultValue: 0 },
  { key: 'Pitch', urdfName: 'shoulder_lift', min: -1.74533, max: 1.74533, defaultValue: -0.4 },
  { key: 'Elbow', urdfName: 'elbow_flex', min: -1.69, max: 1.69, defaultValue: 0.8 },
  { key: 'Wrist_Pitch', urdfName: 'wrist_flex', min: -1.65806, max: 1.65806, defaultValue: 0 },
  { key: 'Wrist_Roll', urdfName: 'wrist_roll', min: -2.74385, max: 2.84121, defaultValue: 0 },
  { key: 'Jaw', urdfName: 'gripper', min: -0.174533, max: 1.74533, defaultValue: -0.05 },
];

export const SO101_ACTION_TOKENS: Record<string, ActionSpec> = {
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

export const SO101_CONFIG: RobotConfig = {
  id: 'so101',
  urdfPath: '/models/so101/so101_new_calib.urdf',
  packagesPath: '/models/so101/',
  joints: SO101_JOINTS,
  actionTokens: SO101_ACTION_TOKENS,
  wristLinkCandidates: ['gripper_link', 'wrist_link', 'moving_jaw_so101_v1_link'],
};
