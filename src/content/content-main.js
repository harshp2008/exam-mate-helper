// content-main.js — Single entry point for all IB Exam Logger content script logic
import { initContentScript } from './content-init.js';
import { setupContentMessageListeners } from './content-messages.js';

// 1. Initialize message listeners
setupContentMessageListeners();

// 2. Initialize page logic (observer, UI overlays, etc.)
initContentScript();
