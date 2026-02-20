import type { ReactNode } from "react";

import "./Panel.css";

type PanelProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  inlineHeader?: boolean;
  children: ReactNode;
};

export const Panel = ({ title, subtitle, actions, inlineHeader = false, children }: PanelProps) => (
  <section className="panel">
    <header className={`panel__header ${inlineHeader ? "panel__header--inline" : ""}`}>
      <div>
        {subtitle ? <p className="panel__eyebrow">{subtitle}</p> : null}
        <h2 className="panel__title">{title}</h2>
      </div>
      <div className="panel__actions">{actions}</div>
    </header>
    <div className="panel__body">{children}</div>
  </section>
);
