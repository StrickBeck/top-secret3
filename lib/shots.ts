// The film's timeline. Frames match the Blender scene (24 fps, 2160 frames).
export const FPS = 24;
export const FRAME_END = 2160;
export const DURATION = FRAME_END / FPS; // 90 s

export type Shot = {
  n: number;
  camera: string;
  title: string;
  line: string;
  start: number; // first frame
  end: number; // last frame
};

export const SHOTS: Shot[] = [
  { n: 1, camera: "CAM_01_Steppe", title: "Степь", line: "Пролёт над степью к поселению у реки Иманбурлык", start: 1, end: 240 },
  { n: 2, camera: "CAM_02_Street", title: "Поселение", line: "Полуземлянки, соединённые переходами", start: 241, end: 480 },
  { n: 3, camera: "CAM_03_Master", title: "Мастер", line: "Мастер у очага оббивает кремень", start: 481, end: 720 },
  { n: 4, camera: "CAM_04_Hands", title: "Руки", line: "Отбойник и заготовка ножа", start: 721, end: 960 },
  { n: 5, camera: "CAM_05_Fire", title: "Нож готов", line: "Мастер рассматривает готовый нож", start: 961, end: 1200 },
  { n: 6, camera: "CAM_06_Ground", title: "Земля", line: "Нож остаётся у очага, проходят века", start: 1201, end: 1392 },
  { n: 7, camera: "CAM_07_Dig", title: "Раскоп", line: "Археолог расчищает культурный слой", start: 1393, end: 1680 },
  { n: 8, camera: "CAM_08_Find", title: "Находка", line: "Нож на дне раскопа", start: 1681, end: 1920 },
  { n: 9, camera: "CAM_09_Museum", title: "Витрина", line: "Нож в витрине музея", start: 1921, end: 2160 },
];

export function shotAt(frame: number): Shot {
  for (const s of SHOTS) if (frame >= s.start && frame <= s.end) return s;
  return frame < 1 ? SHOTS[0] : SHOTS[SHOTS.length - 1];
}

// Fades to black, taken from the exposure keys of the Blender scene (frame, stops).
const EXPOSURE_KEYS: [number, number][] = [
  [1, -6], [30, 0], [1330, 0], [1392, -8], [1393, -8], [1425, 0],
  [1890, 0], [1920, -8], [1921, -8], [1950, 0], [2130, 0], [2160, -8],
];

export function blackAt(frame: number): number {
  const k = EXPOSURE_KEYS;
  let e = k[k.length - 1][1];
  if (frame <= k[0][0]) e = k[0][1];
  else {
    for (let i = 0; i < k.length - 1; i++) {
      const [f0, e0] = k[i];
      const [f1, e1] = k[i + 1];
      if (frame >= f0 && frame <= f1) {
        const t = f1 === f0 ? 1 : (frame - f0) / (f1 - f0);
        const s = t * t * (3 - 2 * t);
        e = e0 + (e1 - e0) * s;
        break;
      }
    }
  }
  return 1 - Math.pow(2, e);
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
