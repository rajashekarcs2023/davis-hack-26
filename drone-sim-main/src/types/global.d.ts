interface ImportMetaEnv {
  readonly VITE_CESIUM_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const Cesium: any;

interface Window {
  Cesium?: any;
  DACSimAPI?: {
    sendAction: (
      action:
        | "forward"
        | "backward"
        | "left"
        | "right"
        | "ascend"
        | "descend"
        | "rotate_cw"
        | "rotate_ccw",
      magnitude?: number,
    ) => void;
    getState: () => {
      lat: number;
      lon: number;
      altAgl: number;
      altMsl: number;
      heading: number;
      speed: number;
      timestamp: number;
    };
    setFrameStream: (active: boolean, intervalMs?: number) => void;
  };
}

declare module "@takram/three-atmosphere";
declare module "@takram/three-geospatial";
declare module "@takram/three-geospatial-effects";
declare module "@takram/three-clouds";
