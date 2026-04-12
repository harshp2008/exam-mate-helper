# Exammate Helper

A Chrome extension for IB students to streamline their ExamMate practice.  
Declutters the ExamMate UI and gives you the tools to track every question you've ever attempted with local or cloud synchronization.

---

## 🚨 CRITICAL BUG FIX & V1.1.0 UPDATES (April 2026)

This update addresses critical data persistence issues that have been overlooked in previous versions:

- **Persistent Credentials**: Firebase API keys and Project IDs are now stored properly and will **no longer disappear** when you update the extension.
- **To-Do Persistence**: Fixed a major flaw where To-Dos were failing to sync across updates in both Local and Firebase modes. Your queue is now safely preserved.
- **Hardened Sync Architecture**: Replaced the "Full State Overwrite" model with a logic-heavy **Delta Sync (Pull-then-Push)**. The extension now reconciles changes at the object level, drastically reducing Firestore Read/Write costs and preventing cross-device data loss.
- **Scalable V2 Database**: The entire local and cloud database structure has been normalized for future scalability and improved performance.

---

## 🚀 Key Features

### 🌟 Smart UI Clean-up
Removes headers, footers, logo boxes, and sidebars instantly. The interface is optimized to give you maximum screen real estate for the actual question content.

### 📝 Question Tracking & Completion
- **Direct Sidebar Integration**: Every question in the ExamMate sidebar gets a dedicated **Done** (✓) button.
- **Visual Feedback**: Completed questions are highlighted in green, while the currently active question is marked in yellow.
- **Strikethrough Logic**: Questions in your To-Do list automatically get a strikethrough once marked as done.
- **Smart Analytics**: Real-time Q/A counts (e.g., **1 Q**, **1 A**) displayed directly in the extension popup.

### 📁 Personal Favourites
ExamMate's default favourites are shared across all users on an account. This extension provides a **Personal Favourites (♡)** system that is completely private and independent of account limits.

### 📅 Daily To-Do Queue
Plan your study sessions with a progress bar and easy queue management via the **Today** dashboard. Includes a batch selection mode for queuing entire pages at once.

### 🔗 Advanced Duplicate Detection
Uses a high-precision pixel comparison engine to identify identical questions across different timezones or papers. Designate a "Primary" version to keep your stats clean.

### 🎯 Focus Mode (Now with Auto-Select)
The ultimate distraction-free study environment:
- **Total Filtering**: Toggle **Focus Mode** (👁️ icon) to hide every question except the ones in your daily queue.
- **Auto-Select**: When you enter Focus Mode, the extension automatically clicks on the first pending (undone) to-do item.
- **Navigation Lock**: Disables randomizers and non-essential navigation to keep you focused on your selected tasks.
- **Smart Redirection**: If a page has no to-dos, Focus Mode provides a "Scan" results page suggesting where your remaining queued questions are located.

---

## 📋 Quick Copy & Clipboard Support

The **Quick Copy** feature (available via the 📋 icon in the navigation bar) allows you to extract all images and text from the current question into a scrollable list for fast copying.

### ⚠️ Clipboard Limitations (Windows)

> [!NOTE]
> Due to limitations in the Chrome Extension SDK and Windows OS security models, items copied via this feature are placed in your **active clipboard** (Ctrl+V works perfectly), but they may not consistently appear in the **Windows Clipboard History** (Win+V) panel.
>
> - **Images**: Will copy successfully for direct pasting, but the Win+V history panel may show "No preview available" or ignore the entry entirely.
> - **Text**: Works natively in both active clipboard and Win+V history.

---

## 📦 How to Migrate to V2 (REQUIRED)

If you are using an older version of the extension, you **must** migrate to the new V2 structure to ensure your data is scalable and syncs correctly.

### Step 1: Export Your Old Data
1. Open the extension popup.
2. Go to the **DB** (Database) page.
3. Click the **More (⋮)** button in the top right.
4. Select **Export JSON** and save the file to your computer.

### Step 2: Clean Install (Recommended)
1. Remove the old extension from Chrome (`chrome://extensions`).
2. Download and load the latest version (V2).
3. Go to the **Settings (⚙)** page.
4. Click **📥 Import Data from Old Extension**.
5. Select the JSON file you exported in Step 1. Your data should now be visible in your local database.

### Step 3: Firebase Users (IMPORTANT)
If you use Firebase, you must perform a clean sync:
1. Go to your [Firebase Console](https://console.firebase.google.com/).
2. Manually **Delete all documents** in your `subjects`, `todos`, and `duplicates` collections to prevent structure conflicts.
3. Once the database is empty, enter your credentials in the extension **Settings** and click **Save & Verify**.
4. The extension will automatically push your freshly imported local data to the cloud.

---

## ⚙️ Firebase Setup & Multi-Device Rules

For the most stable experience across multiple computers:

1. **Setup Rule**: When first setting up, only have the extension active on **one device**. Complete the migration/import there first.
2. **Initial Sync**: Ensure the first device has successfully pushed all data to Firebase.
3. **Adding New Devices**: To add a second device, simply install the extension, enter your existing Firebase credentials, and click **Save & Verify**. It will automatically pull your entire history from the cloud.

---

## 📜 Past Changelogs

### March 2026 Updates
- **V2 Duplicate Data Architecture**: Initially implemented the normalized database schema (`duplicatesDB`) for structural parity.
- **Aggressive Rescan (Rejection Reset)**: Added the ability to re-evaluate previously dismissed AI duplicates if they are still relevant.
- **Pixel-Match Resilience**: Hardened the duplicate detection engine to prioritize live page images over background cache.
- **AJAX Navigation Support**: Full support for duplicate detection during dynamic page changes (Next Page, Search, Random) via an optimized MutationObserver bridge.
- **Reactive UI & Status Toasts**: Instantaneous sidebar label updates and real-time progress toasts.
- **MCQ Text Answer Retrieval**: Automatically detects and displays text-based answers (e.g., "B") whenever image-based answers are missing.
- **Quick Copy Sidebar**: Added a new content extraction sidebar (📋 icon) to quickly copy question/answer images and MCQ text.

---

## 🛠 Installation

This extension is not on the Chrome Web Store. Install it manually using Developer Mode:

1. Download the ZIP file and extract it.
2. Open Chrome and go to `chrome://extensions/`.
3. Toggle **Developer Mode** on.
4. Click **Load unpacked** and select the extracted folder.
5. Pin **Exammate Helper** to your toolbar.

---

## 🐛 Bug Reports & Contact

If you face any issues, please open a bug report on the [GitHub Issues](https://github.com/harshp2008/exam-mate-helper/issues) page. 

**When reporting a bug, please include:**
- Your current Browser version.
- Whether you are in Local or Firebase mode.
- A screenshot of the Console (`F12` -> Console tab) if any red errors appear.
- Any other relevant information (screenshots, files, images) would be highly appreciated

**Contact:**  
📧 **Email**: [harshpatel132008@gmail.com](mailto:harshpatel132008@gmail.com)

