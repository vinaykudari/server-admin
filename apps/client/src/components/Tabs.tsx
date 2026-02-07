import "./Tabs.css";

type TabId = "overview" | "live";

type Tab = {
  id: TabId;
  label: string;
};

type TabsProps = {
  active: TabId;
  onChange: (id: TabId) => void;
};

const tabs: Tab[] = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Live Sessions" },
];

export function Tabs({ active, onChange }: TabsProps) {
  return (
    <nav className="tabs" aria-label="Console sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tabs__tab ${active === tab.id ? "tabs__tab--active" : ""}`}
          type="button"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
