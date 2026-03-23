# Exammate Helper

A Chrome extension for IB students to streamline their ExamMate practice.  
Declutters the ExamMate UI and gives you the tools to track every question you've ever attempted with local or cloud synchronization.

---

## 🔥 Recent Updates (March 2026)

- **Advanced Duplicate Detection**: Integrated the `pixelmatch` library for professional image-based comparison. It now detects duplicate questions with 90%+ pixel accuracy, even across different timezones or papers.
- **Smart Blacklist System**: If you delete or reject an AI-detected duplicate group, the extension now remembers your choice and will never automatically re-suggest that group again.
- **Sidebar Search Harvest**: The search box in the Duplicates sidebar now scans both your logged questions *and* questions currently visible on the ExamMate page.
- **Modular Refactor**: The entire codebase has been reorganized into a clean, modular `src/` directory structure for better performance and maintainability.
- **Instant UI Refreshes**: Resolved race conditions in background message processing, ensuring the extension popup and sidebar update immediately after actions.
- **MCQ Text Answer Retrieval**: Automatically detects and displays text-based answers (e.g., "B") whenever image-based answers are missing.

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

### 🔗 Advanced Duplicate Detection (Beta)

Tired of seeing the same question multiple times across different timezones or papers?

- **Pixelmatch Engine**: Uses high-precision pixel comparison to identify identical diagrams and text.
- **Smart Grouping**: Automatically identifies candidate groups on the current page for review.
- **Search Everywhere**: Search for duplicates across your entire logged database plus current page sidebar items.
- **Rejection Blacklist**: If you delete an AI-detected group, the extension remembers it and won't bug you about it again.
- **Primary Marker**: Designate a "Primary" version of a question to keep your data clean and organized.

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
