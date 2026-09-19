import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import LANGUAGES from "./languages";
import translations from "./translations";

const STORAGE_KEY = "rescuegrid-language";
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  function setLanguage(code) {
    setLanguageState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // localStorage unavailable (private browsing etc) — language just
      // won't persist across reloads, which is fine as a fallback.
    }
  }

  const t = useMemo(() => {
    const activeDict = translations[language] || {};
    const fallbackDict = translations.en;
    return (key) => activeDict[key] ?? fallbackDict[key] ?? key;
  }, [language]);

  const value = {
    language: language || "en",
    hasChosenLanguage: Boolean(language),
    setLanguage,
    t,
    languages: LANGUAGES
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside a LanguageProvider");
  }
  return ctx;
}