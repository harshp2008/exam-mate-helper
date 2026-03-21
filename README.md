# Exammate Helper

**An Chrome extension for IB students to streamline their Exam-mate practice.**  
Exammate Helper helps declutter the ExamMate UI into a clean UI and gives you the tools to track every question you've ever attempted.

---

## Features

- **Cleans Up the UI**: Removes headers, footers, logo boxes, and sidebars so you can focus on the content.
- **Question Completion Tracking**: A built-in "Done" checkbox for every question in the sidebar. Marked questions update your local or cloud database instantly.
- **Custom Favourites**: Vipul sir's account has a lot of favourited questions and it has reached the max limit. I decided to implement a feautres where you can add your own favourites that are not affected by others favourite.
- **Firebase Cloud Sync**: If you choose to connect to a firebase DB then your progress will sync from anywhere!
- **Database Panel**: View, filter, and export your entire logged history as a JSON file.

---

## Installation (The Free Way)

Since this extension isn't on the public store (and won't cause it costs me 5 USD), here is how to install it for free using **Developer Mode**:

1. **Download & Extract**: 
   - Download the source code (or the ZIP provided by your friend).
   - Extract it into a folder on your computer.
2. **Open Extensions Menu**: 
   - In Chrome, type `chrome://extensions/` in the URL bar and hit enter.
3. **Enable Developer Mode**: 
   - In the top-right corner, toggle the **Developer mode** switch to **ON**.
4. **Load the Extension**: 
   - Click the **"Load unpacked"** button in the top-left.
   - Select the folder where you extracted the code.
5. **Pin it**: 
   - Click the puzzle icon next to your profile picture in Chrome and pin **Exammate Helper** for easy access.

---

## Connecting Your Own Firebase Database

If you want to sync your progress to the cloud instead of keeping it just on your laptop:

1. **Create a Project**: 
   - Visit the [Firebase Console](https://console.firebase.google.com/).
   - Click "Add project" and name it something like `ExammateTracker`.
2. **Get Your Keys**: 
   - In your Project Settings, scroll down to "Your apps" and add a **Web App**.
   - Note down your **Project ID** and **API Key**.
3. **Configure the Extension**: 
   - Open the Exammate Helper extension popup.
   - Click the Settings icon (⚙️).
   - Change the Storage Mode to **Firebase**.
   - Paste your **Project ID** and **API Key**.
   - Click **"Save & Verify"**.
4. **That's it!** All your "Done" questions and favourites will now live in the cloud.

