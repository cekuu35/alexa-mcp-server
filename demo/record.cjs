const pwPath = "C:/Users/cnkku/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core";
const { chromium } = require(pwPath);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: {
      dir: "C:/Users/cnkku/Desktop/opencode/alexa-mcp-server/demo/video",
      size: { width: 1280, height: 720 }
    },
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  console.log("Opening demo page...");
  await page.goto("file:///C:/Users/cnkku/Desktop/opencode/alexa-mcp-server/demo/index.html");
  await page.waitForTimeout(22000);

  await page.screenshot({ path: "C:/Users/cnkku/Desktop/opencode/alexa-mcp-server/demo/final.png" });
  console.log("Screenshot saved");

  await context.close();
  await browser.close();

  const fs = require("fs");
  const videoDir = "C:/Users/cnkku/Desktop/opencode/alexa-mcp-server/demo/video";
  const files = fs.readdirSync(videoDir).filter(f => f.endsWith(".webm"));
  console.log("Video files:", files);
})();
