const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on("pageerror", (err) => {
        console.log("REACT ERROR CAPTURED:");
        console.log(err.message);
        console.log(err.stack);
    });

    page.on("console", (msg) => {
        if (msg.type() === "error") {
            console.log("CONSOLE ERROR:", msg.text());
        }
    });

    try {
        await page.goto("http://localhost:5176", { waitUntil: "networkidle" });
        await page.waitForTimeout(3000); // Wait for React to mount and error
    } catch (e) {
        console.log("Navigation error:", e);
    }

    await browser.close();
})();
