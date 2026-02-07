import type { ReactNode } from "react";

import "./Panel.css";

type PanelProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export const Panel = ({ title, subtitle, actions, children }: PanelProps) => (
  <section className="panel">
    <header className="panel__header">
      <div>
        <p className="panel__eyebrow">{subtitle ?? ""}</p>
        <h2 className="panel__title">{title}</h2>
      </div>
      <div className="panel__actions">{actions}</div>
    </header>
    <div className="panel__body">{children}</div>
  </section>
);
