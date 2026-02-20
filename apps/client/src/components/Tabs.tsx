import "./Tabs.css";

type TabId = "overview" | "jobs" | "live" | "agents" | "config";

type Tab = {
  id: TabId;
  title: string;
  label: string;
};

type TabsProps = {
  active: TabId;
  onChange: (id: TabId) => void;
};

const tabs: Tab[] = [
  { id: "overview", title: "Home", label: "H" },
  { id: "jobs", title: "Jobs", label: "J" },
  { id: "live", title: "Live Sessions", label: "L" },
  { id: "agents", title: "Agent Logs", label: "A" },
  { id: "config", title: "Config", label: "C" },
];

export function Tabs({ active, onChange }: TabsProps) {
  return (
    <nav className="tabs" aria-label="Console sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tabs__tab ${active === tab.id ? "tabs__tab--active" : ""}`}
          type="button"
          aria-label={tab.title}
          title={tab.title}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
