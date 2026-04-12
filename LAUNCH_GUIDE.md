# How to Launch Gemini Word Tracker to the Chrome Web Store

Follow these exact steps to publish your extension for the world to use.

---

### Phase 1: Prepare Your Final Assets
Google requires specific images before you can submit. 

1.  **Create 3 Icons:** Place these PNG files in your project folder:
    *   `icon16.png` (16x16 pixels)
    *   `icon48.png` (48x48 pixels)
    *   `icon128.png` (128x128 pixels)
    *   *Note: If these files are missing, the extension will fail to load locally.*
2.  **Take Screenshots:**
    *   Take **1 to 5 screenshots** of the extension on the Gemini page.
    *   Size: **1280x800** or **640x400** pixels.
3.  **Promotional Tile:**
    *   Create a "Small Tile" image of **440x280** pixels.

---

### Phase 2: Package the Extension
1.  Open your project folder: \`/Users/lancezhao/Documents/gemini-word-tracker\`.
2.  Select these files:
    *   \`manifest.json\`, \`content.js\`, \`popup.html\`, \`popup.js\`, \`styles.css\`
    *   \`icon16.png\`, \`icon48.png\`, \`icon128.png\`
3.  **Right-click > Compress (Zip).**
    *   **CRITICAL:** Do *not* include the \`.git\` folder, \`README.md\`, \`LICENSE\`, or this \`LAUNCH_GUIDE.md\` in the zip.

---

### Phase 3: Developer Account & Listing
1.  Go to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
2.  Pay the **$5 USD one-time registration fee**.
3.  Click **"+ New Item"** and upload your \`.zip\` file.
4.  **Fill out the Listing:**
    *   **Description:** Use the "Key Features" from your README.
    *   **Category:** Select **Productivity**.
5.  **Privacy Tab:**
    *   **Single Purpose:** "Tracks daily word usage on the Gemini Web UI."
    *   **Permissions:** \`storage\` is used for local data persistence.
    *   **Data Usage:** Confirm you **do not** collect or sell user data.

---

### Phase 4: Submit
1.  Upload your screenshots and icons in the "Store Listing" tab.
2.  Click **"Submit for Review"**.
3.  Approval usually takes **2 to 7 days**.
