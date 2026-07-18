import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = fileURLToPath(new URL("../work/github-pages-release/", import.meta.url));
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("export", `${Date.now()}`);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(`${projectRoot}dist/client`, outputDirectory, { recursive: true });
await Promise.all([
  rm(`${outputDirectory}/.vite`, { recursive: true, force: true }),
  rm(`${outputDirectory}/.assetsignore`, { force: true }),
  rm(`${outputDirectory}/_headers`, { force: true }),
]);
const { default: worker } = await import(workerUrl.href);
const response = await worker.fetch(
  new Request("https://howtobeawafer.github.io/", {
    headers: {
      accept: "text/html",
      host: "howtobeawafer.github.io",
      "x-forwarded-host": "howtobeawafer.github.io",
      "x-forwarded-proto": "https",
    },
  }),
  {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  },
  {
    waitUntil() {},
    passThroughOnException() {},
  },
);

if (!response.ok) throw new Error(`Static render failed with HTTP ${response.status}.`);

const socialImageRoot = "https://howtobeawafer.github.io/og.jpg";
const socialImagePages = "https://howtobeawafer.github.io/sleep-light-study/og.jpg";
const html = (await response.text())
  .replaceAll(socialImageRoot, socialImagePages)
  .replaceAll("/assets/", "./assets/");

if (!html.includes("Read tutorial and begin") || !html.includes("Control — normal sleep")) {
  throw new Error("Static render is missing the participant start control.");
}
if (html.toLowerCase().includes("or test")) {
  throw new Error("Static render publicly reveals the hidden test participant hint.");
}
if (html.includes('href="/assets/') || html.includes('import("/assets/')) {
  throw new Error("Static render contains root-relative assets that would break on GitHub Pages.");
}

const outputFiles = await readdir(outputDirectory, { recursive: true });
const javascriptFiles = outputFiles.filter((path) => path.endsWith(".js"));
const javascript = (
  await Promise.all(javascriptFiles.map((path) => readFile(`${outputDirectory}/${path}`, "utf8")))
).join("\n");
if (
  !javascript.includes("Open data dashboard") ||
  !javascript.includes("sb_publishable_") ||
  !javascript.includes("Touch-device instructions") ||
  !javascript.includes("Tap again to end") ||
  !javascript.includes("Karolinska Sleepiness Scale") ||
  !javascript.includes("I have woken up") ||
  !javascript.includes("Three valid responses are next") ||
  !javascript.includes("Keep these as similar as practical") ||
  !javascript.includes("Your name must be unique") ||
  !javascript.includes("Questions or feedback") ||
  !javascript.includes("submit_profile_study_session")
) {
  throw new Error("Static client bundle is missing a required study control or storage integration.");
}

await Promise.all([
  writeFile(`${outputDirectory}/index.html`, html, "utf8"),
  writeFile(`${outputDirectory}/404.html`, html, "utf8"),
  writeFile(`${outputDirectory}/.nojekyll`, "", "utf8"),
]);

const clientManifest = JSON.parse(
  await readFile(`${projectRoot}dist/client/.vite/manifest.json`, "utf8"),
);
if (!clientManifest || typeof clientManifest !== "object") {
  throw new Error("Client manifest validation failed.");
}

console.log(`GitHub Pages bundle ready: ${outputDirectory}`);
