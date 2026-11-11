"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Exhibit, Mode } from "@/lib/engine";
import Legend from "./Legend";
import { DURATION, FPS, SHOTS, blackAt, formatTime, shotAt } from "@/lib/shots";

type Status = { kind: "loading"; progress: number } | { kind: "error"; message: string } | { kind: "ready" };

const MODEL_URL = "/models/botai.glb";

const RESTART_AFTER = 6; // seconds of rest before the kiosk loop starts again

export default function Player() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Exhibit | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef(1);
  const endedAt = useRef<number | null>(null);

  const [status, setStatus] = useState<Status>({ kind: "loading", progress: 0 });
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setModeState] = useState<Mode>("film");
  const [shot, setShot] = useState(1);
  const [frame, setFrame] = useState(1);
  const [panel, setPanel] = useState<"about" | null>(null);
  const sheetOpen = panel === "about";
  const togglePanel = useCallback((p: "about") => setPanel((v) => (v === p ? null : p)), []);
  const [legend, setLegend] = useState(true);
  const [lens, setLensState] = useState(35);

  // Boot the engine once per attempt.
  useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current;
    const view = viewRef.current;
    if (!canvas || !view) return;
    setStatus({ kind: "loading", progress: 0 });

    let engine: Exhibit | null = null;
    let ro: ResizeObserver | null = null;
    (async () => {
      try {
        const { Exhibit } = await import("@/lib/engine");
        if (disposed) return;
        engine = new Exhibit(canvas);
        engineRef.current = engine;
        (window as unknown as { __exhibit?: Exhibit }).__exhibit = engine;
        ro = new ResizeObserver(() => {
          const r = view.getBoundingClientRect();
          engine?.resize(Math.round(r.width), Math.round(r.height));
        });
        ro.observe(view);
        await engine.load(MODEL_URL, (p) => !disposed && setStatus({ kind: "loading", progress: p }));
        if (disposed) return;

        const params = new URLSearchParams(window.location.search);
        const startShot = Number(params.get("shot"));
        if (startShot >= 1 && startShot <= SHOTS.length) engine.seek(engine.shotStart(startShot));

        let lastFrame = -1;
        engine.onTick = (t) => {
          const f = Math.floor(t * FPS) + 1;
          if (headRef.current) headRef.current.style.left = `${(t / DURATION) * 100}%`;
          if (clockRef.current) clockRef.current.textContent = formatTime(t);
          if (fadeRef.current) fadeRef.current.style.opacity = engine?.mode === "film" ? String(blackAt(f)) : "0";
          if (f !== lastFrame && (f % 6 === 0 || Math.abs(f - lastFrame) > 6)) { lastFrame = f; setFrame(f); }
          const s = shotAt(f).n;
          if (s !== shotRef.current) {
            shotRef.current = s;
            setShot(s);
            const url = new URL(window.location.href);
            url.searchParams.set("shot", String(s));
            window.history.replaceState(null, "", url);
          }
          // Kiosk loop: rest on the last frame, then start again in film mode.
          if (!engine?.isPlaying && t >= DURATION - 0.01 && engine?.mode === "film") {
            endedAt.current ??= performance.now();
            if (performance.now() - endedAt.current > RESTART_AFTER * 1000) {
              endedAt.current = null;
              engine.seek(0);
              engine.play();
              setPlaying(true);
            }
          } else endedAt.current = null;
          if (engine && engine.isPlaying !== playingRef.current) setPlaying(engine.isPlaying);
        };
        engine.start();
        setStatus({ kind: "ready" });
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reduce) { engine.play(); setPlaying(true); }
      } catch (err) {
        if (disposed) return;
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ kind: "error", message });
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [attempt]);

  const playingRef = useRef(playing);
  playingRef.current = playing;

  const togglePlay = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.isPlaying) { e.pause(); setPlaying(false); } else { e.play(); setPlaying(true); }
  }, []);

  const setMode = useCallback((m: Mode) => {
    const e = engineRef.current;
    if (!e) return;
    e.setMode(m);
    setModeState(m);
    if (m === "operator") setLensState(Math.round(e.lens));
  }, []);

  const goShot = useCallback((n: number) => {
    const e = engineRef.current;
    if (!e) return;
    const k = Math.min(SHOTS.length, Math.max(1, n));
    e.seek(e.shotStart(k));
  }, []);

  const seekStrip = useCallback((ev: React.MouseEvent<HTMLButtonElement>, n: number) => {
    const e = engineRef.current;
    if (!e) return;
    const s = SHOTS[n - 1];
    const r = ev.currentTarget.getBoundingClientRect();
    const k = ev.detail === 0 ? 0 : Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    e.seek((s.start - 1 + k * (s.end - s.start + 1)) / FPS);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }, []);

  const onLens = useCallback((mm: number) => {
    setLensState(mm);
    engineRef.current?.setLens(mm);
  }, []);

  // Keyboard: space plays, arrows step shots, C hands the camera over, I opens the sheet, F fills the screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "ArrowRight") goShot(shotRef.current + 1);
      else if (e.code === "ArrowLeft") {
        const en = engineRef.current;
        const s = SHOTS[shotRef.current - 1];
        const into = en ? en.current * FPS + 1 - s.start : 0;
        goShot(into > FPS * 1.5 ? shotRef.current : shotRef.current - 1);
      }
      else if (e.code === "KeyC") setMode(engineRef.current?.mode === "operator" ? "film" : "operator");
      else if (e.code === "KeyI") togglePanel("about");
      else if (e.code === "KeyH" || e.key === "?") setLegend((v) => !v);
      else if (e.code === "Escape") setPanel(null);
      else if (e.code === "KeyF") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, goShot, setMode, toggleFullscreen, togglePanel]);

  const current = SHOTS[shot - 1];
  const intoShot = frame - current.start;
  const showCaption = status.kind === "ready" && mode === "film" && shot < 9 && intoShot >= 18 && intoShot < FPS * 4.5;
  const showMuseumTitle = status.kind === "ready" && mode === "film" && frame >= 2010;

  return (
    <div className="app">
      <header className="bar">
        <h1 className="bar__name title">Кремнёвый нож <span>Ботай, IV тыс. до н. э.</span></h1>
        <div className="seg" role="group" aria-label="Камера">
          <button type="button" aria-pressed={mode === "film"} onClick={() => setMode("film")} disabled={status.kind !== "ready"}>Фильм</button>
          <button type="button" aria-pressed={mode === "operator"} onClick={() => setMode("operator")} disabled={status.kind !== "ready"}>Оператор</button>
        </div>
        <button type="button" className="btn btn--quiet" aria-expanded={sheetOpen} aria-controls="sheet" onClick={() => togglePanel("about")}>О предмете</button>
        <button type="button" className="btn btn--quiet btn--icon" aria-label="Во весь экран" onClick={toggleFullscreen}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" /></svg>
        </button>
      </header>

      <main className="stage">
        <div className="frame">
          <div className="frame__view" ref={viewRef} data-mode={mode}>
            <canvas ref={canvasRef} aria-label="Трёхмерный фильм о кремнёвом ноже из поселения Ботай" />
            <div className="fade" ref={fadeRef} style={{ opacity: 0 }} />

            {showCaption && (
              <div className="caption">
                <h2 className="caption__title display">{current.title}</h2>
                <p className="caption__line">{current.line}</p>
              </div>
            )}

            {showMuseumTitle && (
              <div className="museum-title">
                <h2 className="display">Кремнёвый нож</h2>
                <p>Ботай, IV тысячелетие до нашей эры</p>
              </div>
            )}

            {mode === "operator" && status.kind === "ready" && (
              <div className="operator-panel">
                <p>Камера оператора</p>
                <label className="lens">
                  Объектив
                  <input type="range" min={14} max={135} step={1} value={lens} onChange={(e) => onLens(Number(e.target.value))} />
                  <output>{lens} мм</output>
                </label>
                <button type="button" className="btn" onClick={() => setMode("film")}>Вернуть камеру фильма</button>
              </div>
            )}

            {status.kind === "ready" && legend && <Legend mode={mode} />}

            {status.kind === "loading" && (
              <div className="state grained" role="status" aria-live="polite">
                <p className="display" aria-hidden="true">{Math.round(status.progress * 100)}</p>
                <p className="state__line">Загружаем поселение Ботай: {Math.round(status.progress * 100)} процентов.</p>
                <div className="state__meter"><span style={{ transform: `scaleX(${status.progress})` }} /></div>
              </div>
            )}

            {status.kind === "error" && (
              <div className="state grained" role="alert">
                <h2 className="display" style={{ fontSize: "var(--text-fig)" }}>Нет сцены</h2>
                <p className="state__line">Файл сцены не загрузился: {status.message}. Проверьте, что botai.glb лежит в public/models, и повторите.</p>
                <div><button type="button" className="btn" onClick={() => setAttempt((a) => a + 1)}>Повторить</button></div>
              </div>
            )}
          </div>
        </div>

        <aside className="sheet" id="sheet" hidden={!sheetOpen} aria-label="О предмете">
          <div className="sheet__head">
            <h2 className="display">О предмете</h2>
            <button type="button" className="btn btn--quiet btn--icon" aria-label="Закрыть" onClick={() => setPanel(null)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5z" /></svg>
            </button>
          </div>
          <dl className="facts">
            <div><dt>Предмет</dt><dd>Кремнёвый нож</dd></div>
            <div><dt>Культура</dt><dd>Ботайская</dd></div>
            <div><dt>Время</dt><dd>IV тыс. до н. э.</dd></div>
            <div><dt>Место</dt><dd>Поселение Ботай, река Иманбурлык</dd></div>
            <div><dt>Область</dt><dd>Северо-Казахстанская</dd></div>
          </dl>
          <h3 className="title">Кадры</h3>
          <ol className="shots">
            {SHOTS.map((s) => (
              <li key={s.n}>
                <button type="button" aria-current={s.n === shot} onClick={() => goShot(s.n)}>
                  <span className="n">{s.n}</span>
                  <span className="t">{s.title}</span>
                  <span className="time">{formatTime((s.start - 1) / FPS)}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="sheet__note">Нож, люди и поселение — трёхмерная реконструкция, а не скан экспоната.</p>
        </aside>

      </main>

      <footer className="transport">
        <button type="button" className="btn btn--primary" onClick={togglePlay} disabled={status.kind !== "ready"} aria-label={playing ? "Пауза" : "Смотреть"}>
          {playing ? "Пауза" : "Смотреть"}
        </button>
        <p className="clock"><span ref={clockRef}>00:00</span> <span>/ {formatTime(DURATION)}</span></p>
        <nav className="strip" aria-label="Кадры фильма">
          {SHOTS.map((s) => (
            <button
              key={s.n}
              type="button"
              className="strip__cell"
              style={{ flex: `${s.end - s.start + 1} 1 0` }}
              aria-current={s.n === shot}
              aria-label={`Кадр ${s.n}: ${s.title}`}
              onClick={(ev) => seekStrip(ev, s.n)}
              disabled={status.kind !== "ready"}
            >
              <span className="n">{s.n}</span>
              <span className="t">{s.title}</span>
            </button>
          ))}
          <div className="strip__head" ref={headRef} style={{ left: "0%" }} />
        </nav>
      </footer>
    </div>
  );
}
