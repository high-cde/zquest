/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
/// <reference types="vite/client" />

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  initData: string;
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp };
}
