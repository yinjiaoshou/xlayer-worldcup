import { Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider, useLang } from "./contexts/LanguageContext";
import Header from "./components/Header";
import Home from "./pages/Home";
import Teams from "./pages/Teams";
import Bracket from "./pages/Bracket";
import Fantasy from "./pages/Fantasy";
import Predict from "./pages/Predict";

function AppInner() {
  const { lang } = useLang();
  const footerText = lang === "zh"
    ? "XLayer World Cup 2026 · 独立球迷项目 · 与FIFA及官方机构无关"
    : "XLayer World Cup 2026 · Independent fan project · Not affiliated with FIFA or any official body";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/bracket" element={<Bracket />} />
          <Route path="/fantasy" element={<Fantasy />} />
          <Route path="/predict" element={<Predict />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="border-t border-white/5 py-6 text-center text-white/30 text-sm">
        {footerText}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}
