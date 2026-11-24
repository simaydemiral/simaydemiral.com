const { defineConfig, devices } = require("@playwright/test");

const PORT = 8817;
const baseURL = `http://127.0.0.1:${PORT}`;

/* Real Chrome, muted. One worker, because the dictionaries are shared and
   rate-limited. No retries: a test that passes on its second go is a finding,
   not a pass. */
module.exports = defineConfig({
  testDir: "./specs",
  outputDir: ".output/artifacts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: ".output/html", open: "never" }],
    ["json", { outputFile: ".output/results.json" }],
  ],
  use: {
    baseURL,
    headless: true,
    serviceWorkers: "block",
    timezoneId: "America/Los_Angeles",
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    /* A virtual audio device: nothing reaches the speakers, and playback does
       not depend on the sound hardware of the machine running the test. */
    launchOptions: { args: ["--mute-audio", "--disable-audio-output",
                            "--autoplay-policy=user-gesture-required"] },
  },
  projects: [
    { name: "desktop", use: { channel: "chrome", viewport: { width: 1280, height: 900 } } },
    {
      name: "phone",
      grepInvert: /@desktop/,
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
    /* Safari's engine at iPhone size. Not a real iPhone -- no iOS audio
       session, no home-screen app -- but the same WebKit that decides how
       Safari lays out, selects text and plays sound. The Chrome-only flags
       above mean nothing to it, so it launches plain. */
    {
      name: "iphone",
      grepInvert: /@desktop/,
      use: { ...devices["iPhone 17"], launchOptions: {} },
    },
  ],
  webServer: {
    command: "node serve.js",
    url: `${baseURL}/flashcards/`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
