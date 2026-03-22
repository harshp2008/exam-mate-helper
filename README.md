# Exammate Helper

A Chrome extension for IB students to streamline their ExamMate practice.  
Declutters the ExamMate UI and gives you the tools to track every question you've ever attempted with local or cloud synchronization.

---

## 🔥 Recent Updates

- **MCQ Text Answer Retrieval**: Automatically detects and displays text-based answers (e.g., "B") whenever a question is missing image-based answers.  
- **Improved 0-Answer Handling**: For questions where no answer (image or text) is found, the extension shows a bright red **0A** indicator and triggers a toast notification with a GitHub issue link to report the missing data.
- **Focus Mode Enhancement**: Automatically selects the first un-attempted to-do item in your list when entering Focus Mode.
- **Improved UI Persistence**: Custom buttons (Done, Favourite, Checkbox) and status indicators now stay correctly synced and visible even after using the **Search** or **Random** features.
- **Reliability & UI Improvements**: Significant bug fixes and overall app reliability improvements, including UI consistency and visual polish.

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

ExamMate's default favourites are shared across all users on an account, which often hits a limit. This extension provides a **Personal Favourites (♡)** system:

- Add any question to your private list.
- Filter and manage your favourites in the extension popup.
- Completely independent of the shared ExamMate account limits.
- Supports MCQ text-based answer persistence.

### 📅 Daily To-Do Queue & Selection Mode

Plan your study sessions with precision:

- **Selection Mode**: Click the **To-Do** icon in the sidebar header to toggle selection mode. Select multiple questions via checkboxes.
- **Batch Actions**: Use the "All" or "None" buttons to quickly queue up an entire page of questions.
- **Queue Stats**: Real-time counters show how many questions you've selected on the current page versus your total daily goal.
- **Today Dashboard**: Accessible via the extension popup, featuring a progress bar and easy queue management.

### 🎯 Focus Mode (Now with Auto-Select)

The ultimate distraction-free study environment:

- **Total Filtering**: Toggle **Focus Mode** (👁️ icon) to hide every question except the ones in your daily queue.
- **Auto-Select**: When you enter Focus Mode, the extension automatically clicks on the first pending (undone) to-do item.
- **Navigation Lock**: Disables randomizers and non-essential navigation to keep you focused on your selected tasks.
- **Smart Redirection**: If a page has no to-dos, Focus Mode provides a "Scan" results page suggesting where your remaining queued questions are located (by subject and page).

### ☁️ Firebase Cloud Sync (Optional)

Never lose your progress:

- Sync your "Done" status and Favourites across all your devices.
- High-performance Firestore integration with verified connectivity testing.

---

## 🛠 Installation

This extension is not on the Chrome Web Store. Install it manually using Developer Mode:

1. Download the ZIP file and extract it into a folder on your computer.
2. Open Chrome and go to `chrome://extensions/`
3. Toggle **Developer Mode** on (top-right corner).
4. Click **Load unpacked** and select the extracted folder.
5. Click the puzzle icon next to your profile picture and pin **Exammate Helper**.

---

## ⚙️ Firebase Setup (Optional)

By default, the extension stores data locally. For cloud sync:

1. Create a Project at [console.firebase.google.com](https://console.firebase.google.com/).
2. In Project Settings → Your apps → add a Web App → copy your **Project ID** and **API Key**.
3. Open the extension → Settings ⚙ → switch Storage Mode to **Firebase** → paste your keys → click **Save & Verify**.

---

## 🔧 Maintenance & Persistence

The extension is built to withstand ExamMate's dynamic page updates. Custom buttons and styles persist even after using the **Search** or **Random** features, thanks to a robust MutationObserver system.
