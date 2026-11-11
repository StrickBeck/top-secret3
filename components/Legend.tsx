import type { Mode } from "@/lib/engine";

// A control legend drawn as keycaps and a mouse, the way game HUDs show controls.

type Part = "left" | "right" | "middle" | "wheel";

function Mouse({ part }: { part: Part }) {
  const lit = (p: Part) => (part === p || (p === "middle" && part === "wheel") ? "legend__lit" : undefined);
  return (
    <svg className="legend__mouse" viewBox="0 0 24 34" aria-hidden="true">
      <path className="legend__outline" d="M12 1.5c-5.5 0-9.5 4-9.5 10v10.5c0 5.8 4.2 10.5 9.5 10.5s9.5-4.7 9.5-10.5V11.5c0-6-4-10-9.5-10z" />
      <path className={lit("left")} d="M11.2 2.3C6.6 2.7 3.3 6.3 3.3 11.5v2.3h7.9z" />
      <path className={lit("right")} d="M12.8 2.3v11.5h7.9v-2.3c0-5.2-3.3-8.8-7.9-9.2z" />
      <path className="legend__outline" d="M3 13.8h18M12 1.8v12" />
      <rect className={lit("middle")} x="10.2" y="5" width="3.6" height="6.4" rx="1.8" />
      {part === "wheel" && <path className="legend__lit-stroke" d="M12 18v9m-2.6-6.4L12 18l2.6 2.6m-5.2 3.8L12 27l2.6-2.6" />}
    </svg>
  );
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="legend__keys">
      {keys.map((k) => (
        <kbd key={k} className={k.length > 2 ? "legend__wide" : undefined}>{k}</kbd>
      ))}
    </span>
  );
}

function Wasd() {
  return (
    <span className="legend__wasd" aria-hidden="true">
      <kbd style={{ gridColumn: 2 }}>W</kbd>
      <kbd style={{ gridColumn: 1, gridRow: 2 }}>A</kbd>
      <kbd style={{ gridColumn: 2, gridRow: 2 }}>S</kbd>
      <kbd style={{ gridColumn: 3, gridRow: 2 }}>D</kbd>
    </span>
  );
}

type Row = { icon: React.ReactNode; label: string; speak: string };

const FILM: Row[] = [
  { icon: <Keys keys={["Пробел"]} />, label: "пауза", speak: "Пробел: пауза" },
  { icon: <Keys keys={["←", "→"]} />, label: "кадры", speak: "Стрелки влево и вправо: кадры" },
  { icon: <Keys keys={["C"]} />, label: "камера оператора", speak: "C: камера оператора" },
  { icon: <Keys keys={["F"]} />, label: "во весь экран", speak: "F: во весь экран" },
];

const OPERATOR: Row[] = [
  { icon: <Mouse part="left" />, label: "повернуть", speak: "Левая кнопка мыши: повернуть камеру на месте" },
  { icon: <Mouse part="right" />, label: "облететь", speak: "Правая кнопка мыши: облететь" },
  { icon: <Mouse part="middle" />, label: "сдвинуть", speak: "Средняя кнопка мыши: сдвинуть" },
  { icon: <Mouse part="wheel" />, label: "наезд", speak: "Колесо мыши: наехать и отъехать" },
  { icon: <Wasd />, label: "идти", speak: "W, A, S, D: вести камеру" },
  { icon: <Keys keys={["Q", "E"]} />, label: "вниз, вверх", speak: "Q и E: вниз и вверх" },
  { icon: <Keys keys={["Shift"]} />, label: "быстрее", speak: "Shift: быстрее" },
  { icon: <Keys keys={["C"]} />, label: "камера фильма", speak: "C: камера фильма" },
];

export default function Legend({ mode }: { mode: Mode }) {
  const rows = mode === "film" ? FILM : OPERATOR;
  return (
    <ul className="legend" data-mode={mode} aria-label="Как управлять">
      {rows.map((r) => (
        <li key={r.speak}>
          <span className="legend__icon">{r.icon}</span>
          <span className="legend__label" aria-hidden="true">{r.label}</span>
          <span className="visually-hidden">{r.speak}</span>
        </li>
      ))}
    </ul>
  );
}
