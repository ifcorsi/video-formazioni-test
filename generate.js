const puppeteer = require("puppeteer");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");

const VIDEO_URL = process.argv[2] || 
  "https://www.creaformazioni.it/formazioni11/recupera.php?recupera=SerieA-2025-12-15-ASRoma-ASR-COM-home.json";

const FRAME_URL = process.argv[3] || 
  "https://www.creaformazioni.it/formazioni11/recupera-no-delay.php?recupera=SerieA-2025-12-15-ASRoma-ASR-COM-home.json";

const FPS = 30;
const RECORD_DURATION = 15;  // Per video con delay
const OUTPUT_VIDEO = "pres1.mp4";

async function record() {
  console.log("🚀 Avvio Puppeteer...");
  
  // 🔥 PRIMO: Cattura FRAME A 1s dal link NO-DELAY
  console.log("🖼️ Catturo FRAME 1s da no-delay...");
  const browserFrame = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 780, height: 1280 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const pageFrame = await browserFrame.newPage();
  await pageFrame.goto(FRAME_URL, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 1500)); // 1.5s per animazione no-delay
  await pageFrame.screenshot({ path: "frame-1s.png" });
  console.log("✅ FRAME 1s salvato: frame-1s.png");
  await browserFrame.close();

  // 🔥 SECONDO: Registra VIDEO dal link CON-DELAY
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 780, height: 1280 }, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto(VIDEO_URL, { waitUntil: "networkidle2" });

  // Verifica immagini
  const imgs = await page.$$eval("img", (els) =>
    els.map((el) => ({
      src: el.src,
      complete: el.complete,
      naturalWidth: el.naturalWidth,
    }))
  );
  console.log(`✅ Immagini caricate: ${imgs.filter((i) => i.complete && i.naturalWidth > 0).length}/${imgs.length}`);

  // 🔥 SALVA PREVIEW-INIZIO.PNG
  await page.screenshot({ path: "preview-inizio.png" });
  console.log("📷 PRIMO FRAME: preview-inizio.png");

  // 🔥 VIDEO INTRO 1s
  console.log("🎥 Creo INTRO 1s...");
  await runFFmpeg([
    "-loop", "1",
    "-i", "preview-inizio.png",
    "-t", "1",
    "-r", String(FPS),
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-vf", "scale=780:1280:force_original_aspect_ratio=increase,crop=780:1280",
    "-y",
    "intro-1s.mp4"
  ]);

  // 🔥 FFmpeg per VIDEO ANIMAZIONE
  console.log("🎥 Avvio FFmpeg VIDEO...");
  const ffmpegProcess = spawn(ffmpegPath, [
    "-y",
    "-f", "image2pipe",
    "-r", String(FPS),
    "-i", "-",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "ultrafast",
    "-s", "780x1280",
    "-t", String(RECORD_DURATION),
    "animazione.mp4"
  ]);

  ffmpegProcess.stderr.on("data", (d) => process.stdout.write(d.toString()));

  const client = await page.target().createCDPSession();
  
  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    everyNthFrame: 1,
    maxWidth: 780,
    maxHeight: 1280,
  });

  client.on("Page.screencastFrame", async (event) => {
    const buffer = Buffer.from(event.data, "base64");
    ffmpegProcess.stdin.write(buffer);
    await client.send("Page.screencastFrameAck", { sessionId: event.sessionId });
  });

  // ⏳ Attesa animazione completa (delay version)
  console.log("⏳ Attesa animazione completa...");
  await page.waitForSelector('.player-11', { timeout: 15000 }).catch(() => {
    console.log("⚠️ Timeout, continuo...");
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log(`⏱️ Registrazione ${RECORD_DURATION}s...`);
  await new Promise(r => setTimeout(r, RECORD_DURATION * 1000));

  console.log("⏹️ Stop screencast...");
  await client.send("Page.stopScreencast");
  ffmpegProcess.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpegProcess.on("close", (code) => {
      console.log(`✅ FFmpeg video terminato: ${code}`);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg fallito: ${code}`));
    });
  });

  // 🔥 CONCATENA intro + animazione
  console.log("🔗 Concateno VIDEO...");
  await runFFmpeg([
    "-i", "intro-1s.mp4",
    "-i", "animazione.mp4",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]",
    "-map", "[v]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-y",
    OUTPUT_VIDEO
  ]);

  // 🧹 Pulizia
  ["intro-1s.mp4", "animazione.mp4"].forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`🧹 Pulito: ${file}`);
    }
  });

  console.log(`✅ VIDEO ANIMATO: ${OUTPUT_VIDEO} (da recupera.php)`);
  console.log(`✅ FRAME 1s: frame-1s.png (da recupera-no-delay.php)`);
  console.log(`✅ PRIMO FRAME: preview-inizio.png`);
  
  await browser.close();
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    ff.stderr.on("data", (d) => process.stdout.write(d.toString()));
    ff.on("close", (code) => {
      if (code === 0) {
        console.log("✅ FFmpeg OK");
        resolve();
      } else {
        console.error(`❌ FFmpeg: ${code}`);
        reject(new Error(`FFmpeg: ${code}`));
      }
    });
  });
}

record().catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});
