import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { translations, type Lang, type Translations } from "../i18n";

interface LangCtx {
  lang: Lang;
  t: Translations;
  toggle: () => void;
}

const LanguageContext = createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem("xlwc_lang");
      if (stored === "en" || stored === "zh") return stored;
    } catch {}
    return "zh";
  });

  const toggle = useCallback(() => {
    setLang((prev) => {
      const next: Lang = prev === "zh" ? "en" : "zh";
      try { localStorage.setItem("xlwc_lang", next); } catch {}
      return next;
    });
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, t: translations[lang] as unknown as Translations, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): LangCtx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
