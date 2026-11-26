// Renders scene.html to PNG frames. Usage: node render.js <outDir> [frames] [only=comma,list,of,t]
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const out = process.argv[2] || "png";
const N = Number(process.argv[3] || 150);
const only = process.argv[4] ? process.argv[4].split(",").map(Number) : null;
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };

(async () => {
  const srv = http
    .createServer((req, res) => {
      const f = path.join(__dirname, decodeURIComponent(req.url.split("?")[0]));
      if (!f.startsWith(__dirname) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    })
    .listen(4599);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  p.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
  p.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
  await p.goto("http://localhost:4599/scene.html");
  await p.waitForFunction("window.ready === true", null, { timeout: 60000 });
  const ts = only ?? Array.from({ length: N }, (_, i) => i / (N - 1));
  const t0 = Date.now();
  for (let i = 0; i < ts.length; i++) {
    await p.evaluate((t) => window.renderAt(t), ts[i]);
    const name = only ? `t${String(Math.round(ts[i] * 100)).padStart(3, "0")}.png` : `${String(i).padStart(3, "0")}.png`;
    await p.locator("canvas").screenshot({ path: path.join(out, name) });
  }
  console.log(`${ts.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await b.close();
  srv.close();
})();
