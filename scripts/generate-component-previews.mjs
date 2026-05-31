import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.PREVIEW_BASE_URL ?? "http://127.0.0.1:3001";
const captureDelayMs = Number(process.env.PREVIEW_CAPTURE_DELAY_MS ?? 2600);
const pageLoadTimeoutMs = Number(process.env.PREVIEW_PAGE_LOAD_TIMEOUT_MS ?? 60000);
const captureStart = Number(process.env.PREVIEW_CAPTURE_START ?? 0);
const captureLimit = process.env.PREVIEW_CAPTURE_LIMIT
  ? Number(process.env.PREVIEW_CAPTURE_LIMIT)
  : undefined;
const previewTheme = process.env.PREVIEW_THEME ?? "dark";
const outputSuffix =
  process.env.PREVIEW_OUTPUT_SUFFIX ?? (previewTheme === "dark" ? "" : `-${previewTheme}`);
const outDir = new URL("../public/component-previews/", import.meta.url);
const registryPath = new URL("../lib/bjork-gallery.ts", import.meta.url);
const viewport = { width: 1280, height: 720 };
const clip = { x: 190, y: 100, width: 900, height: 520, scale: 1 };

const registry = await readFile(registryPath, "utf8");
const items = [...registry.matchAll(/slug: "([^"]+)"[\s\S]*?route: "([^"]+)"/g)].map(
  ([, slug, route]) => ({ slug, route })
);

if (items.length === 0) {
  throw new Error("No gallery items found in lib/bjork-gallery.ts");
}

const captureItems = items.slice(
  captureStart,
  captureLimit ? captureStart + captureLimit : undefined
);

if (captureItems.length === 0) {
  throw new Error("No preview items matched the capture range.");
}

await mkdir(outDir, { recursive: true });

const userDataDir = await mkdtemp(join(tmpdir(), "bjork-preview-chrome-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--remote-debugging-port=0",
  `--user-data-dir=${userDataDir}`,
  `--window-size=${viewport.width},${viewport.height}`,
  "--force-device-scale-factor=1",
  "about:blank",
]);

try {
  const browserWebSocketUrl = await waitForChrome(chrome);
  const debugOrigin = browserWebSocketUrl.replace(/^ws:/, "http:").replace(/\/devtools\/browser\/.*$/, "");
  const pages = await fetchJson(`${debugOrigin}/json/list`);
  const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);

  if (!page) {
    throw new Error("Chrome did not expose a debuggable page target.");
  }

  const cdp = await createCdpClient(page.webSocketDebuggerUrl);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem("theme", ${JSON.stringify(previewTheme)}); } catch (_) {}`,
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const item of captureItems) {
    const target = new URL(item.route, baseUrl);
    target.searchParams.set("preview", "1");
    target.searchParams.set("theme", previewTheme);
    const output = new URL(`${item.slug}${outputSuffix}.png`, outDir);

    console.log(`Capturing ${item.slug}${outputSuffix}`);
    const loaded = cdp.waitForEvent("Page.loadEventFired", pageLoadTimeoutMs);
    await cdp.send("Page.navigate", { url: target.toString() });
    await loaded;
    await wait(captureDelayMs);
    await assertPageCaptured(target, cdp);

    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
      clip,
    });

    await writeFile(output, Buffer.from(data, "base64"));
  }

  cdp.close();
  console.log(`Captured ${captureItems.length} previews to ${outDir.pathname}`);
} finally {
  chrome.kill("SIGTERM");
  await waitForProcessExit(chrome, 3000);
  await rmWithRetry(userDataDir);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rmWithRetry(path, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === attempts - 1 || error?.code !== "ENOTEMPTY") {
        throw error;
      }

      await wait(150 * (attempt + 1));
    }
  }
}

function waitForProcessExit(process, timeoutMs) {
  if (process.exitCode !== null || process.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      process.kill("SIGKILL");
      resolve();
    }, timeoutMs);

    process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function assertPageCaptured(target, cdp) {
  const { result } = await cdp.send("Runtime.evaluate", {
    expression: "document.body?.innerText || ''",
    returnByValue: true,
  });
  const bodyText = result?.value ?? "";

  if (
    bodyText.includes("This site can't be reached") ||
    bodyText.includes("ERR_CONNECTION_REFUSED") ||
    bodyText.includes("Runtime Error") ||
    bodyText.includes("Cannot find module")
  ) {
    throw new Error(`Preview route failed before capture: ${target.toString()}`);
  }
}

function waitForChrome(process) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for Chrome DevTools endpoint."));
    }, 15000);

    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);

      if (match) {
        clearTimeout(timeout);
        cleanup();
        resolve(match[1]);
      }
    };

    const onExit = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error("Chrome exited before DevTools was ready."));
    };

    const cleanup = () => {
      process.stderr.off("data", onData);
      process.stdout.off("data", onData);
      process.off("exit", onExit);
    };

    process.stderr.on("data", onData);
    process.stdout.on("data", onData);
    process.on("exit", onExit);
  });
}

function createCdpClient(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const callbacks = new Map();
  const eventWaiters = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id) {
      const callback = callbacks.get(message.id);

      if (!callback) {
        return;
      }

      callbacks.delete(message.id);

      if (message.error) {
        callback.reject(new Error(message.error.message));
      } else {
        callback.resolve(message.result ?? {});
      }

      return;
    }

    const waiters = eventWaiters.get(message.method);

    if (!waiters?.length) {
      return;
    }

    const waiter = waiters.shift();
    clearTimeout(waiter.timeout);
    waiter.resolve(message.params ?? {});
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const requestId = ++id;

          socket.send(JSON.stringify({ id: requestId, method, params }));

          return new Promise((requestResolve, requestReject) => {
            callbacks.set(requestId, {
              resolve: requestResolve,
              reject: requestReject,
            });
          });
        },
        waitForEvent(method, timeoutMs) {
          return new Promise((eventResolve, eventReject) => {
            const timeout = setTimeout(() => {
              eventReject(new Error(`Timed out waiting for ${method}.`));
            }, timeoutMs);

            const waiters = eventWaiters.get(method) ?? [];
            waiters.push({ resolve: eventResolve, timeout });
            eventWaiters.set(method, waiters);
          });
        },
        close() {
          socket.close();
        },
      });
    });

    socket.addEventListener("error", () => {
      reject(new Error("Failed to connect to Chrome DevTools."));
    });
  });
}
