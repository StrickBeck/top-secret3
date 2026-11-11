// Copies the Draco decoder from three into /public so the GLB loads offline (museum kiosks often have no internet).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const src = join(process.cwd(), "node_modules", "three", "examples", "jsm", "libs", "draco", "gltf");
const dst = join(process.cwd(), "public", "draco");
if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log("draco decoder copied to public/draco");
}
