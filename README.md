# Exammate Helper
A Chrome extension for IB students to streamline their ExamMate practice.  
Declutters the ExamMate UI and gives you the tools to track every question you've ever attempted.

---

## Features
- **Cleans Up the UI**: Removes headers, footers, logo boxes, and sidebars so you can focus on the content.
- **Question Completion Tracking**: A built-in "Done" checkbox for every question in the sidebar. Marked questions update your local or cloud database instantly.
- **Custom Favourites**: ExamMate's shared account model means favourites are shared across all users. Once the limit is hit, nobody can add more. This feature gives every user their own personal favourites list that is completely independent of the shared account.
- **Firebase Cloud Sync**: Optionally connect your own Firebase project to sync your progress across devices.
- **Database Panel**: View, filter, and export your entire logged history as a JSON file.

---

## Installation
This extension is not on the Chrome Web Store. Install it manually using Developer Mode:

1. Download the ZIP file and extract it into a folder on your computer.
2. Open Chrome and go to `chrome://extensions/`
3. Toggle **Developer Mode** on (top-right corner).
4. Click **Load unpacked** and select the extracted folder.
5. Click the puzzle icon next to your profile picture and pin **Exammate Helper**.

---

## Firebase Setup (Optional)
By default the extension stores data locally on your device. If you want cloud sync:

1. Go to [console.firebase.google.com](https://console.firebase.google.com/) and create a new project.
2. In Project Settings → Your apps → add a Web App → copy your **Project ID** and **API Key**.
3. Open the extension → Settings ⚙ → switch Storage Mode to **Firebase** → paste your keys → click **Save & Verify**.

All your done questions and favourites will sync across devices from that point.
