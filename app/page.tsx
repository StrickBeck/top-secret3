import Player from "@/components/Player";

export default function Page() {
  return (
    <>
      <noscript>
        <p style={{ padding: "var(--space-xl)" }}>
          Фильм о кремнёвом ноже из Ботая показывается в трёхмерном виде и требует JavaScript. Включите его в браузере.
        </p>
      </noscript>
      <Player />
    </>
  );
}
