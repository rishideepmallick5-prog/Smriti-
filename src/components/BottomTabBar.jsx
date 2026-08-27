// src/components/BottomTabBar.jsx
import { Home, HeartPulse, Users } from "lucide-react";
import { strings } from "../i18n/strings";
import "./BottomTabBar.css";

export default function BottomTabBar({ activeTab = "home", onTabChange, lang = "en" }) {
  const t = strings[lang] || strings.en;

  const TABS = [
    { id: "home",     Icon: Home,       label: t.nav_home },
    { id: "wellness", Icon: HeartPulse, label: t.nav_wellness },
    { id: "family",   Icon: Users,      label: t.nav_family },
  ];

  return (
    <nav className="btb-root" aria-label="Bottom Navigation">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const IconComponent = tab.Icon;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`btb-item${isActive ? " active" : ""}`}
            onClick={() => onTabChange && onTabChange(tab.id)}
            aria-label={tab.label}
            aria-selected={isActive}
          >
            <IconComponent className="btb-icon" size={20} strokeWidth={isActive ? 2.5 : 2} />
            <span className="btb-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}